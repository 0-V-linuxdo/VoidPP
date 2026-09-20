/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { VoidPPEventMap } from "@api/Events";
import { definePluginSettings } from "@api/Settings";
import { AppWindowIcon } from "@components/icons";
import type { GrokResponse } from "@grok-types";
import { ChatPageStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";

import {
    contextKeyFromUrl,
    conversationToken,
    EDITOR_SEL,
    getActiveEditor,
    getComposerRoot,
    getStopButton,
    isChatSurface,
    isInputEmpty,
    isStopControl,
    submitIsGray,
} from "./detect";
import { buildIcons, DEFAULT_STYLE, type FaviconKind, type IconStyle, isIconStyle, STYLE_OPTIONS } from "./icons";

const logger = new Logger("ChatStateFavicons");
const ICON_ID = "void-chat-state-favicon";
const LIVE_RESPONSE = new Set(["streaming", "optimistic", "reconnecting", "in_progress", "in-progress"]);
const DEAD_RESPONSE = new Set(["closed", "error", "done", "completed", "complete", "cancelled", "canceled", "aborted", "idle", "success", "worked", "failed", "interrupted", "stopped", "stream-error", "send-error"]);
const USER_INTERRUPT = /interrupted by the user|user[- ]interrupt|aborted by the user|cancelled by the user|canceled by the user|请求被用户中断|被用户打断/i;

const settings = definePluginSettings({
    style: {
        type: OptionType.SELECT,
        description: "How the Grok mark is overlaid with chat state.",
        options: STYLE_OPTIONS,
    },
});

let officialHref = "/images/favicon.svg";
let icons = buildIcons(DEFAULT_STYLE, officialHref);
let kind: FaviconKind = "wait";
let wasStreaming = false;
let justFinished = false;
let streamContext: string | null = null;
let lockedToken = "";
let lastWasError = false;
let lastConvId = "";
let primedReady = true;
let faviconObs: MutationObserver | null = null;
let globalObs: MutationObserver | null = null;
let composerObs: MutationObserver | null = null;
let buttonObs: MutationObserver | null = null;
let inputCtrl: AbortController | null = null;
let unsubRoute: (() => void) | null = null;
let unsubRoutePage: (() => void) | null = null;
let unsubPage: (() => void) | null = null;
let unsubStream: (() => void) | null = null;
let unsubResponse: (() => void) | null = null;
let raf = 0;
let started = false;
let watching = false;

function currentStyle(): IconStyle {
    const value = settings.store.style;
    return isIconStyle(value) ? value : DEFAULT_STYLE;
}

function captureOfficial(): string {
    const existing = document.querySelector<HTMLLinkElement>(`link[rel~="icon"]:not(#${ICON_ID})`);
    const href = existing?.href;
    if (href && !href.startsWith("data:")) return href;
    return `${location.origin}/images/favicon.svg`;
}

function isIconLink(node: Node): node is HTMLLinkElement {
    return node instanceof HTMLLinkElement && (node.relList.contains("icon") || /\bicon\b/i.test(node.rel));
}

function stripCompetitors() {
    const { head } = document;
    if (!head) return;
    for (const node of head.querySelectorAll("link")) {
        if (node.id !== ICON_ID && isIconLink(node)) node.remove();
    }
}

function applyHref(href: string) {
    const { head } = document;
    if (!head) return;
    stripCompetitors();
    let link = document.getElementById(ICON_ID) as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement("link");
        link.id = ICON_ID;
        link.rel = "icon shortcut icon";
        link.type = "image/svg+xml";
        link.setAttribute("sizes", "any");
        head.prepend(link);
    } else if (head.firstChild !== link) {
        head.prepend(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

function setKind(next: FaviconKind) {
    kind = next;
    applyHref(icons[next]);
}

function rebuildIcons() {
    icons = buildIcons(currentStyle(), officialHref);
    applyHref(icons[kind]);
}

function errorBlob(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);
    const rec = value as Record<string, any>;
    return [rec.message, rec.code, rec.type, rec.name].filter(Boolean).map(String).join(" ");
}

function isUserInterrupt(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    const state = (r.state ?? "").trim().toLowerCase();
    if (state === "interrupted" || state === "stopped") return true;
    return USER_INTERRUPT.test(errorBlob(r.error)) || USER_INTERRUPT.test(String(r.message ?? ""));
}

function isDeadResponse(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    if (isUserInterrupt(r)) return true;
    const state = (r.state ?? "").trim().toLowerCase();
    return DEAD_RESPONSE.has(state) || (r.error != null && !LIVE_RESPONSE.has(state));
}

function liveResponse(id: string | undefined, byId: Record<string, GrokResponse>): boolean {
    if (!id) return false;
    const response = byId[id];
    if (!response || isDeadResponse(response)) return false;
    if (response.partial) return true;
    return LIVE_RESPONSE.has((response.state ?? "").trim().toLowerCase());
}

function storeStreaming(): boolean {
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        const { byId } = ResponseStore.useResponseStore.getState();
        if (liveResponse(page.streamedMessageId, byId) || liveResponse(page.lastMessageId, byId)) return true;
        if (!page.showStreamingIndicator) return false;
        return !isDeadResponse(byId[page.streamedMessageId ?? ""]) && !isDeadResponse(byId[page.lastMessageId ?? ""]);
    } catch (e) {
        logger.debug("stream stores unavailable:", e);
        return false;
    }
}

function officialInterruptedDom(): boolean {
    try {
        if (!isChatSurface()) return false;
        for (const node of document.querySelectorAll("[data-testid='assistant-message']")) {
            if (USER_INTERRUPT.test(node.textContent ?? "")) return true;
        }
        return false;
    } catch (e) {
        logger.debug("interrupt DOM unavailable:", e);
        return false;
    }
}

function currentChatInterrupted(): boolean {
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        const { byId } = ResponseStore.useResponseStore.getState();
        if (isUserInterrupt(byId[page.streamedMessageId ?? ""]) || isUserInterrupt(byId[page.lastMessageId ?? ""])) return true;
    } catch (e) {
        logger.debug("interrupt lookup failed:", e);
    }
    return officialInterruptedDom();
}

function isStreaming(): boolean {
    if (currentChatInterrupted()) return false;
    if (storeStreaming()) return true;
    return getStopButton() != null;
}

function currentConversationId(): string {
    try {
        const { route } = RoutingStore.useRoutingStore.getState();
        if (route.conversationId) return String(route.conversationId);
    } catch (e) {
        logger.debug("RoutingStore unavailable:", e);
    }
    try {
        const id = ChatPageStore.useChatPageStore.getState().conversationId;
        if (id) return id;
    } catch (e) {
        logger.debug("ChatPageStore unavailable:", e);
    }
    return conversationToken();
}

function getContextKey(): string {
    const id = currentConversationId();
    const key = id || contextKeyFromUrl("");
    if (isStreaming()) {
        if (!lockedToken && key) lockedToken = key;
        return lockedToken;
    }
    lockedToken = "";
    return key;
}

function sameStreamContext(key: string): boolean {
    return !!streamContext && !!key && streamContext === key;
}

function resetStreamFlags() {
    wasStreaming = false;
    justFinished = false;
    streamContext = null;
    lockedToken = "";
    lastWasError = false;
}

function onConversationSwitch(id: string) {
    lastConvId = id;
    resetStreamFlags();
    primedReady = false;
    composerObs?.disconnect();
    composerObs = null;
    buttonObs?.disconnect();
    buttonObs = null;
    setKind("wait");
}

function hasError(): boolean {
    if (lastWasError) return true;
    try {
        const { byId } = ResponseStore.useResponseStore.getState();
        const page = ChatPageStore.useChatPageStore.getState();
        const id = page.streamedMessageId ?? page.lastMessageId;
        if (!id) return false;
        const response = byId[id];
        if (!response || isUserInterrupt(response)) return false;
        return response.state === "error" || response.error != null;
    } catch (e) {
        logger.debug("ResponseStore unavailable:", e);
        return false;
    }
}

function evaluateState() {
    if (!started) return;
    if (!isChatSurface()) {
        pauseWatching();
        return;
    }
    const conv = currentConversationId();
    if (lastConvId && conv && lastConvId !== conv) {
        onConversationSwitch(conv);
        return;
    }
    if (conv) lastConvId = conv;

    const empty = isInputEmpty();
    if (currentChatInterrupted()) {
        resetStreamFlags();
        setKind(empty ? "wait" : primedReady ? "ready" : "wait");
        return;
    }

    const contextKey = getContextKey();
    const streaming = isStreaming();
    const gray = submitIsGray();

    if (hasError() && !streaming) {
        setKind("error");
        resetStreamFlags();
        return;
    }

    if (streaming && empty) {
        wasStreaming = true;
        justFinished = false;
        lastWasError = false;
        streamContext = contextKey;
        setKind("rotate");
        return;
    }

    if (wasStreaming) {
        const sameContext = sameStreamContext(contextKey);
        wasStreaming = false;
        if (sameContext && gray) {
            justFinished = true;
            streamContext = contextKey;
            setKind("done");
            return;
        }
        justFinished = false;
        streamContext = null;
    }

    if (justFinished) {
        const contextChanged = !!(streamContext && contextKey && streamContext !== contextKey);
        if (contextChanged) {
            justFinished = false;
            streamContext = null;
        } else if (empty) {
            setKind("done");
            return;
        } else if (primedReady) {
            justFinished = false;
            setKind("ready");
            return;
        } else {
            justFinished = false;
            setKind("wait");
            return;
        }
    }

    streamContext = null;
    lastWasError = false;
    if (empty) setKind("wait");
    else if (primedReady) setKind("ready");
    else setKind("wait");
}

function nodeTouchesStop(node: Node): boolean {
    if (!(node instanceof Element)) return false;
    if (node instanceof HTMLElement && node.tagName === "BUTTON" && isStopControl(node)) return true;
    for (const btn of node.querySelectorAll("button")) {
        if (isStopControl(btn)) return true;
    }
    return false;
}

function stopButtonMutation(list: MutationRecord[]): boolean {
    for (const m of list) {
        if (nodeTouchesStop(m.target)) return true;
        for (const n of m.addedNodes) {
            if (nodeTouchesStop(n)) return true;
        }
        for (const n of m.removedNodes) {
            if (nodeTouchesStop(n)) return true;
        }
        if (m.type === "attributes" && m.attributeName === "aria-label" && m.target instanceof HTMLElement) {
            if (isStopControl(m.target) || /stop|停止/i.test(String(m.oldValue ?? ""))) return true;
        }
    }
    return false;
}

function nodeInEditor(node: Node | null): boolean {
    const el = node instanceof Element ? node : node?.parentElement;
    return !!el?.closest(EDITOR_SEL);
}

function mutationsAreEditorOnly(list: MutationRecord[]): boolean {
    if (!list.length) return false;
    for (const m of list) {
        if (!nodeInEditor(m.target)) return false;
        for (const n of m.addedNodes) {
            if (n instanceof Text) continue;
            if (!nodeInEditor(n)) return false;
        }
        for (const n of m.removedNodes) {
            if (n instanceof Text) continue;
            if (!nodeInEditor(n)) return false;
        }
    }
    return true;
}

function onDomMutate(list: MutationRecord[]) {
    if (kind === "rotate" || wasStreaming) {
        if (mutationsAreEditorOnly(list)) return;
        if (!stopButtonMutation(list)) return;
    }
    scheduleEvaluate();
}

function onEditorInput() {
    primedReady = true;
    scheduleEvaluate();
}

function scheduleEvaluate() {
    if (!started || raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (!started) return;
        if (!isChatSurface()) {
            pauseWatching();
            return;
        }
        if (!watching) resumeWatching();
        bindEditorInput();
        const root = getComposerRoot();
        if (root && (!composerObs || !root.isConnected)) {
            observeComposer();
            observeButtons();
        }
        evaluateState();
    });
}

function onStreamEnd({ responseId }: VoidPPEventMap["streamEnd"]) {
    try {
        const response = ResponseStore.useResponseStore.getState().byId[responseId];
        lastWasError = !!response && !isUserInterrupt(response) && (response.state === "error" || response.error != null);
    } catch (e) {
        logger.debug("ResponseStore unavailable:", e);
    }
    scheduleEvaluate();
}

function startFaviconGuard() {
    faviconObs?.disconnect();
    const { head } = document;
    if (!head) return;
    faviconObs = new MutationObserver(list => {
        for (const m of list) {
            if (m.type === "attributes" && isIconLink(m.target) && m.target.id !== ICON_ID) {
                applyHref(icons[kind]);
                return;
            }
            for (const node of m.addedNodes) {
                if (isIconLink(node) && node.id !== ICON_ID) {
                    applyHref(icons[kind]);
                    return;
                }
            }
        }
    });
    faviconObs.observe(head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "rel"],
    });
}

function bindEditorInput() {
    const editor = getActiveEditor();
    if (!editor || editor.dataset.voidCsfBound === "1") return;
    editor.dataset.voidCsfBound = "1";
    editor.addEventListener("input", onEditorInput, { passive: true });
    editor.addEventListener("compositionend", onEditorInput, { passive: true });
}

function observeComposer() {
    composerObs?.disconnect();
    const root = getComposerRoot();
    if (!root) {
        composerObs = null;
        return;
    }
    composerObs = new MutationObserver(onDomMutate);
    composerObs.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "aria-disabled", "disabled", "data-testid", "class"],
        attributeOldValue: true,
    });
}

function observeButtons() {
    buttonObs?.disconnect();
    const target = getComposerRoot();
    if (!target) {
        buttonObs = null;
        return;
    }
    buttonObs = new MutationObserver(onDomMutate);
    buttonObs.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label", "type"],
        attributeOldValue: true,
    });
}

function pauseWatching() {
    if (!watching && !globalObs && !composerObs && !buttonObs) return;
    watching = false;
    globalObs?.disconnect();
    globalObs = null;
    composerObs?.disconnect();
    composerObs = null;
    buttonObs?.disconnect();
    buttonObs = null;
    resetStreamFlags();
    lastConvId = "";
    restoreOfficial();
}

function resumeWatching() {
    if (!started) return;
    watching = true;
    startFaviconGuard();
    rebuildIcons();
    if (!globalObs) {
        globalObs = new MutationObserver(onDomMutate);
        globalObs.observe(document.body, { childList: true, subtree: true });
    }
    observeComposer();
    observeButtons();
    bindEditorInput();
}

function onSurfaceChange() {
    if (!started) return;
    if (isChatSurface()) {
        resumeWatching();
        scheduleEvaluate();
        return;
    }
    pauseWatching();
}

function attachStores() {
    unsubRoute?.();
    unsubRoutePage?.();
    unsubPage?.();
    unsubStream?.();
    unsubResponse?.();
    unsubRoute = null;
    unsubRoutePage = null;
    unsubPage = null;
    unsubStream = null;
    unsubResponse = null;
    try {
        const routeStore = RoutingStore.useRoutingStore;
        if (typeof routeStore?.subscribe === "function") {
            unsubRoute = routeStore.subscribe(s => s.route.conversationId, (id, prev) => {
                if (!id || id === prev || !isChatSurface()) return;
                onConversationSwitch(String(id));
            });
            unsubRoutePage = routeStore.subscribe(s => s.route.page, (page, prev) => {
                if (page === prev) return;
                onSurfaceChange();
            });
        }
    } catch (e) {
        logger.debug("RoutingStore subscribe failed:", e);
        try {
            unsubRoute = RoutingStore.useRoutingStore.subscribe(() => scheduleEvaluate());
        } catch (err) {
            logger.debug("RoutingStore full subscribe failed:", err);
        }
    }
    try {
        const pageStore = ChatPageStore.useChatPageStore;
        if (typeof pageStore?.subscribe === "function") {
            unsubPage = pageStore.subscribe(s => s.conversationId, (id, prev) => {
                if (!id || id === prev || !isChatSurface()) return;
                onConversationSwitch(id);
            });
            unsubStream = pageStore.subscribe(s => `${s.streamedMessageId ?? ""}|${s.showStreamingIndicator ? "1" : "0"}`, (next, prev) => {
                if (next === prev || !isChatSurface()) return;
                scheduleEvaluate();
            });
        }
    } catch (e) {
        logger.debug("ChatPageStore subscribe failed:", e);
    }
    try {
        const responseStore = ResponseStore.useResponseStore;
        if (typeof responseStore?.subscribe === "function") {
            unsubResponse = responseStore.subscribe(() => {
                if (!isChatSurface()) return;
                scheduleEvaluate();
            });
        }
    } catch (e) {
        logger.debug("ResponseStore subscribe failed:", e);
    }
}

function restoreOfficial() {
    faviconObs?.disconnect();
    faviconObs = null;
    document.getElementById(ICON_ID)?.remove();
    const { head } = document;
    if (!head) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = officialHref;
    head.prepend(link);
}

export default definePlugin({
    name: "ChatStateFavicons",
    icon: AppWindowIcon,
    description: "Show streaming, done, ready, and error states on the tab favicon.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    settings,
    startAt: StartAt.TurbopackReady,
    cleanupSelectors: [`#${ICON_ID}`],

    start() {
        started = true;
        officialHref = captureOfficial();
        inputCtrl?.abort();
        inputCtrl = new AbortController();
        window.addEventListener("popstate", scheduleEvaluate, { signal: inputCtrl.signal });
        attachStores();
        if (isChatSurface()) {
            resumeWatching();
            evaluateState();
        }
    },

    stop() {
        started = false;
        watching = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        inputCtrl?.abort();
        inputCtrl = null;
        unsubRoute?.();
        unsubRoute = null;
        unsubRoutePage?.();
        unsubRoutePage = null;
        unsubPage?.();
        unsubPage = null;
        unsubStream?.();
        unsubStream = null;
        unsubResponse?.();
        unsubResponse = null;
        globalObs?.disconnect();
        globalObs = null;
        composerObs?.disconnect();
        composerObs = null;
        buttonObs?.disconnect();
        buttonObs = null;
        wasStreaming = false;
        justFinished = false;
        streamContext = null;
        lockedToken = "";
        lastConvId = "";
        primedReady = true;
        lastWasError = false;
        restoreOfficial();
    },

    onSettingsChange: rebuildIcons,

    events: {
        streamEnd: onStreamEnd,
    },
});
