// 三个菜单注入点:conversationMenu(侧栏会话)、messageMenu(消息更多操作)、userMenu(头像菜单)
import { U, h, Fragment, useRef, useState, useLayoutEffect, useSubscription, ErrorBoundary } from "../../u.js";
import { common, whenCommon } from "../../common.js";

const NAME = "GrokMenus";
export const MENU_SLOTS = { conversation: "conversationMenu", message: "messageMenu", user: "userMenu" };
let logger = null;
const log = () => (logger ??= new U.Logger(NAME, "#fdba74"));
const getContextMenuItems = location => U.getSlotItems(MENU_SLOTS[location]);
const subscribeContextMenu = fn => {
    const offs = Object.values(MENU_SLOTS).map(slot => U.onSlotChange(slot, fn));
    return () => offs.forEach(o => o());
};
const getContextMenuVersion = () => U.getSlotVersion();
const iconNode = icon => icon == null ? null : typeof icon === "function" ? h(icon, { size: 4 }) : icon;

function run(def, ctx) {
    try { (def.onSelect ?? def.onClick)?.(ctx); } catch (e) { log().error(`菜单项 ${def.id} 出错`, e); }
}

/** 渲染成 Grok 下拉菜单项 */
function DropdownItems({ location, ctx, getCtx }) {
    useSubscription(subscribeContextMenu);
    const items = getContextMenuItems(location);
    if (!items.length) return null;
    const Item = common.DropdownMenuItem;
    return h(Fragment, null, items.map(def => {
        const c = () => (getCtx ? getCtx() : ctx) ?? {};
        let el;
        if (def.render) el = h(def.render, c());
        else if (Item) el = h(Item, { onClick: () => run(def, c()), "data-uspp-menu-item": def.id },
            def.icon != null && h("span", { className: "inline-flex me-2 text-fg-secondary" }, iconNode(def.icon)), def.label);
        else el = h("div", { role: "menuitem", tabIndex: -1, className: "uspp-btn uspp-btn-ghost", onClick: () => run(def, c()) }, iconNode(def.icon), def.label);
        return h(ErrorBoundary, { key: def.id, fallback: null, label: `menu:${def.id}` }, el);
    }));
}

/** 消息菜单兜底:通过 fiber 找到所属回复 */
function MessageItemsFromFiber() {
    const ref = useRef(null);
    const [, setReady] = useState(0);
    useLayoutEffect(() => { setReady(1); }, []);
    const getCtx = () => {
        const f = U.walkFiberUp(U.getFiber(ref.current), f => {
            const p = f.memoizedProps;
            return p && (p.response?.responseId || (p.responseId && p.conversationId));
        }, 400);
        const p = f?.memoizedProps;
        return { response: p?.response ?? (p ? { responseId: p.responseId, conversationId: p.conversationId } : undefined) };
    };
    return h(Fragment, null, h("span", { ref, hidden: true }), h(DropdownItems, { location: "message", getCtx }));
}

// ---------- 会话菜单:并入 Grok 的 menuExtras ----------
// Grok 按 menuExtras 的引用做记忆化,所以菜单项变了就必须换一个新数组
const extrasCache = new Map(); // conversationId -> { base, ver, arr }
function conversationExtras(conversationId, base) {
    const ver = getContextMenuVersion();
    const hit = extrasCache.get(conversationId);
    if (hit && hit.base === base && hit.ver === ver) return hit.arr;
    const defs = getContextMenuItems("conversation");
    const hasPatch = U.getSlotItems(MENU_SLOTS.conversation, { all: true }).some(d => typeof d.patch === "function");
    if (!defs.length && !hasPatch) {
        extrasCache.delete(conversationId);
        return base;
    }
    const ctx = { conversationId };
    // 先让插件的 patch 改原生项,再追加插件的项
    const native = hasPatch ? U.applyMenuPatches(MENU_SLOTS.conversation, Array.isArray(base) ? base : [], ctx) : base;
    const mine = defs.map(def => ({
        id: `uspp-${def.id}`,
        icon: def.icon != null ? h("span", { className: "text-fg-secondary" }, iconNode(def.icon)) : null,
        label: def.render ? h(ErrorBoundary, { fallback: null }, h(def.render, ctx)) : def.label,
        onSelect: () => run(def, ctx),
    }));
    const arr = [...(Array.isArray(native) ? native : []), ...mine];
    extrasCache.set(conversationId, { base, ver, arr });
    if (extrasCache.size > 500) extrasCache.delete(extrasCache.keys().next().value);
    return arr;
}

// ---------- 兜底 ----------
const fallbacks = new Set();
function hookExport(name, fn) {
    const C = U.findExportedComponent(name);
    if (C) fn(C); else U.waitFor(m => typeof m[name] === "function" || (m[name] && typeof m[name] === "object"), m => fn(m[name]));
}

function enableFallback(kind) {
    if (fallbacks.has(kind)) return;
    fallbacks.add(kind);
    if (kind === "user") {
        hookExport("SignoutIcon", Signout => whenCommon(["DropdownMenuItem"], Item => {
            U.addRenderHook(Item, (props, key, render) => {
                if (typeof props.onClick !== "function") return;
                const kids = U.asArray(props.children);
                const first = kids[0];
                if (!first || first.type !== "span" || !U.treeHas(first.props?.children, el => el.type === Signout, 2)) return;
                return h(Fragment, { key }, h(DropdownItems, { location: "user", ctx: {}, key: "uspp-user-items" }), render());
            });
        }));
        U.registerInjectionFallback(NAME, "头像菜单");
    } else if (kind === "conversation") {
        hookExport("AppSidebarRow", Row => U.addRenderHook(Row, (props, key, render) => {
            const id = props.id;
            if (!id || props.route?.conversationId !== id || props.inset !== "text") return;
            return render({ ...props, menuExtras: conversationExtras(id, props.menuExtras) });
        }));
        U.registerInjectionFallback(NAME, "侧栏会话菜单");
    } else if (kind === "message") {
        hookExport("MoreDotsHorIcon", More => whenCommon(["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem"], (Menu, Content) => {
            U.addRenderHook(Menu, (props, key, render) => {
                const kids = U.asArray(props.children);
                if (kids.length !== 2) return;
                const [trigger, content] = kids;
                if (content?.type !== Content || content.props?.align !== "end") return;
                const items = U.asArray(content.props.children);
                const btn = trigger?.props?.render;
                const extra = h(MessageItemsFromFiber, { key: "uspp-message-items" });
                let nextContent = null;
                if (btn?.props?.icon === More && items.length === 1 && items[0]?.type === common.DropdownMenuItem) {
                    // 简单版:只有一个"举报"项
                    nextContent = common.cloneElement(content, null, items[0], extra);
                } else if (content.props.side === "bottom" && Array.isArray(items[0]) && items[0].some(el => el?.type === common.DropdownMenuItem)) {
                    // 列表版:第一个子元素是按配置生成的菜单项数组
                    if (items.some(el => el?.key === "uspp-message-items")) return;
                    nextContent = common.cloneElement(content, null, ...items, extra);
                }
                if (!nextContent) return;
                return render({ ...props, children: [trigger, nextContent] });
            });
        }));
        U.registerInjectionFallback(NAME, "消息更多菜单");
    }
}

let offLost = null;

export default () => U.definePlugin({
    name: NAME,
    description: "Shows plugin items in Grok's conversation, message and avatar menus.",
    authors: ["Userscript++"],
    required: true,
    hidden: true,
    // 插件停了(熔断、启动失败)时补丁里的 $self 调用:不加自己的菜单项,站点原有的照常显示
    selfFallback: {
        renderUserItems: () => null,
        conversationExtras: (_id, base) => base,
        renderMessageItems: () => null,
        messageMenuChildren: original => original,
    },
    patches: [
        {
            // 头像菜单:Sign Out 之前
            // 翻译词典模块里也有这个字符串,用第二个特征排除
            find: ['"user-dropdown.sign-out"', ".SignoutIcon"],
            replacement: {
                match: /(\(0,\i\.jsxs\)\(\i\.DropdownMenuItem,\{onClick:\i,children:\[\(0,\i\.jsx\)\("span",\{className:"inline-flex me-2 text-fg-secondary",children:\(0,\i\.jsx\)\(\i\.SignoutIcon)/,
                replace: "$self.renderUserItems(),$1",
            },
        },
        {
            // 侧栏会话的"更多"菜单和右键菜单共用 menuExtras
            find: '"ConversationItem",0,',
            replacement: {
                match: /(\.AppSidebarRow,\{\.\.\.(\i),)(extraRight:)/,
                replace: "$1menuExtras:$self.conversationExtras($2.id,$2.menuExtras),$3",
            },
        },
        {
            // 消息的"更多操作"下拉菜单末尾
            find: ['"response-action.more-actions"', "openReportDialog"],
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i\.DropdownMenuContent,\{align:"end",children:)(\(0,\i\.jsx\)\(\i\.DropdownMenuItem,\{onClick:\(\)=>\{\i\.useReportStore\.getState\(\)\.openReportDialog\(\{responseId:(\i)\.responseId[^]*?\("response-action\.report","Report"\)\}\))\}\)/,
                replace: "$1$self.messageMenuChildren($2,$3)})",
            },
        },
        {
            // 列表版"更多操作"菜单(举报、导出 PDF、朗读等按配置生成)
            find: ['"response-action.more-actions"', '"more-actions-dropdown"'],
            replacement: {
                match: /(\(0,\i\.jsxs\)\(\i\.DropdownMenuContent,\{side:"bottom",align:"end",[^]{0,300}?children:\[)(\i\.map\(\((\i),\i\)=>[^]{0,600}?responseId:(\i)\.responseId)/,
                replace: "$1$self.renderMessageItems($4),$2",
            },
        },
    ],

    renderUserItems() {
        return h(DropdownItems, { key: "uspp-user-items", location: "user", ctx: {} });
    },
    renderMessageItems(response) {
        return h(DropdownItems, { key: "uspp-message-items", location: "message", ctx: { response } });
    },
    // 原菜单只有一个子元素;包进 Fragment,避免数组子元素缺 key
    messageMenuChildren(original, response) {
        return h(Fragment, null, original, this.renderMessageItems(response));
    },
    conversationExtras,

    start() {
        offLost = U.onPatchBypassed(NAME, results => {
            for (const r of results) {
                if (r.find.includes("sign-out")) enableFallback("user");
                else if (r.find.includes("ConversationItem")) enableFallback("conversation");
                else if (r.find.includes("more-actions")) enableFallback("message");
            }
        });
    },
    stop() { offLost?.(); },
});
