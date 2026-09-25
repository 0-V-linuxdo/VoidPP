/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { FrameIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import { ChatPageStore } from "@turbopack/common/stores";
import { filters, findByPropsLazy, waitFor } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const logger = new Logger("BetterCanvas");

const STYLE_NAME = "betterCanvas";
const FRAME_STYLE_ID = "void-better-canvas";
const MSG = "void-better-canvas";
const MSG_HELLO = "void-better-canvas-hello";

const PANE = '[class*="pane-card"],[class*="masonry"],[class*="lightbox"]';
const OVERFLOW = '[class*="overflow-auto"],[class*="overflow-y-auto"],[class*="overflow-x-auto"],[class*="overflow-scroll"],[class*="overflow-y-scroll"],[class*="overflow-x-scroll"]';
const SCROLLER = `:is(${PANE}):is(${OVERFLOW}),:is(${PANE}) :is(${OVERFLOW}),main:has([aria-label="Generation mode"]) :is(${OVERFLOW})`;
const IFRAME_SEL = 'iframe[title="Preview"],iframe[src*="grokusercontent.com"],iframe[src*="grok-sandbox.com"],[class*="pane-card"] iframe';

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

interface WorkspaceHook {
    getState: () => {
        canvasExpanded?: boolean;
        toggleCanvas?: (open: boolean, opts?: { animate?: boolean }) => void;
    };
    subscribe: (listener: () => void) => () => void;
}

const WorkspaceStore = findByPropsLazy("useWorkspaceStore") as { useWorkspaceStore?: WorkspaceHook };

let domObs: MutationObserver | null = null;
let themeObs: MutationObserver | null = null;
let unsubWorkspace: (() => void) | null = null;
let cancelWorkspaceWait: (() => void) | null = null;
let collapsing = false;
const hooked = new WeakSet<HTMLIFrameElement>();

export function isGrokPreviewFrame() {
    const host = location.hostname;
    return host === "grok-sandbox.com"
        || host.endsWith(".grok-sandbox.com")
        || host === "artifacts.grokusercontent.com"
        || host.endsWith(".grokusercontent.com");
}

function isDark() {
    try {
        const scheme = getComputedStyle(document.documentElement).colorScheme.trim().toLowerCase();
        if (scheme === "dark" || scheme.startsWith("dark ")) return true;
        if (scheme === "light" || scheme.startsWith("light ")) return false;
    } catch {
        void 0;
    }
    const html = document.documentElement;
    if (html.classList.contains("dark")) return true;
    if (html.classList.contains("light")) return false;
    if (html.classList.contains("scheme-light") && !html.classList.contains("dark")) return false;
    const tokens = `${html.className} ${document.body?.className ?? ""} ${html.getAttribute("data-theme") ?? ""} ${html.getAttribute("data-color-scheme") ?? ""}`.toLowerCase();
    return html.getAttribute("data-theme") === "dark" || /(^|[\s_-])(dark|night)([\s_-]|$)/.test(tokens);
}

function tokenColor(name: string, darkFallback: string, lightFallback: string) {
    let raw = "";
    try {
        raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch {
        raw = "";
    }
    if (!raw) return isDark() ? darkFallback : lightFallback;
    if (/^(?:#|rgba?\(|hsla?\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|var\()/i.test(raw)) return raw;
    return `hsl(${raw})`;
}

function parentCss() {
    const thumb = tokenColor("--border-l2", "#4a4a52", "#c4c4cc");
    const hover = tokenColor("--fg-tertiary", "#9a9aa3", "#8a8a94");
    const track = tokenColor("--surface-l1", "#141416", "#f4f4f5");
    const scheme = isDark() ? "dark" : "light";
    // A comma list only attaches a trailing pseudo to the last clause.
    // Wrap so width/radius/thumb colors stay on the scrollbar, not the Settings form.
    const root = `:is(${SCROLLER})`;
    return `
${IFRAME_SEL} {
    color-scheme: ${scheme} !important;
}

${SCROLLER} {
    color-scheme: ${scheme} !important;
    scrollbar-width: thin !important;
    scrollbar-color: ${thumb} ${track} !important;
}

${root}::-webkit-scrollbar {
    width: 0.5rem !important;
    height: 0.5rem !important;
}

${root}::-webkit-scrollbar-track,
${root}::-webkit-scrollbar-corner {
    background: ${track} !important;
}

${root}::-webkit-scrollbar-thumb {
    background-color: ${thumb} !important;
    background-clip: padding-box !important;
    border: 0.125rem solid transparent !important;
    border-radius: 999px !important;
}

${root}::-webkit-scrollbar-thumb:hover {
    background-color: ${hover} !important;
}
`;
}

function frameCss(dark: boolean) {
    const thumb = dark ? "#4a4a52" : "#c4c4cc";
    const track = dark ? "#141416" : "#f4f4f5";
    const hover = dark ? "#9a9aa3" : "#8a8a94";
    const scheme = dark ? "dark" : "light";
    return `html,body,:root{color-scheme:${scheme}!important}`
        + `*{scrollbar-width:thin!important;scrollbar-color:${thumb} ${track}!important}`
        + "*::-webkit-scrollbar{width:.5rem!important;height:.5rem!important}"
        + `*::-webkit-scrollbar-track,*::-webkit-scrollbar-corner{background:${track}!important}`
        + `*::-webkit-scrollbar-thumb{background-color:${thumb}!important;background-clip:padding-box!important;border:.125rem solid transparent!important;border-radius:999px!important}`
        + `*::-webkit-scrollbar-thumb:hover{background-color:${hover}!important}`;
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

let frameObs: MutationObserver | null = null;
let frameDark = false;
let frameReady = false;

function paintSrcdoc(iframe: HTMLIFrameElement, dark: boolean) {
    let src = "";
    try {
        src = iframe.getAttribute("srcdoc") || iframe.srcdoc || "";
    } catch {
        return;
    }
    if (!src) return;
    const scheme = dark ? "dark" : "light";
    if (src.includes(`id="${FRAME_STYLE_ID}"`) && src.includes(`color-scheme:${scheme}`)) return;
    const inject = `<meta name="color-scheme" content="${scheme}"><style id="${FRAME_STYLE_ID}">${frameCss(dark)}</style>`;
    const stripped = src
        .replaceAll(/<meta\s+name=["']color-scheme["'][^>]*>/gi, "")
        .replaceAll(/<style\s+id=["']void-better-canvas["']>[\s\S]*?<\/style>/gi, "");
    try {
        iframe.srcdoc = inject + stripped;
    } catch {
        void 0;
    }
}

function paintFrameTree(dark: boolean) {
    frameDark = dark;
    frameReady = true;
    const visit = (doc: Document) => {
        applyToDocument(doc, dark);
        doc.querySelectorAll("iframe").forEach(frame => {
            paintSrcdoc(frame, dark);
            try {
                if (frame.contentDocument) visit(frame.contentDocument);
            } catch {
                void 0;
            }
        });
    };
    visit(document);
}

function framePrefersDark() {
    try {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
    } catch {
        void 0;
    }
    return isDark();
}

export function bootstrapPreviewFrame() {
    window.addEventListener("message", onFrameMessage);
    paintFrameTree(framePrefersDark());
    if (!frameObs) {
        frameObs = new MutationObserver(records => {
            if (!frameReady) return;
            const dirty = records.some(record => {
                if (record.type === "attributes") return record.attributeName === "srcdoc";
                return [...record.addedNodes].some(node =>
                    node instanceof Element && (node.tagName === "IFRAME" || !!node.querySelector("iframe")),
                );
            });
            if (dirty) paintFrameTree(frameDark);
        });
        frameObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["srcdoc"] });
    }
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
        frameReady = false;
        clearDocument(document);
        return;
    }
    paintFrameTree(data.dark === true);
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

function replyFrame(src: Window, payload: { type: string; dark?: boolean; off?: boolean }) {
    try {
        src.postMessage(payload, "*");
    } catch {
        void 0;
    }
}

function onParentMessage(event: MessageEvent) {
    const { data } = event;
    if (!data || data.type !== MSG_HELLO) return;
    const src = event.source as Window | null;
    if (!src) return;
    if (!settings.store.themedScrollbar) {
        replyFrame(src, { type: MSG, off: true });
        return;
    }
    replyFrame(src, { type: MSG, dark: isDark() });
}

function refreshScrollbar() {
    registerStyle(STYLE_NAME, parentCss());
    scanIframes();
}

function startScrollbar() {
    refreshScrollbar();
    if (domObs) return;
    domObs = new MutationObserver(scanIframes);
    domObs.observe(document.documentElement, { childList: true, subtree: true });
    themeObs = new MutationObserver(refreshScrollbar);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-color-scheme", "style"] });
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

function callFn(fn: unknown, thisArg: unknown): boolean {
    if (typeof fn !== "function") return false;
    fn.call(thisArg);
    return true;
}

function collapseCanvas() {
    if (collapsing || !settings.store.hideRightPanel) return;
    try {
        const hook = WorkspaceStore.useWorkspaceStore;
        if (!hook?.getState) return;
        const state = hook.getState();
        if (!state.canvasExpanded || typeof state.toggleCanvas !== "function") return;
        collapsing = true;
        state.toggleCanvas(false, { animate: false });
    } catch (e) {
        logger.debug("hide canvas failed", e);
    } finally {
        collapsing = false;
    }
}

function enforce() {
    if (!settings.store.hideRightPanel) return;
    collapseCanvas();
    try {
        const hook = ChatPageStore.useChatPageStore;
        if (!hook || typeof hook.getState !== "function") return;
        const state = hook.getState();
        if (!isRightOpen(state)) return;
        const api = hook as typeof hook & {
            closeSidePanelExplicitly?: () => void;
            closeSidePanel?: () => void;
        };
        if (callFn(state.closeSidePanelExplicitly, state)) return;
        if (callFn(api.closeSidePanelExplicitly, api)) return;
        if (callFn(state.closeSidePanel, state)) return;
        if (callFn(api.closeSidePanel, api)) return;
        state.setSidePanelContent?.(null);
    } catch (e) {
        logger.debug("hide right panel failed", e);
    }
}

function bindWorkspace(mod?: { useWorkspaceStore?: WorkspaceHook }) {
    if (unsubWorkspace) return;
    const hook = mod?.useWorkspaceStore ?? WorkspaceStore.useWorkspaceStore;
    if (!hook?.subscribe) return;
    unsubWorkspace = hook.subscribe(() => collapseCanvas());
    collapseCanvas();
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
        bindWorkspace();
        if (!unsubWorkspace) cancelWorkspaceWait = waitFor(filters.byProps("useWorkspaceStore"), bindWorkspace);
        apply();
    },

    onSettingsChange: apply,

    stop() {
        window.removeEventListener("message", onParentMessage);
        cancelWorkspaceWait?.();
        cancelWorkspaceWait = null;
        unsubWorkspace?.();
        unsubWorkspace = null;
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
            find: 'source:"auto"',
            all: true,
            replacement: {
                match: /&&(\i)\(\{source:"auto"\}\)/,
                replace: "&&!$self.settings.store.hideRightPanel&&$1({source:\"auto\"})",
            },
        },
    ],
});
