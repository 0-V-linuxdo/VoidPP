// chatBar 注入点:主输入框和 Imagine 输入栏的工具条(补丁挂载,被绕过时用渲染钩子兜底)
import { U, h, Fragment, useState, useRef, useEffect, useSubscription, slotSubscriber, ErrorBoundary } from "../../u.js";
import { common } from "../../common.js";

const NAME = "GrokChatBar";
const SLOT = "chatBar";
const val = v => typeof v === "function" ? v() : v;
// 节点或返回节点的函数;在渲染期间调用
const nodeOf = v => v == null ? null : typeof v === "function" ? v() : v;

function Popover({ anchor, content, onClose }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    useEffect(() => {
        const r = anchor.getBoundingClientRect();
        setPos({ left: Math.max(8, Math.min(r.left, innerWidth - 260)), bottom: innerHeight - r.top + 8 });
        const onDown = e => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
        const onKey = e => { if (e.key === "Escape") onClose(); };
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
    }, []);
    const RD = common.ReactDOM;
    const el = h("div", { ref, className: "uspp-popover", style: pos ? { left: pos.left, bottom: pos.bottom } : { visibility: "hidden" } }, content);
    return RD?.createPortal ? RD.createPortal(el, document.body) : el;
}

function ChatBarButton({ def }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const disabled = !!val(def.disabled);
    const active = !!val(def.active);
    const icon = nodeOf(def.icon);
    const tooltip = nodeOf(def.tooltip);
    const label = def["aria-label"] ?? (typeof tooltip === "string" ? tooltip : def.id);
    const onClick = e => {
        try { (def.onClick ?? def.onSelect)?.(e); } catch (err) { console.error(`[${U.scriptName}] 聊天栏按钮 onClick 出错`, err); }
        if (def.popover) setOpen(o => !o);
    };
    const IB = common.IconButton;
    const fallback = h("button", {
        ref, type: "button", className: U.classes("uspp-chatbar-btn", def.className), "data-active": String(active),
        "aria-label": label, title: typeof tooltip === "string" ? tooltip : undefined, disabled, onClick,
    }, icon ?? def.label);
    const btn = IB ? h("span", { ref, style: { display: "inline-flex" } }, h(ErrorBoundary, { fallback }, h(IB, {
        variant: def.variant ?? "ghost", size: def.size ?? "lg", shape: def.shape ?? "circle",
        "aria-label": label, tooltip: tooltip ? { content: tooltip } : undefined, disabled, onClick,
        "aria-pressed": active || undefined, className: def.className, "data-uspp-chatbar-button": def.id,
    }, icon ?? def.label))) : fallback;
    return h(Fragment, null, btn, open && ref.current && h(Popover, { anchor: ref.current, content: nodeOf(def.popover), onClose: () => setOpen(false) }));
}

const subscribeChatBar = slotSubscriber(SLOT);
/** locations 缺省为 ["chat"] */
const buttonsAt = location => U.getSlotItems(SLOT).filter(b => (b.locations && b.locations.length ? b.locations : ["chat"]).includes(location));

function ChatBarButtons({ location }) {
    useSubscription(subscribeChatBar);
    const buttons = buttonsAt(location);
    if (!buttons.length) return null;
    return h("div", { className: "uspp-chatbar", "data-uspp-chatbar": location },
        buttons.map(b => h(ErrorBoundary, { key: b.id, fallback: null, label: `chatbar:${b.id}` }, h(ChatBarButton, { def: b }))));
}

const fallbacks = { chat: false, imagine: false };
function enableFallback(kind) {
    if (fallbacks[kind]) return;
    fallbacks[kind] = true;
    if (kind === "chat") {
        const attach = ModeSelect => U.addRenderHook(ModeSelect, (props, key, render) => {
            // 只作用于主输入框的模式选择器(带快捷键、非桌面版)
            if (props.enableModeSwitchHotkey !== true || props.desktop !== undefined) return;
            return h(Fragment, { key }, render(), h(ChatBarButtons, { location: "chat", key: "uspp-chatbar-chat" }));
        });
        const C = U.findExportedComponent("ModeSelect");
        if (C) attach(C); else U.waitFor(m => typeof m.ModeSelect === "function", m => attach(m.ModeSelect));
        U.registerInjectionFallback(NAME, "主输入框");
    } else {
        const attach = Toolbar => U.addRenderHook(Toolbar, (props, key, render) =>
            render({ ...props, children: [props.children, h(ChatBarButtons, { location: "imagine", key: "uspp-chatbar-imagine" })] }));
        const C = U.findExportedComponent("ImagineToolbar");
        if (C) attach(C); else U.waitFor(m => typeof m.ImagineToolbar === "function", m => attach(m.ImagineToolbar));
        U.registerInjectionFallback(NAME, "Imagine 输入栏");
    }
}

let offLost = null;

export default () => U.definePlugin({
    name: NAME,
    description: "Shows plugin buttons in the Grok composer and the Imagine prompt bar.",
    authors: ["Userscript++"],
    required: true,
    hidden: true,
    // 插件停了时不渲染按钮条(缺省会原样交还第一个参数 "chat",把字符串渲染到页面上)
    selfFallback: { renderChatBar: () => null },
    patches: [
        {
            find: '"data-query-bar-mode-select":!0',
            replacement: {
                match: /("data-query-bar-mode-select":!0,[^]{0,900}?\},"mode-select"\),)/,
                replace: '$1$self.renderChatBar("chat"),',
            },
        },
        {
            // Imagine 页面的分块只在进入 Imagine 时加载,其他页面找不到属正常
            find: '"ImagineToolbar",0,',
            noWarn: true,
            replacement: {
                match: /(\(0,\i\.jsxs\)\(\i,\{collapsed:\i,children:\[(?:\i,){3,15}\i)\]\}\)/,
                replace: '$1,$self.renderChatBar("imagine")]})',
            },
        },
    ],

    renderChatBar(location) {
        return h(ErrorBoundary, { key: `uspp-chatbar-${location}`, fallback: null, label: "chatbar" }, h(ChatBarButtons, { location }));
    },

    start() {
        // 提前挂好框架的界面根,弹窗第一次打开时不用等
        U.ensureUiRoot();
        offLost = U.onPatchBypassed(NAME, results => {
            for (const r of results) enableFallback(r.find.includes("ImagineToolbar") ? "imagine" : "chat");
        });
    },
    stop() {
        offLost?.();
    },
});

