/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { FrameIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import { ChatPageStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const STYLE_NAME = "betterCanvas";
const FRAME_STYLE_ID = "void-better-canvas";
const MSG = "void-better-canvas";
const MSG_HELLO = "void-better-canvas-hello";

const SCROLLER = ':is([class*="pane-card"],[class*="masonry"],[class*="lightbox"]) :is([class*="overflow-auto"],[class*="overflow-y-auto"],[class*="overflow-scroll"],[class*="overflow-y-scroll"]),main:has([aria-label="Generation mode"]) :is([class*="overflow-auto"],[class*="overflow-y-auto"],[class*="overflow-scroll"],[class*="overflow-y-scroll"])';
const IFRAME_SEL = 'iframe[title="Preview"], [class*="pane-card"] iframe';

const THUMB = "hsl(var(--border-l2))";
const THUMB_HOVER = "hsl(var(--fg-tertiary))";
const TRACK = "hsl(var(--surface-l1))";

const CSS = `
${SCROLLER} {
    scrollbar-width: thin !important;
    scrollbar-color: ${THUMB} ${TRACK} !important;
}

${SCROLLER}::-webkit-scrollbar {
    width: 0.5rem !important;
    height: 0.5rem !important;
}

${SCROLLER}::-webkit-scrollbar-track,
${SCROLLER}::-webkit-scrollbar-corner {
    background: ${TRACK} !important;
}

${SCROLLER}::-webkit-scrollbar-thumb {
    background-color: ${THUMB} !important;
    background-clip: padding-box !important;
    border: 0.125rem solid transparent !important;
    border-radius: 999px !important;
}

${SCROLLER}::-webkit-scrollbar-thumb:hover {
    background-color: ${THUMB_HOVER} !important;
}
`;

const settings = definePluginSettings({
    themedScrollbar: {
        type: OptionType.BOOLEAN,
        description: "Make project pane and Imagine masonry scrollbars follow Grok's light and dark theme.",
        default: true,
    },
    hideRightPanel: {
        type: OptionType.BOOLEAN,
        description: "Keep Grok's right panel closed, including auto-open and restore.",
        default: false,
    },
});

let domObs: MutationObserver | null = null;
let themeObs: MutationObserver | null = null;
const hooked = new WeakSet<HTMLIFrameElement>();

export function isGrokPreviewFrame() {
    const host = location.hostname;
    return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}

function isDark() {
    const html = document.documentElement;
    const tokens = `${html.className} ${document.body?.className ?? ""} ${html.getAttribute("data-theme") ?? ""} ${html.getAttribute("data-color-scheme") ?? ""}`.toLowerCase();
    return html.classList.contains("dark") || html.getAttribute("data-theme") === "dark" || /(^|[\s_-])(dark|night)([\s_-]|$)/.test(tokens);
}

function frameCss(dark: boolean) {
    const thumb = dark ? "#4a4a52" : "#c4c4cc";
    const track = dark ? "#141416" : "#f4f4f5";
    const hover = dark ? "#9a9aa3" : "#8a8a94";
    return `html,body{scrollbar-width:thin!important;scrollbar-color:${thumb} ${track}!important}`
        + "html::-webkit-scrollbar,body::-webkit-scrollbar{width:.5rem!important;height:.5rem!important}"
        + `html::-webkit-scrollbar-track,body::-webkit-scrollbar-track,html::-webkit-scrollbar-corner,body::-webkit-scrollbar-corner{background:${track}!important}`
        + `html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background-color:${thumb}!important;background-clip:padding-box!important;border:.125rem solid transparent!important;border-radius:999px!important}`
        + `html::-webkit-scrollbar-thumb:hover,body::-webkit-scrollbar-thumb:hover{background-color:${hover}!important}`;
}

function applyToDocument(doc: Document, dark: boolean) {
    let el = doc.getElementById(FRAME_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = doc.createElement("style");
        el.id = FRAME_STYLE_ID;
        (doc.head ?? doc.documentElement).appendChild(el);
    }
    el.textContent = frameCss(dark);
}

function clearDocument(doc: Document) {
    doc.getElementById(FRAME_STYLE_ID)?.remove();
}

export function bootstrapPreviewFrame() {
    applyToDocument(document, matchMedia("(prefers-color-scheme: dark)").matches);
    window.addEventListener("message", onFrameMessage);
    try {
        window.parent.postMessage({ type: MSG_HELLO }, "*");
    } catch {
        void 0;
    }
}

function onFrameMessage(event: MessageEvent) {
    const { data } = event;
    if (!data || data.type !== MSG) return;
    if (data.off) {
        clearDocument(document);
        return;
    }
    applyToDocument(document, data.dark === true);
}

function postIframe(iframe: HTMLIFrameElement, payload: { type: string; dark?: boolean; off?: boolean }) {
    try {
        iframe.contentWindow?.postMessage(payload, "*");
    } catch {
        void 0;
    }
}

function paintIframe(iframe: HTMLIFrameElement) {
    if (!settings.store.themedScrollbar) return;
    const dark = isDark();
    try {
        const doc = iframe.contentDocument;
        if (doc) applyToDocument(doc, dark);
    } catch {
        void 0;
    }
    postIframe(iframe, { type: MSG, dark });
}

function clearIframe(iframe: HTMLIFrameElement) {
    try {
        const doc = iframe.contentDocument;
        if (doc) clearDocument(doc);
    } catch {
        void 0;
    }
    postIframe(iframe, { type: MSG, off: true });
}

function hookIframe(iframe: HTMLIFrameElement) {
    paintIframe(iframe);
    if (hooked.has(iframe)) return;
    hooked.add(iframe);
    iframe.addEventListener("load", () => paintIframe(iframe));
}

function scanIframes() {
    document.querySelectorAll<HTMLIFrameElement>(IFRAME_SEL).forEach(hookIframe);
}

function clearIframes() {
    document.querySelectorAll<HTMLIFrameElement>(IFRAME_SEL).forEach(clearIframe);
}

function replyFrame(src: Window, origin: string, payload: { type: string; dark?: boolean; off?: boolean }) {
    try {
        src.postMessage(payload, origin === "null" ? "*" : origin);
    } catch {
        src.postMessage(payload, "*");
    }
}

function onParentMessage(event: MessageEvent) {
    const { data } = event;
    if (!data || data.type !== MSG_HELLO) return;
    const src = event.source as Window | null;
    if (!src) return;
    if (!settings.store.themedScrollbar) {
        replyFrame(src, event.origin, { type: MSG, off: true });
        return;
    }
    replyFrame(src, event.origin, { type: MSG, dark: isDark() });
}

function startScrollbar() {
    registerStyle(STYLE_NAME, CSS);
    scanIframes();
    if (domObs) return;
    domObs = new MutationObserver(scanIframes);
    domObs.observe(document.documentElement, { childList: true, subtree: true });
    themeObs = new MutationObserver(scanIframes);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-color-scheme"] });
}

function stopScrollbar() {
    unregisterStyle(STYLE_NAME);
    clearIframes();
    domObs?.disconnect();
    themeObs?.disconnect();
    domObs = null;
    themeObs = null;
}

function isRightOpen(s: ChatPageStoreState) {
    return s.sidePanelContent?.type === "rightPanel";
}

function enforce() {
    if (!settings.store.hideRightPanel) return;
    const state = ChatPageStore.useChatPageStore.getState();
    if (isRightOpen(state)) state.closeSidePanelExplicitly();
}

function apply() {
    if (settings.store.themedScrollbar) startScrollbar();
    else stopScrollbar();
    enforce();
}

export default definePlugin({
    name: "BetterCanvas",
    icon: FrameIcon,
    description: "Theme the project pane and Imagine masonry scrollbars and optionally keep the right panel closed.",
    authors: [Devs.p],
    tags: ["ui"],
    enabledByDefault: true,
    startAt: StartAt.TurbopackReady,
    settings,

    start() {
        window.addEventListener("message", onParentMessage);
        apply();
    },

    onSettingsChange: apply,

    stop() {
        window.removeEventListener("message", onParentMessage);
        stopScrollbar();
    },

    zustand: {
        ChatPageStore: {
            selector: isRightOpen,
            handler(open: boolean) {
                if (open) enforce();
            },
        },
    },

    patches: [
        {
            find: "willRestoreRightPanelByIntent",
            replacement: {
                match: /willRestoreRightPanelByIntent=(\i)=>\{/,
                replace: "willRestoreRightPanelByIntent=$1=>{if($self.settings.store.hideRightPanel)return!1;",
            },
        },
        {
            find: '"computePreviewAutoOpen"',
            replacement: {
                match: /&&(\i)\(\{source:"auto"\}\)/,
                replace: "&&!$self.settings.store.hideRightPanel&&$1({source:\"auto\"})",
            },
        },
    ],
});
