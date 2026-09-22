/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { VoidPPEventMap } from "@api/Events";
import { definePluginSettings } from "@api/Settings";
import { ListOrderedIcon } from "@components/icons";
import type { ModelId, ModelMode } from "@grok-types/enums/models";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { GatewayConversation, GatewayTurnArgs } from "@grok-types/stores/MessageStore";
import type { ModesStoreState } from "@grok-types/stores/ModesStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, MessageStore, ModesStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { findByPropsLazy } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { mapGetOrCreate, pageWindow } from "@utils/misc";
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
const MSG_WRAP = ["queueMessage"] as const;
const GW_TYPES = new Set(["response.create", "conversation.queue.add", "conversation.queue.interject"]);
const GW_MODE_KEYS = ["mode", "modeId", "mode_id", "modelMode", "model_mode"] as const;
const QUEUE_ADD = "conversation.queue.add";
const QUEUE_REMOVE = "conversation.queue.remove";
const GW_OK = Object.freeze({ ok: true });

const settings = definePluginSettings({
    stickyOnNavigate: {
        type: OptionType.BOOLEAN,
        description: "Keep the selected mode when switching chats.",
        default: true,
    },
});

type SendFn = (...args: any[]) => any;

const Gateway: { gatewayConnectionManager?: { send: SendFn } } = findByPropsLazy("gatewayConnectionManager");

interface Intent {
    modeId: string;
    modelMode: string;
    activeModelId: string;
}

interface HeldTurn {
    id: string;
    args: GatewayTurnArgs;
}

const EMPTY: Intent = { modeId: "", modelMode: "", activeModelId: "" };
const held = new Map<string, HeldTurn[]>();
let diverting: GatewayTurnArgs | null = null;

let applying = false;
let userPicking = false;
let awaitingMenu = false;
let intent: Intent = { ...EMPTY };
let origFetch: typeof fetch | null = null;
let origXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let origXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
const xhrMeta = new WeakMap<XMLHttpRequest, string>();
const origFns = new Map<string, SendFn>();
const wrappedFns = new Map<string, SendFn>();
let origGwSend: SendFn | null = null;
let wrappedGwSend: SendFn | null = null;
let gwHost: { send: SendFn } | null = null;
let abort: AbortController | null = null;
let lastNavKey = "";
let loadTail: ReturnType<typeof setTimeout> | null = null;

function onImaginePage(): boolean {
    try {
        const page = String(RoutingStore.useRoutingStore.getState().route?.page ?? "");
        if (page.startsWith("imagine")) return true;
    } catch { /* route not ready */ }
    try {
        return (location.pathname.replace(/\/+$/, "") || "/").startsWith("/imagine");
    } catch {
        return false;
    }
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
    if (!next.modeId || applying || onImaginePage()) return;
    applying = true;
    try {
        const modes = ModesStore.useModesStore.getState();
        if (modes.selectedModeId !== next.modeId) modes.setSelectedModeId(next.modeId, { source: "sync" });
        const chat = ChatPageStore.useChatPageStore.getState();
        if (next.modelMode && chat.modelMode !== next.modelMode) chat.setModelMode(next.modelMode as ModelMode);
        if (next.activeModelId && chat.activeModelId !== next.activeModelId) chat.setActiveModelId(next.activeModelId as ModelId);
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function captureIntent(modeId: string, cur: Intent): Intent {
    const same = cur.modelMode === modeId;
    return {
        modeId,
        modelMode: same ? cur.modelMode : modeId,
        activeModelId: same ? cur.activeModelId : "",
    };
}

function rememberMode(modeId: string) {
    if (!modeId) return;
    intent = captureIntent(modeId, snapshot());
    userPicking = false;
    awaitingMenu = false;
    applyIntent(intent);
    logger.info("intent", intent.modeId);
}

function rememberSnapshot() {
    const next = snapshot();
    if (!next.modeId) return;
    intent = captureIntent(next.modeId, next);
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

function isChatSend(rec: Record<string, unknown>): boolean {
    return "message" in rec || "modeId" in rec || "modelMode" in rec;
}

function patchPayload(raw: unknown, live: Intent): boolean {
    if (onImaginePage() || !raw || typeof raw !== "object" || Array.isArray(raw) || !live.modeId) return false;
    const rec = raw as Record<string, unknown>;
    if (!isChatSend(rec)) return false;
    const before = rec.modeId;
    const hadModelMode = rec.modelMode;
    const hadModelName = rec.modelName;
    rec.modeId = live.modeId;
    if ("modelMode" in rec) rec.modelMode = undefined;
    if ("modelName" in rec) rec.modelName = undefined;
    return rec.modeId !== before || hadModelMode !== undefined || hadModelName !== undefined;
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

function conversation(cid: string): GatewayConversation | undefined {
    try {
        return MessageStore.useMessageStore.getState().conversations[cid];
    } catch {
        return undefined;
    }
}

function inflightMode(cid: string): string {
    const conv = conversation(cid);
    return String(conv?.activeGeneration?.sentModeId ?? conv?.lastModel ?? "");
}

function isTurnArgs(v: unknown): v is GatewayTurnArgs {
    return !!v && typeof v === "object" && typeof (v as { convId?: unknown }).convId === "string";
}

function holdQueueEvent(cid: string, event: unknown): boolean {
    if (!event || typeof event !== "object") return false;
    const { type, queue_item_id: id } = event as { type?: unknown; queue_item_id?: unknown };
    if (typeof id !== "string") return false;
    if (type === QUEUE_ADD && diverting) {
        mapGetOrCreate(held, cid, () => []).push({ id, args: diverting });
        diverting = null;
        logger.info("held", id, "for", liveIntent().modeId);
        return true;
    }
    const list = held.get(cid);
    if (type !== QUEUE_REMOVE || !list) return false;
    const idx = list.findIndex(h => h.id === id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
}

function flushTurn(cid: string, turn: HeldTurn, parentId: string) {
    const state = MessageStore.useMessageStore.getState();
    state.removeQueuedMessage({ convId: cid, queueItemId: turn.id });
    state.sendMessage({ ...turn.args, parentId });
    logger.info("flushed", turn.id, "as", liveIntent().modeId);
}

function flushHeld(responseId: string) {
    for (const [cid, list] of held) {
        const conv = conversation(cid);
        if (!conv?.nodes[responseId]) continue;
        const queued = list.filter(h => conv.queue.some(q => q.queue_item_id === h.id));
        if (!queued.length) {
            held.delete(cid);
            return;
        }
        held.set(cid, queued);
        if (conv.queue.some(q => !queued.some(h => h.id === q.queue_item_id))) return;
        queueMicrotask(() => flushTurn(cid, queued[0], responseId));
        return;
    }
}

function patchGwEvent(event: unknown, live: Intent) {
    if (onImaginePage() || !event || typeof event !== "object" || Array.isArray(event) || !live.modeId) return;
    const rec = event as Record<string, unknown>;
    if (typeof rec.type !== "string" || !GW_TYPES.has(rec.type)) return;
    for (const key of GW_MODE_KEYS) {
        if (key in rec) rec[key] = live.modeId;
    }
    const { item } = rec;
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const it = item as Record<string, unknown>;
    for (const key of GW_MODE_KEYS) {
        if (key in it) it[key] = live.modeId;
    }
}

function wrapGatewaySend() {
    try {
        const mgr = Gateway.gatewayConnectionManager;
        if (!mgr || typeof mgr.send !== "function") return;
        if (wrappedGwSend && mgr.send === wrappedGwSend) return;
        gwHost = mgr;
        origGwSend = mgr.send;
        const orig = origGwSend;
        const wrapped: SendFn = function voidModeSyncGwSend(this: unknown, ...args: unknown[]) {
            if (onImaginePage()) return orig.apply(mgr, args);
            const [cid, event] = args;
            if (typeof cid === "string" && holdQueueEvent(cid, event)) return Promise.resolve(GW_OK);
            const live = liveIntent();
            if (live.modeId) {
                applyIntent(live);
                patchGwEvent(event, live);
            }
            return orig.apply(mgr, args);
        };
        wrappedGwSend = wrapped;
        mgr.send = wrapped;
    } catch (e) {
        logger.debug("gateway wrap failed", e);
    }
}

function unwrapGatewaySend() {
    try {
        if (gwHost && origGwSend && gwHost.send === wrappedGwSend) gwHost.send = origGwSend;
    } catch (e) {
        logger.debug("gateway unwrap failed", e);
    }
    origGwSend = null;
    wrappedGwSend = null;
    gwHost = null;
}

function makeSendWrapper(orig: SendFn): SendFn {
    return function voidModeSyncSend(this: unknown, ...args: unknown[]) {
        if (onImaginePage()) return orig.apply(this, args);
        const live = liveIntent();
        if (live.modeId) {
            applyIntent(live);
            patchSendArgs(args, live);
        }
        return orig.apply(this, args);
    };
}

function makeQueueWrapper(orig: SendFn): SendFn {
    return function voidModeSyncQueue(this: unknown, ...args: unknown[]) {
        if (onImaginePage()) return orig.apply(this, args);
        const [first] = args;
        const live = liveIntent();
        if (!isTurnArgs(first) || !live.modeId || inflightMode(first.convId) === live.modeId) return orig.apply(this, args);
        diverting = first;
        try {
            return orig.apply(this, args);
        } finally {
            diverting = null;
        }
    };
}

function wrapOne(label: string, getState: () => any, setState: (partial: object) => void, key: string, make: (orig: SendFn) => SendFn = makeSendWrapper) {
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
    const wrapped = make(current);
    wrappedFns.set(label, wrapped);
    setState({ [key]: wrapped });
}

function wrapSendFns() {
    wrapOne("chat.sendResponse", () => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), "sendResponse");
    wrapOne("chat.establishNewConversation", () => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), "establishNewConversation");
    wrapOne("resp.streamResponse", () => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), "streamResponse");
    wrapOne("resp.streamCreateAndRespond", () => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), "streamCreateAndRespond");
    wrapOne("msg.queueMessage", () => MessageStore.useMessageStore.getState(), p => MessageStore.useMessageStore.setState(p), "queueMessage", makeQueueWrapper);
    wrapGatewaySend();
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
    unwrapStore(() => MessageStore.useMessageStore.getState(), p => MessageStore.useMessageStore.setState(p), MSG_WRAP, "msg");
    unwrapGatewaySend();
    origFns.clear();
    wrappedFns.clear();
}

function rewriteIfChatPost(url: string, method: string, text: string | null): string | null {
    if (onImaginePage()) return null;
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
    origFetch = pageWindow.fetch;
    pageWindow.fetch = function voidModeSyncFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        try {
            const patched = patchFetchArgs(input, init);
            if (patched && typeof (patched as Promise<unknown>).then === "function") {
                return (patched as Promise<[RequestInfo | URL, RequestInit | undefined]>).then(
                    ([i, n]) => origFetch!.call(pageWindow, i, n),
                    () => origFetch!.call(pageWindow, input, init),
                );
            }
            if (patched) {
                const [i, n] = patched as [RequestInfo | URL, RequestInit | undefined];
                return origFetch!.call(pageWindow, i, n);
            }
        } catch (e) {
            logger.debug("fetch patch failed", e);
        }
        return origFetch!.call(pageWindow, input, init);
    } as typeof fetch;
}

function unhookFetch() {
    if (!origFetch) return;
    pageWindow.fetch = origFetch;
    origFetch = null;
}

function hookXhr() {
    if (origXhrOpen) return;
    const XHR = pageWindow.XMLHttpRequest;
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
    const XHR = pageWindow.XMLHttpRequest;
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

function onStreamEnd({ responseId }: VoidPPEventMap["streamEnd"]) {
    wrapSendFns();
    const live = liveIntent();
    if (live.modeId) applyIntent(live);
    flushHeld(responseId);
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
        held.clear();
        diverting = null;
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
