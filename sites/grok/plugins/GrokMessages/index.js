// 消息相关的注入点和拦截器:messageAccessory(每条回复下方)、messageToolbar(回复操作栏)、beforeSend(发送前)
// 注意:回复容器的选择器和发送接口的地址按当前 Grok 写,还没在真实页面上验证过,改版时先查这里
import { U, h, Fragment, useRef, useState, useLayoutEffect } from "../../u.js";
import { whenCommon } from "../../common.js";

const NAME = "GrokMessages";
export const MESSAGE_SLOTS = { accessory: "messageAccessory", toolbar: "messageToolbar" };
/** 每条回复的容器:id 形如 response-<responseId> */
export const RESPONSE_SELECTOR = '[id^="response-"]';
/** 发送消息的接口:新会话、在已有会话里回复 */
export const SEND_URL = /\/rest\/app-chat\/conversations\/(?:new|[\w-]+\/responses)(?:[?#]|$)/;

const hasItems = slot => U.getSlotItems(slot).length > 0;

// ---------- messageAccessory:DOM 容器 ----------
const mounted = new Map(); // 回复元素 -> 句柄
let offObserve = null;
// 本次运行的作用域:观察器和渲染钩子经它登记,插件停止时一起撤掉;下面两个一次性标志随之复位
let scope = null;
function attach(el) {
    if (mounted.has(el)) return;
    const responseId = el.id.slice("response-".length);
    const host = document.createElement("div");
    host.setAttribute("data-uspp-message-accessory", responseId);
    host.className = "uspp-message-accessory";
    U.mount(el, host);
    mounted.set(el, U.renderSlot(MESSAGE_SLOTS.accessory, host, { responseId, element: el }));
}
function syncAccessory() {
    if (hasItems(MESSAGE_SLOTS.accessory)) {
        offObserve ??= scope?.observe(RESPONSE_SELECTOR, { added: attach, removed: el => { mounted.get(el)?.unmount(); mounted.delete(el); } }) ?? null;
    } else if (offObserve) {
        offObserve(); offObserve = null;
        for (const [el, x] of mounted) { x.unmount(); el.querySelector(":scope > [data-uspp-message-accessory]")?.remove(); }
        mounted.clear();
    }
}

// ---------- messageToolbar:放在回复"更多操作"按钮前面 ----------
function ToolbarItems() {
    const ref = useRef(null);
    const [ctx, setCtx] = useState(null);
    useLayoutEffect(() => {
        const f = U.walkFiberUp(U.getFiber(ref.current), f => {
            const p = f.memoizedProps;
            return p && (p.response?.responseId || (p.responseId && p.conversationId));
        }, 400);
        const p = f?.memoizedProps;
        setCtx({ response: p?.response ?? (p ? { responseId: p.responseId, conversationId: p.conversationId } : undefined) });
    }, []);
    return h(Fragment, null, h("span", { ref, hidden: true }), ctx && h(U.SlotOutlet, { slot: MESSAGE_SLOTS.toolbar, ctx }));
}
let toolbarHooked = false;
function hookToolbar() {
    if (toolbarHooked) return;
    toolbarHooked = true;
    const own = scope;
    const install = More => whenCommon(["DropdownMenu"], Menu => {
        if (!own || own.disposed) return;
        own.addRenderHook(Menu, (props, key, render) => {
            if (!hasItems(MESSAGE_SLOTS.toolbar)) return undefined;
            const [trigger] = U.asArray(props.children);
            if (trigger?.props?.render?.props?.icon !== More) return undefined;
            return h(Fragment, { key }, h(ToolbarItems, { key: "uspp-message-toolbar" }), render());
        });
    });
    const More = U.findExportedComponent("MoreDotsHorIcon");
    if (More) install(More); else U.waitFor(m => typeof m.MoreDotsHorIcon === "function", m => install(m.MoreDotsHorIcon));
}

// ---------- beforeSend ----------
/** 只有登记了 beforeSend 拦截器时才处理发送请求;没有时匹配函数返回 false,请求照常直接发出 */
const sendMatcher = (url, method) => method === "POST" && U.hasInterceptors("beforeSend") && SEND_URL.test(url);
async function rewriteSend(ctx) {
    let body;
    try { body = ctx.json(); } catch { return undefined; }
    if (!body || typeof body.message !== "string") return undefined;
    const conv = /conversations\/([\w-]+)\/responses/.exec(ctx.url)?.[1] ?? null;
    const r = await U.runInterceptors("beforeSend", { text: body.message, conversationId: conv === "new" ? null : conv, body });
    if (r.cancelled) {
        U.showToast(`Message not sent (${r.by}).`, "INFO");
        return { block: true };
    }
    if (r.value?.text === body.message) return undefined;
    return { body: { ...body, message: String(r.value?.text ?? body.message) } };
}

export default () => U.definePlugin({
    name: NAME,
    description: "Message accessories, message toolbar buttons and the beforeSend interceptor on Grok.",
    authors: ["Userscript++"],
    required: true,
    hidden: true,
    start(ctx) {
        scope = ctx;
        ctx.register(() => {
            if (scope === ctx) scope = null;
            offObserve = null;
            toolbarHooked = false;
            for (const [el, x] of mounted) { x.unmount(); el.querySelector(":scope > [data-uspp-message-accessory]")?.remove(); }
            mounted.clear();
        });
        ctx.onSlotChange(MESSAGE_SLOTS.accessory, syncAccessory);
        syncAccessory();
        ctx.onSlotChange(MESSAGE_SLOTS.toolbar, () => { if (hasItems(MESSAGE_SLOTS.toolbar)) hookToolbar(); });
        if (hasItems(MESSAGE_SLOTS.toolbar)) hookToolbar();
        ctx.rewriteRequest(sendMatcher, rewriteSend);
    },
});
