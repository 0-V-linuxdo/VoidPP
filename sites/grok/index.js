// Void++ grok adapter on Userscript++. Public API is the factory parameter U.
import { bindApi } from "./u.js";
import { common } from "./common.js";
import { startStreamEvents } from "./stream.js";
import { settingsHost, installSettingsFallbacks } from "./settings-host.js";
import { MENU_SLOTS } from "./plugins/GrokMenus/index.js";
import { GROK_CSS } from "./styles.js";
import { migrateVoidSettings } from "./migrate.js";

const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

function aliasVoid(U) {
    const w = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;
    const api = w.VoidPP || U;
    if (api && !w.Void) {
        try {
            Object.defineProperty(w, "Void", { value: api, writable: false, configurable: true, enumerable: false });
        } catch {
            w.Void = api;
        }
    }
}

export default U => {
    bindApi(U);
    migrateVoidSettings();
    const menuSlot = location => {
        const slot = MENU_SLOTS[location];
        if (!slot) throw new Error(`未知的菜单位置:${location}`);
        return slot;
    };
    return U.defineSite({
        id: "grok",
        name: "Grok",
        matches: [
            "*://grok.com/*",
            "*://*.grok-sandbox.com/*",
            "*://artifacts.grokusercontent.com/*",
            "*://*.grokusercontent.com/*",
        ],
        driver: "turbopack",
        driverOptions: { chunkPath: "/_next/static/chunks/" },
        ready: { module: m => typeof m?.useRoutingStore === "function", timeout: 15000 },
        styleHost: "element",
        legacySettings: true,
        theme: () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
        renderer() {
            const React = common.React, client = common.ReactDOMClient, dom = common.ReactDOM;
            if (!React || typeof client?.createRoot !== "function") return null;
            return { React, createRoot: el => client.createRoot(el), createPortal: dom?.createPortal, flushSync: dom?.flushSync ?? (fn => fn()) };
        },
        components: name => (name === "toast" ? common.Toaster : common[name]) ?? null,
        common,
        events: ["streamEnd"],
        slots: [
            { name: "chatBar", kind: "button", context: "点击事件;按钮可用 locations: [\"chat\", \"imagine\"] 选择出现在哪个输入栏" },
            { name: "conversationMenu", kind: "menu", patch: true, context: "{ conversationId }" },
            { name: "messageMenu", kind: "menu", context: "{ response }" },
            { name: "userMenu", kind: "menu", context: "{}" },
            { name: "messageAccessory", kind: "render", context: "{ responseId, element }" },
            { name: "messageToolbar", kind: "button", context: "{ response }" },
        ],
        interceptors: ["beforeSend"],
        settingsHost,
        pluginAliases: {
            chatBarButton: v => ({ chatBar: v }),
            contextMenuItems: v => Object.fromEntries(Object.entries(MENU_SLOTS).map(([loc, slot]) => [slot, asList(v?.[loc])]).filter(([, l]) => l.length)),
        },
        api: {
            common,
            addChatBarButton: (id, def) => U.addSlotItem("chatBar", id, def),
            removeChatBarButton: id => U.removeSlotItem("chatBar", id),
            addContextMenuItem: (location, id, def) => U.addSlotItem(menuSlot(location), id, def),
            removeContextMenuItem: (location, id) => U.removeSlotItem(menuSlot(location), id),
        },
        start() {
            aliasVoid(U);
            U.registerStyle("uspp-grok", GROK_CSS);
            startStreamEvents();
            installSettingsFallbacks();
        },
    });
};
