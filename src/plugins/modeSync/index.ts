/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { ListOrderedIcon } from "@components/icons";
import type { ModelId, ModelMode } from "@grok-types/enums/models";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ModesStoreState } from "@grok-types/stores/ModesStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, ModesStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const logger = new Logger("ModeSync");

const CHAT_POST = /\/rest\/app-chat\/conversations/;
const MENU_SEL = "[role='menuitem'], [role='option'], [data-radix-collection-item]";
const PIN_SEL = "[data-void-mode-id]";
const TRIGGER_SEL = "[data-query-bar-mode-select]";
const RESTORE_ATTR = "data-void-mode-sync-restore";
const LOAD_TAIL_MS = 400;
const CHAT_WRAP = ["sendResponse", "establishNewConversation"] as const;
const RESP_WRAP = ["streamResponse", "streamCreateAndRespond"] as const;

const settings = definePluginSettings({
    stickyOnNavigate: {
        type: OptionType.BOOLEAN,
        description: "Keep the selected mode when switching chats.",
        default: true,
    },
});

type SendFn = (...args: any[]) => any;

interface Intent {
    modeId: string;
    modelMode: string;
    activeModelId: string;
}

const EMPTY: Intent = { modeId: "", modelMode: "", activeModelId: "" };

let applying = false;
let userPicking = false;
let awaitingMenu = false;
let intent: Intent = { ...EMPTY };
let origFetch: typeof fetch | null = null;
let hookedWindow: typeof globalThis | null = null;
let origXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let origXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
const xhrMeta = new WeakMap<XMLHttpRequest, string>();
const origFns = new Map<string, SendFn>();
const wrappedFns = new Map<string, SendFn>();
let abort: AbortController | null = null;
let lastNavKey = "";
let loadTail: ReturnType<typeof setTimeout> | null = null;

function pageWindow(): typeof globalThis {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
}

function snapshot(): Intent {
    try {
        const modes = ModesStore.useModesStore.getState();
        const chat = ChatPageStore.useChatPageStore.getState();
        return {
            modeId: String(modes.selectedModeId || ""),
            modelMode: String(chat.modelMode || ""),
            activeModelId: String(chat.activeModelId || ""),
        };
    } catch {
        return { ...EMPTY };
    }
}

function liveIntent(): Intent {
    if (intent.modeId) return intent;
    return snapshot();
}

function setRestoreFlag(on: boolean) {
    if (on) document.documentElement.setAttribute(RESTORE_ATTR, "");
    else document.documentElement.removeAttribute(RESTORE_ATTR);
}

function loadPending(): boolean {
    try {
        const cid = ChatPageStore.useChatPageStore.getState().conversationId;
        if (!cid) return false;
        const r = ResponseStore.useResponseStore.getState();
        return !!(
            r.initialResponsesPromisesByConversationId?.[cid]
            || r.nodesPromisesByConversationId?.[cid]
        );
    } catch {
        return false;
    }
}

function syncRestoreFlag() {
    if (!settings.store.stickyOnNavigate) {
        setRestoreFlag(false);
        return;
    }
    if (loadPending()) {
        if (loadTail) {
            clearTimeout(loadTail);
            loadTail = null;
        }
        setRestoreFlag(true);
        return;
    }
    if (document.documentElement.hasAttribute(RESTORE_ATTR) && !loadTail) {
        loadTail = setTimeout(() => {
            loadTail = null;
            if (!loadPending()) setRestoreFlag(false);
        }, LOAD_TAIL_MS);
    }
}

function applyIntent(next: Intent) {
    if (!next.modeId || applying) return;
    applying = true;
    try {
        const modes = ModesStore.useModesStore.getState();
        if (modes.selectedModeId !== next.modeId) modes.setSelectedModeId(next.modeId);
        const chat = ChatPageStore.useChatPageStore.getState();
        if (next.modelMode && next.modelMode !== "build" && chat.modelMode !== next.modelMode) chat.setModelMode(next.modelMode as ModelMode);
        if (next.activeModelId && chat.activeModelId !== next.activeModelId) chat.setActiveModelId(next.activeModelId as ModelId);
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function rememberMode(modeId: string) {
    if (!modeId) return;
    const cur = snapshot();
    intent = {
        modeId,
        modelMode: cur.modelMode === modeId ? cur.modelMode : modeId,
        activeModelId: cur.modelMode === modeId ? cur.activeModelId : "",
    };
    userPicking = false;
    awaitingMenu = false;
    applyIntent(intent);
    logger.info("intent", intent.modeId);
}

function rememberSnapshot() {
    const next = snapshot();
    if (!next.modeId) return;
    intent = next;
    userPicking = false;
    awaitingMenu = false;
    logger.info("intent", intent.modeId);
}

function fightHydrate() {
    if (!settings.store.stickyOnNavigate || applying || userPicking || awaitingMenu || !intent.modeId) return;
    const cur = snapshot();
    if (
        cur.modeId === intent.modeId
        && (!intent.modelMode || cur.modelMode === intent.modelMode)
        && (!intent.activeModelId || cur.activeModelId === intent.activeModelId)
    ) return;
    logger.info("hydrate fought", cur.modeId, "->", intent.modeId);
    applyIntent(intent);
}

function navKey(): string {
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        let routeCid = "";
        try {
            routeCid = String(RoutingStore.useRoutingStore.getState().route.conversationId ?? "");
        } catch {
            routeCid = "";
        }
        return `${chat.conversationId ?? ""}|${chat.optimisticConversationId ?? ""}|${chat.projectId ?? ""}|${routeCid}`;
    } catch {
        return "";
    }
}

function onNavigate() {
    wrapSendFns();
    if (!intent.modeId) intent = snapshot();
    if (!settings.store.stickyOnNavigate || !intent.modeId) return;
    setRestoreFlag(true);
    applyIntent(intent);
    syncRestoreFlag();
}

function apiModelMode(id: string, existing: unknown): unknown {
    if (!id) return existing;
    try {
        const conv = ChatPageStore.modelModeToModelConfigModelMode;
        if (typeof conv === "function") {
            const mapped = conv(id as ModelMode);
            if (mapped) return mapped;
        }
    } catch (e) {
        logger.debug("mode map failed", e);
    }
    if (typeof existing === "string" && existing.startsWith("MODEL_MODE_")) {
        return `MODEL_MODE_${id.toUpperCase().replaceAll("-", "_")}`;
    }
    return id;
}

function isChatSend(rec: Record<string, unknown>): boolean {
    return "message" in rec || "modeId" in rec || "modelMode" in rec;
}

function patchPayload(raw: unknown, live: Intent): boolean {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !live.modeId) return false;
    const rec = raw as Record<string, unknown>;
    if (!isChatSend(rec)) return false;
    const before = rec.modeId;
    rec.modeId = live.modeId;
    if ("modelMode" in rec) rec.modelMode = apiModelMode(live.modelMode || live.modeId, rec.modelMode);
    if ("modelName" in rec && live.activeModelId) rec.modelName = live.activeModelId;
    return rec.modeId !== before || rec.modelMode !== undefined;
}

function patchSendArgs(args: unknown[], live: Intent) {
    const first = args[0];
    if (!first || typeof first !== "object") return;
    patchPayload(first, live);
}

function rewriteJsonBody(text: string, live: Intent): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!patchPayload(parsed, live)) return null;
    try {
        return JSON.stringify(parsed);
    } catch {
        return null;
    }
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    try {
        return input.url;
    } catch {
        return "";
    }
}

function decodeBody(raw: unknown): string | null {
    if (typeof raw === "string") return raw;
    if (raw instanceof Uint8Array) return new TextDecoder().decode(raw);
    if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
    return null;
}

function wrapOne(label: string, getState: () => any, setState: (partial: object) => void, key: string) {
    let state: any;
    try {
        state = getState();
    } catch {
        return;
    }
    const current = state[key] as SendFn | undefined;
    if (typeof current !== "function") return;
    if (wrappedFns.get(label) === current) return;
    origFns.set(label, current);
    const orig = current;
    const wrapped: SendFn = function voidModeSyncSend(this: unknown, ...args: unknown[]) {
        const live = liveIntent();
        if (live.modeId) {
            applyIntent(live);
            patchSendArgs(args, live);
        }
        return orig.apply(this, args);
    };
    wrappedFns.set(label, wrapped);
    setState({ [key]: wrapped });
}

function wrapSendFns() {
    wrapOne("chat.sendResponse", () => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), "sendResponse");
    wrapOne("chat.establishNewConversation", () => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), "establishNewConversation");
    wrapOne("resp.streamResponse", () => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), "streamResponse");
    wrapOne("resp.streamCreateAndRespond", () => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), "streamCreateAndRespond");
}

function unwrapStore(getState: () => any, setState: (partial: object) => void, keys: readonly string[], prefix: string) {
    let state: any;
    try {
        state = getState();
    } catch {
        return;
    }
    const next: Record<string, SendFn> = {};
    for (const key of keys) {
        const label = `${prefix}.${key}`;
        const orig = origFns.get(label);
        if (orig && state[key] === wrappedFns.get(label)) next[key] = orig;
    }
    if (Object.keys(next).length) setState(next);
}

function unwrapSendFns() {
    unwrapStore(() => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), CHAT_WRAP, "chat");
    unwrapStore(() => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), RESP_WRAP, "resp");
    origFns.clear();
    wrappedFns.clear();
}

function rewriteIfChatPost(url: string, method: string, text: string | null): string | null {
    if (method !== "POST" && method !== "PUT") return null;
    if (!CHAT_POST.test(url) || text == null) return null;
    const live = liveIntent();
    if (!live.modeId) return null;
    const next = rewriteJsonBody(text, live);
    if (!next || next === text) return null;
    applyIntent(live);
    logger.info("rewrite", live.modeId, url.replace(/^https?:\/\/[^/]+/, ""));
    return next;
}

function patchFetchArgs(input: RequestInfo | URL, init?: RequestInit): [RequestInfo | URL, RequestInit | undefined] | Promise<[RequestInfo | URL, RequestInit | undefined]> | null {
    const url = requestUrl(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if ((method !== "POST" && method !== "PUT") || !CHAT_POST.test(url)) return null;

    const raw = init?.body;
    const decoded = decodeBody(raw);
    if (decoded != null) {
        const next = rewriteIfChatPost(url, method, decoded);
        if (!next) return null;
        return [input, { ...init, body: next }];
    }

    if (raw instanceof Blob) {
        return raw.text().then(text => {
            const next = rewriteIfChatPost(url, method, text);
            return next ? [input, { ...init, body: next }] as [RequestInfo | URL, RequestInit] : [input, init];
        });
    }

    if (raw == null && input instanceof Request) {
        return input.clone().text().then(text => {
            const next = rewriteIfChatPost(url, method, text);
            if (!next) return [input, init] as [RequestInfo | URL, RequestInit | undefined];
            return [input, { ...init, method, headers: init?.headers ?? input.headers, body: next, credentials: init?.credentials ?? input.credentials }];
        });
    }

    return null;
}

function hookFetch() {
    if (origFetch) return;
    const w = pageWindow();
    origFetch = w.fetch;
    hookedWindow = w;
    w.fetch = function voidModeSyncFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        try {
            const patched = patchFetchArgs(input, init);
            if (patched && typeof (patched as Promise<unknown>).then === "function") {
                return (patched as Promise<[RequestInfo | URL, RequestInit | undefined]>).then(
                    ([i, n]) => origFetch!.call(w, i, n),
                    () => origFetch!.call(w, input, init),
                );
            }
            if (patched) {
                const [i, n] = patched as [RequestInfo | URL, RequestInit | undefined];
                return origFetch!.call(w, i, n);
            }
        } catch (e) {
            logger.debug("fetch patch failed", e);
        }
        return origFetch!.call(w, input, init);
    } as typeof fetch;
}

function unhookFetch() {
    if (!origFetch || !hookedWindow) return;
    hookedWindow.fetch = origFetch;
    origFetch = null;
    hookedWindow = null;
}

function hookXhr() {
    if (origXhrOpen) return;
    const XHR = pageWindow().XMLHttpRequest;
    origXhrOpen = XHR.prototype.open;
    origXhrSend = XHR.prototype.send;
    XHR.prototype.open = function voidModeSyncOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
        try {
            xhrMeta.set(this, `${String(method).toUpperCase()} ${requestUrl(url)}`);
        } catch (e) {
            logger.debug("xhr open failed", e);
        }
        return (origXhrOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    };
    XHR.prototype.send = function voidModeSyncSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
        const meta = xhrMeta.get(this);
        if (meta && typeof body === "string") {
            const space = meta.indexOf(" ");
            const method = meta.slice(0, space);
            const url = meta.slice(space + 1);
            const next = rewriteIfChatPost(url, method, body);
            if (next) return origXhrSend!.call(this, next);
        }
        return origXhrSend!.call(this, body);
    };
}

function unhookXhr() {
    if (!origXhrOpen) return;
    const XHR = pageWindow().XMLHttpRequest;
    XHR.prototype.open = origXhrOpen;
    if (origXhrSend) XHR.prototype.send = origXhrSend;
    origXhrOpen = null;
    origXhrSend = null;
}

function onPointerUp(e: PointerEvent) {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const pin = t.closest(PIN_SEL);
    if (pin instanceof HTMLElement) {
        const id = pin.getAttribute("data-void-mode-id");
        if (id) rememberMode(id);
        return;
    }
    if (t.closest(TRIGGER_SEL)) {
        awaitingMenu = true;
        userPicking = true;
        return;
    }
    if ((awaitingMenu || userPicking) && t.closest(MENU_SEL)) {
        userPicking = true;
        awaitingMenu = false;
    }
}

function onKeyDown(e: KeyboardEvent) {
    if (!e.isTrusted) return;
    if (e.key === "Tab" && e.shiftKey) userPicking = true;
}

function onPicker(id: string) {
    if (applying) return;
    if (userPicking) {
        rememberSnapshot();
        return;
    }
    if (!id) return;
    if (!intent.modeId) {
        intent = snapshot();
        return;
    }
    fightHydrate();
}

function onStreamEnd() {
    wrapSendFns();
    const live = liveIntent();
    if (live.modeId) applyIntent(live);
}

function onChatPage(cur: string, prev: string) {
    wrapSendFns();
    const key = navKey();
    if (key !== lastNavKey) {
        lastNavKey = key;
        onNavigate();
        return;
    }
    if (cur !== prev) fightHydrate();
}

export default definePlugin({
    name: "ModeSync",
    icon: ListOrderedIcon,
    description: "Send queued messages with the current model and keep the picker when switching chats.",
    authors: [Devs.p],
    tags: ["chat"],
    enabledByDefault: true,
    settings,
    startAt: StartAt.TurbopackReady,

    start() {
        intent = snapshot();
        lastNavKey = navKey();
        abort = new AbortController();
        const { signal } = abort;
        document.addEventListener("pointerup", onPointerUp, { capture: true, signal });
        document.addEventListener("keydown", onKeyDown, { capture: true, signal });
        try {
            wrapSendFns();
            hookFetch();
            hookXhr();
        } catch (e) {
            logger.warn("Failed to hook send path", e);
        }
    },

    stop() {
        abort?.abort();
        abort = null;
        if (loadTail) {
            clearTimeout(loadTail);
            loadTail = null;
        }
        setRestoreFlag(false);
        unhookFetch();
        unhookXhr();
        unwrapSendFns();
        applying = false;
        userPicking = false;
        awaitingMenu = false;
        intent = { ...EMPTY };
        lastNavKey = "";
    },

    events: {
        streamEnd: onStreamEnd,
    },

    zustand: {
        ModesStore: {
            selector: (s: ModesStoreState) => s.selectedModeId,
            handler: onPicker,
        },
        ChatPageStore: {
            selector: (s: ChatPageStoreState) => `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.projectId ?? ""}|${s.modelMode}|${s.activeModelId}`,
            handler: onChatPage,
        },
        RoutingStore: {
            selector: (s: RoutingStoreState) => String(s.route.conversationId ?? ""),
            handler: () => {
                const key = navKey();
                if (key === lastNavKey) return;
                lastNavKey = key;
                onNavigate();
            },
        },
        ResponseStore: {
            selector: (s: ResponseStoreState) => `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}`,
            handler: () => {
                wrapSendFns();
                syncRestoreFlag();
                fightHydrate();
            },
        },
    },
});
