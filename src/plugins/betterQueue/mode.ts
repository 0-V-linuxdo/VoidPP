/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { VoidPPEventMap } from "@api/Events";
import type { ModelMode } from "@grok-types/enums/models";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { GatewayConversation, GatewayQueueItem, GatewayTurnArgs, MessageStoreState } from "@grok-types/stores/MessageStore";
import type { ModesStoreState } from "@grok-types/stores/ModesStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, MessageStore, ModesStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { findByPropsLazy } from "@turbopack/turbopack";
import { Logger } from "@utils/Logger";
import { mapGetOrCreate, pageWindow } from "@utils/misc";

import { afterEnqueue, noteEnqueue } from "./persist";
import { settings } from "./settings";

const logger = new Logger("ModeSync");

const CHAT_POST = /\/rest\/app-chat\/conversations/;
const STOP_URL = /stop|abort|cancel/i;
const MENU_SEL = "[role='menuitem'], [role='option'], [data-radix-collection-item]";
const PIN_SEL = "[data-void-mode-id]";
const TRIGGER_SEL = "[data-query-bar-mode-select]";
const TOGGLE_SEL = 'button[aria-label="Toggle queued messages"], button[aria-label*="queued" i]';
const ROW_SEL = '[aria-roledescription="sortable"], [aria-roledescription="draggable"]';
const RAIL_SEL = '[aria-label="Remove from queue"], [aria-label="Send now"], [aria-label="Edit queued message"]';
const SEND_NOW_SEL = '[aria-label="Send now"]';
const CHIP = "void-ms-qchip";
const QMENU = "void-ms-qmenu";
const QOPT = "void-ms-qopt";
const QITEM = "data-void-qitem";
const RESTORE_ATTR = "data-void-mode-sync-restore";
const LOAD_TAIL_MS = 400;
const FLUSH_MS = 4000;
const OVERRIDE_MS = 6000;
const STASH_MS = 2000;
const CHAT_WRAP = ["sendResponse", "establishNewConversation"] as const;
const RESP_WRAP = ["streamResponse", "streamCreateAndRespond"] as const;
const MSG_WRAP = ["queueMessage", "sendMessage"] as const;
const GW_TYPES = new Set(["response.create", "conversation.queue.add", "conversation.queue.interject"]);
const GW_MODE_KEYS = ["mode", "modeId", "mode_id", "modelMode", "model_mode"] as const;
const QUEUE_ADD = "conversation.queue.add";
const QUEUE_REMOVE = "conversation.queue.remove";
const QUEUE_INTERJECT = "conversation.queue.interject";
const QUEUE_SILENT = new Set(["conversation.queue.edit", "conversation.queue.move"]);
const SESSION_OUT = new Set(["session.create", "session.update"]);
const SESSION_IN = new Set(["session.created", "session.updated"]);
const WRAP_MARK = Symbol.for("voidpp.modeSync.wrapped");
const ENQUEUE_FORCE = Symbol.for("voidpp.modeSync.enqueueIntent");
const REMEMBERED = Symbol.for("voidpp.modeSync.intent");
const GW_OK = Object.freeze({ ok: true });
const CATALOG = [
    { id: "auto", label: "Auto" },
    { id: "fast", label: "Fast" },
    { id: "expert", label: "Expert" },
    { id: "heavy", label: "Heavy" },
    { id: "build", label: "Build" },
] as const;
const ICONS: Record<string, string> = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke-linecap="square" d="M6.5 12.5L11.5 17.5M6.5 12.5L11.8349 6.83172C13.5356 5.02464 15.9071 4 18.3887 4H20V5.61135C20 8.09292 18.9754 10.4644 17.1683 12.1651L11.5 17.5M6.5 12.5L2 11L5.12132 7.87868C5.68393 7.31607 6.44699 7 7.24264 7H11M11.5 17.5L13 22L16.1213 18.8787C16.6839 18.3161 17 17.553 17 16.7574V13"/><path d="M4.5 16.5C4.5 16.5 4 18 4 20C6 20 7.5 19.5 7.5 19.5"/></svg>',
    fast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 14.25L14 4L13 9.75H19L10 20L11 14.25H5Z"/></svg>',
    expert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    heavy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="5" height="5"/><rect x="15" y="4" width="5" height="5"/><rect x="15" y="15" width="5" height="5"/><path d="M11 18H10C7.79086 18 6 16.2091 6 14V13"/></svg>',
    build: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M6.55273 4.60517C9.30778 1.96643 12.7289 1.47144 16.748 2.49872L19.1709 3.11787L16.9883 4.34052C16.0286 4.87786 15.0421 5.85039 14.5645 6.87763C14.3308 7.38043 14.2396 7.85117 14.2852 8.26728C14.3289 8.6664 14.5051 9.08437 14.9307 9.50068L20.5068 14.9548C22.0873 16.3103 22.1844 18.7292 20.707 20.2067C19.2281 21.6857 16.8059 21.5867 15.4512 20.0017C15.4468 19.9971 15.4413 19.9919 15.4355 19.986C15.4119 19.9617 15.3773 19.9252 15.332 19.8786C15.2412 19.7851 15.1086 19.6485 14.9424 19.4772C14.6098 19.1346 14.1405 18.653 13.5977 18.0944C12.5116 16.9769 11.1275 15.5535 9.93457 14.3317C9.65277 14.0434 9.32401 13.9826 9.07031 14.0456C8.82894 14.1056 8.57482 14.2967 8.46875 14.7136L8.40137 14.9802L6.5 16.8815L1.08594 11.4675L3.08594 9.46747H3.5C3.84716 9.46747 3.9785 9.37185 4.0752 9.26728C4.22615 9.1039 4.36795 8.82197 4.55371 8.30732C4.8865 7.38517 5.29734 5.80772 6.55273 4.60517ZM11.668 13.2448C12.789 14.3937 14.0363 15.6752 15.0322 16.6999C15.5754 17.2588 16.0441 17.7419 16.377 18.0847C16.5432 18.2559 16.6757 18.3924 16.7666 18.486C16.812 18.5328 16.8474 18.569 16.8711 18.5935C16.8826 18.6053 16.8914 18.6146 16.8975 18.6208C16.9004 18.6238 16.9028 18.627 16.9043 18.6286L16.9062 18.6296L16.9072 18.6306L16.9336 18.6579L16.957 18.6862C17.5529 19.4013 18.6348 19.4509 19.293 18.7927C19.951 18.1345 19.9016 17.0526 19.1865 16.4567L19.1562 16.4313L19.1279 16.404L13.7598 11.153L11.668 13.2448ZM14.1406 4.05244C11.6131 3.80062 9.61076 4.44487 7.93555 6.04951C7.10476 6.84532 6.84901 7.83879 6.43457 8.98701C6.24676 9.5073 5.99495 10.1367 5.54395 10.6247C5.12935 11.0732 4.597 11.349 3.94531 11.4352L3.91406 11.4675L6.5 14.0534L6.61914 13.9333C6.95792 12.978 7.6995 12.326 8.58789 12.1052C9.04163 11.9924 9.51491 11.9981 9.96875 12.1159L12.5625 9.52216C12.4239 9.18685 12.3357 8.83958 12.2969 8.48505C12.2019 7.6178 12.4054 6.77723 12.751 6.03388C13.0875 5.31006 13.578 4.63529 14.1406 4.05244Z"/></svg>',
};

type SendFn = (...args: any[]) => any;

interface GwEvent {
    type?: string;
    session?: { model?: unknown };
}

type GwListener = (cid: string, event: GwEvent) => void;

interface GatewayManager {
    send: SendFn;
    on: (fn: GwListener) => () => void;
    onOutgoing: (fn: GwListener) => () => void;
}

const Gateway: { gatewayConnectionManager?: GatewayManager } = findByPropsLazy("gatewayConnectionManager");
const QueueItems: { queueItemText: (item: unknown) => string } = findByPropsLazy("queueItemText");

interface Intent {
    modeId: string;
    modelMode: string;
    activeModelId: string;
}

interface HeldTurn {
    id: string;
    args: GatewayTurnArgs;
    intent: Intent;
}

interface PendingFlush {
    turn: HeldTurn;
    parentId: string;
    item: Intent;
    timer: ReturnType<typeof setTimeout>;
}

const EMPTY: Intent = { modeId: "", modelMode: "", activeModelId: "" };
const held = new Map<string, HeldTurn[]>();
const flushing = new Map<string, PendingFlush>();
const sentModel = new Map<string, string>();
const ackedModel = new Map<string, string>();
const busy = new Set<string>();
const itemIntent = new Map<string, Intent>();
const itemBody = new Map<string, string>();
const removed = new Map<string, { intent: Intent; text: string; at: number }>();
let diverting: GatewayTurnArgs | null = null;
let pendingEnqueue: { args: GatewayTurnArgs; intent: Intent } | null = null;
let sendOverride: Intent | null = null;
let overrideCid = "";

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
let gwOff: (() => void)[] = [];
let abort: AbortController | null = null;
let lastNavKey = "";
let loadTail: ReturnType<typeof setTimeout> | null = null;
let overrideTail: ReturnType<typeof setTimeout> | null = null;
let paintRaf = 0;
let obs: MutationObserver | null = null;
let menu: HTMLElement | null = null;
let menuFor: string | null = null;

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

function modeSlug(s: string): string {
    return s.replace(/^MODEL_MODE_/, "").replaceAll("_", "-").toLowerCase();
}

function apiModelMode(s: string): string {
    const slug = modeSlug(s);
    if (!slug) return "";
    return `MODEL_MODE_${slug.replaceAll("-", "_").toUpperCase()}`;
}

function coerceModelMode(existing: unknown, live: Intent): string {
    const raw = live.modeId || live.modelMode;
    if (typeof existing === "string" && existing.startsWith("MODEL_MODE_")) return apiModelMode(raw);
    if ((existing == null || existing === "") && live.modelMode.startsWith("MODEL_MODE_")) return apiModelMode(raw);
    return modeSlug(raw);
}

function qid(item: unknown): string {
    if (!item || typeof item !== "object") return "";
    const rec = item as { queue_item_id?: unknown; queueItemId?: unknown };
    const id = rec.queue_item_id ?? rec.queueItemId;
    return typeof id === "string" ? id : "";
}

function forcedIntent(): Intent | null {
    const raw = (pageWindow as unknown as Record<symbol, unknown>)[ENQUEUE_FORCE];
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as Partial<Intent>;
    if (!rec.modeId) return null;
    return {
        modeId: String(rec.modeId),
        modelMode: String(rec.modelMode || ""),
        activeModelId: String(rec.activeModelId || ""),
    };
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
    if (sendOverride?.modeId) return sendOverride;
    const cur = snapshot();
    return cur.modeId ? cur : intent;
}

function setIntent(next: Intent) {
    intent = next.modeId ? next : { ...EMPTY };
    const host = pageWindow as unknown as Record<symbol, unknown>;
    if (intent.modeId) host[REMEMBERED] = intent;
    else delete host[REMEMBERED];
}

function sessionAdjusted(cid: string): string {
    if (!cid) return "";
    const modes = ModesStore.useModesStore.getState() as ModesStoreState & {
        userAdjustedSessionModeByConversationId?: Record<string, string>;
    };
    return String(modes.userAdjustedSessionModeByConversationId?.[cid] ?? "");
}

function enqueueIntent(): Intent {
    const forced = forcedIntent();
    if (forced?.modeId) return forced;
    const cur = snapshot();
    if (cur.modeId) return cur;
    return intent.modeId ? intent : liveIntent();
}

function pickerIntent(): Intent {
    return intent.modeId ? intent : snapshot();
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
    const slug = modeSlug(next.modeId);
    if (!slug) return;
    applying = true;
    try {
        const modes = ModesStore.useModesStore.getState();
        const cid = currentCid();
        const adjusted = cid ? sessionAdjusted(cid) : slug;
        if (modeSlug(String(modes.selectedModeId || "")) !== slug || adjusted !== slug) {
            modes.setSelectedModeId(slug, { source: "user" });
        }
        const settled = modeSlug(String(ModesStore.useModesStore.getState().selectedModeId || "")) || slug;
        const chat = ChatPageStore.useChatPageStore.getState();
        if (modeSlug(String(chat.modelMode || "")) !== settled) chat.setModelMode(settled as ModelMode);
        if (settled !== slug && modeSlug(intent.modeId) === slug) setIntent(captureIntent(settled, snapshot()));
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function armOverride(item: Intent, cid: string) {
    if (!item.modeId) return;
    sendOverride = item;
    overrideCid = cid;
    applyIntent(item);
    if (overrideTail) clearTimeout(overrideTail);
    overrideTail = setTimeout(releaseOverride, OVERRIDE_MS);
}

function releaseOverride() {
    if (overrideTail) clearTimeout(overrideTail);
    overrideTail = null;
    overrideCid = "";
    if (!sendOverride) return;
    sendOverride = null;
    applyIntent(pickerIntent());
}

function captureIntent(modeId: string, cur: Intent): Intent {
    const keep = modeSlug(cur.modelMode) === modeSlug(modeId);
    return {
        modeId,
        modelMode: keep ? cur.modelMode : modeId,
        activeModelId: keep ? cur.activeModelId : "",
    };
}

function rememberMode(modeId: string) {
    if (!modeId) return;
    setIntent(captureIntent(modeId, snapshot()));
    userPicking = false;
    awaitingMenu = false;
    applyIntent(intent);
    logger.info("intent", intent.modeId);
}

function rememberSnapshot() {
    const next = snapshot();
    if (!next.modeId) return;
    setIntent(captureIntent(next.modeId, next));
    userPicking = false;
    awaitingMenu = false;
    logger.info("intent", intent.modeId);
}

function fightHydrate() {
    if (sendOverride || !settings.store.stickyOnNavigate || applying || userPicking || awaitingMenu || !intent.modeId) return;
    if (!loadPending()) return;
    const cur = snapshot();
    const slug = modeSlug(intent.modeId);
    const cid = currentCid();
    if (
        modeSlug(cur.modeId) === slug
        && (!cid || sessionAdjusted(cid) === slug)
        && (!intent.modelMode || modeSlug(cur.modelMode) === slug)
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
    if (!intent.modeId) setIntent(snapshot());
    closeMenu();
    schedulePaint();
    if (!settings.store.stickyOnNavigate || !intent.modeId) return;
    setRestoreFlag(true);
    applyIntent(intent);
    syncRestoreFlag();
}

function isChatSend(rec: Record<string, unknown>): boolean {
    return "message" in rec || ("fileAttachments" in rec && ("modeId" in rec || "modelMode" in rec));
}

function patchPayload(raw: unknown, live: Intent): boolean {
    if (onImaginePage() || !raw || typeof raw !== "object" || Array.isArray(raw) || !live.modeId) return false;
    const rec = raw as Record<string, unknown>;
    if (!isChatSend(rec)) return false;
    const slug = modeSlug(live.modeId);
    if (!slug) return false;
    const before = rec.modeId;
    const beforeMode = rec.modelMode;
    const beforeModel = rec.model;
    rec.modeId = slug;
    rec.modelMode = coerceModelMode(rec.modelMode, live);
    if ("model" in rec) rec.model = slug;
    return rec.modeId !== before || rec.modelMode !== beforeMode || ("model" in rec && rec.model !== beforeModel);
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

function intentForBody(text: string): Intent {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return liveIntent();
    }
    const queued = intentFromPayload(parsed);
    return queued?.modeId ? queued : liveIntent();
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

function currentCid(): string {
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        return String(chat.conversationId || chat.optimisticConversationId || "");
    } catch {
        return "";
    }
}

function isTurnArgs(v: unknown): v is GatewayTurnArgs {
    return !!v && typeof v === "object" && typeof (v as { convId?: unknown }).convId === "string";
}

function forgetItem(id: string) {
    itemIntent.delete(id);
    for (const [cid, list] of held) {
        const next = list.filter(h => h.id !== id);
        if (next.length) held.set(cid, next);
        else held.delete(cid);
    }
}

function pruneIntents() {
    const now = Date.now();
    for (const [id, row] of removed) {
        if (now - row.at > STASH_MS) removed.delete(id);
    }
    const live = new Set<string>();
    for (const list of held.values()) for (const h of list) live.add(h.id);
    for (const id of removed.keys()) live.add(id);
    let convs: GatewayConversation[] = [];
    try {
        convs = Object.values(MessageStore.useMessageStore.getState().conversations);
    } catch {
        convs = [];
    }
    for (const conv of convs) for (const q of conv.queue) {
        const id = qid(q);
        if (id) live.add(id);
    }
    for (const id of itemIntent.keys()) if (!live.has(id)) itemIntent.delete(id);
    for (const id of itemBody.keys()) if (!live.has(id)) itemBody.delete(id);
}

function holdQueueEvent(cid: string, event: unknown): boolean {
    if (!event || typeof event !== "object") return false;
    const id = eventQueueId(event);
    const { type } = (event as { type?: unknown });
    if (!id) return false;
    if (type === QUEUE_ADD) {
        const saved = pendingEnqueue?.intent ?? (intent.modeId ? intent : liveIntent());
        if (saved.modeId) itemIntent.set(id, { ...saved });
        const body = (pendingEnqueue?.args.text || eventText(event)).trim();
        if (body) itemBody.set(id, body);
        schedulePaint();
        if (diverting) {
            mapGetOrCreate(held, cid, () => []).push({ id, args: diverting, intent: { ...saved } });
            diverting = null;
            logger.info("held", id, "for", saved.modeId);
            return true;
        }
        return false;
    }
    if (QUEUE_SILENT.has(String(type))) return held.get(cid)?.some(h => h.id === id) ?? false;
    if (type === QUEUE_INTERJECT) {
        unhold(cid, id);
        return false;
    }
    if (type !== QUEUE_REMOVE) return false;
    const saved = itemIntent.get(id);
    if (saved?.modeId) removed.set(id, { intent: { ...saved }, text: itemBody.get(id) || "", at: Date.now() });
    schedulePaint();
    return unhold(cid, id);
}

function unhold(cid: string, id: string): boolean {
    const list = held.get(cid) ?? [];
    const idx = list.findIndex(h => h.id === id);
    if (idx >= 0) list.splice(idx, 1);
    return idx >= 0;
}

function flushNext(cid: string, parentId: string) {
    const conv = conversation(cid);
    const list = held.get(cid);
    if (!conv || !list) return;
    const queued = list.filter(h => conv.queue.some(q => qid(q) === h.id));
    if (!queued.length) return;
    held.set(cid, queued);
    if (conv.queue.some(q => {
        const id = qid(q);
        return !!id && !queued.some(h => h.id === id);
    })) return;
    const turn = queued.find(h => h.id === qid(conv.queue[0]));
    if (!turn) return;
    const prev = flushing.get(cid);
    if (prev) clearTimeout(prev.timer);
    const item = turn.intent.modeId ? turn.intent : itemIntent.get(turn.id) ?? liveIntent();
    flushing.set(cid, { turn, parentId, item, timer: setTimeout(() => flushTurn(cid), FLUSH_MS) });
    armOverride(item, cid);
    queueMicrotask(() => tryFlush(cid));
}

function tryFlush(cid: string) {
    const next = flushing.get(cid);
    if (!next || busy.has(cid)) return;
    const slug = modeSlug(next.item.modeId);
    if (sentModel.get(cid) === slug && ackedModel.get(cid) === slug) flushTurn(cid);
}

function flushTurn(cid: string) {
    const next = flushing.get(cid);
    if (!next) return;
    flushing.delete(cid);
    clearTimeout(next.timer);
    const conv = conversation(cid);
    if (conv?.activeGeneration) return;
    const { turn, parentId, item } = next;
    const queued = conv?.queue.find(q => qid(q) === turn.id);
    if (!queued) {
        forgetItem(turn.id);
        flushNext(cid, parentId);
        return;
    }
    const state = MessageStore.useMessageStore.getState();
    armOverride(item, cid);
    state.removeQueuedMessage({ convId: cid, queueItemId: turn.id });
    state.sendMessage({ ...turn.args, text: QueueItems.queueItemText(queued.item), parentId });
    forgetItem(turn.id);
    logger.info("flushed", turn.id, "as", item.modeId, "session", ackedModel.get(cid) ?? "?", busy.has(cid) ? "busy" : "idle");
}

function onGwEvent(cid: string, event: GwEvent) {
    const { type } = event;
    if (type === "response.created") {
        busy.add(cid);
        if (cid === overrideCid) releaseOverride();
        return;
    }
    if (type === "response.persisted") busy.delete(cid);
    else if (SESSION_IN.has(String(type))) ackedModel.set(cid, modeSlug(String(event.session?.model ?? "")));
    else return;
    if (flushing.has(cid)) queueMicrotask(() => tryFlush(cid));
}

function onGwOutgoing(cid: string, event: GwEvent) {
    if (SESSION_OUT.has(String(event.type))) sentModel.set(cid, modeSlug(String(event.session?.model ?? "")));
}

function writeMode(rec: Record<string, unknown>, live: Intent) {
    const slug = modeSlug(live.modeId);
    if (!slug) return;
    for (const key of GW_MODE_KEYS) {
        rec[key] = key === "modelMode" || key === "model_mode" ? coerceModelMode(rec[key], live) : slug;
    }
    if ("model" in rec) rec.model = slug;
}

function patchGwEvent(event: unknown, live: Intent) {
    if (onImaginePage() || !event || typeof event !== "object" || Array.isArray(event) || !live.modeId) return;
    const rec = event as Record<string, unknown>;
    if (typeof rec.type !== "string" || !GW_TYPES.has(rec.type)) return;
    writeMode(rec, live);
    const { item } = rec;
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    writeMode(item as Record<string, unknown>, live);
}

function eventQueueId(event: unknown): string {
    if (!event || typeof event !== "object") return "";
    const rec = event as { item?: unknown };
    return qid(event) || qid(rec.item);
}

function textOf(rec: Record<string, unknown>): string {
    for (const key of ["message", "text", "query"]) {
        const value = rec[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function eventText(event: unknown): string {
    if (!event || typeof event !== "object") return "";
    const rec = event as Record<string, unknown>;
    const own = textOf(rec);
    if (own) return own;
    const { item } = rec;
    return item && typeof item === "object" ? textOf(item as Record<string, unknown>) : "";
}

function itemText(conv: GatewayConversation, id: string): string {
    const content = conv.nodes?.[id]?.content as { message?: unknown; query?: unknown } | undefined;
    if (!content) return "";
    if (typeof content.message === "string" && content.message.trim()) return content.message.trim();
    if (typeof content.query === "string") return content.query.trim();
    return "";
}

function bodyOfItem(conv: GatewayConversation | undefined, id: string): string {
    const saved = itemBody.get(id);
    if (saved) return saved;
    return conv ? itemText(conv, id) : "";
}

function intentForText(cid: string, text: string): Intent | undefined {
    const body = text.trim();
    if (!body || !cid) return undefined;
    for (const turn of held.get(cid) ?? []) {
        if (turn.args.text.trim() === body && turn.intent.modeId) return turn.intent;
    }
    const conv = conversation(cid);
    if (conv) {
        for (const q of conv.queue) {
            const id = qid(q);
            const saved = id ? itemIntent.get(id) : undefined;
            if (saved?.modeId && bodyOfItem(conv, id) === body) return saved;
        }
    }
    for (const [id, saved] of itemIntent) {
        if (saved.modeId && itemBody.get(id) === body) return saved;
    }
    for (const row of removed.values()) {
        if (row.text === body && row.intent.modeId) return row.intent;
    }
    return undefined;
}

function queuedIntent(cid: string, text: string, id: string): Intent | undefined {
    const now = Date.now();
    for (const [key, row] of removed) {
        if (now - row.at > STASH_MS) removed.delete(key);
    }
    if (id) {
        const saved = itemIntent.get(id);
        if (saved?.modeId) return saved;
        const gone = removed.get(id);
        if (gone?.intent.modeId) return gone.intent;
    }
    const byText = intentForText(cid, text);
    if (byText?.modeId) return byText;
    const body = text.trim();
    if (!body && removed.size === 1) {
        const only = removed.values().next().value;
        if (only?.intent.modeId) return only.intent;
    }
    const conv = cid ? conversation(cid) : undefined;
    const front = conv?.queue?.[0];
    const frontId = front ? qid(front) : "";
    const frontIntent = frontId ? itemIntent.get(frontId) : undefined;
    if (!frontIntent?.modeId) return undefined;
    const frontText = bodyOfItem(conv, frontId);
    if (body && frontText === body) return frontIntent;
    return undefined;
}

function intentFromPayload(raw: unknown): Intent | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const rec = raw as Record<string, unknown>;
    const nested = rec.item && typeof rec.item === "object" && !Array.isArray(rec.item) ? rec.item as Record<string, unknown> : undefined;
    const id = qid(rec) || (nested ? qid(nested) : "");
    const text = textOf(rec) || (nested ? textOf(nested) : "");
    const cid = typeof rec.conversationId === "string" ? rec.conversationId
        : (typeof rec.convId === "string" ? rec.convId
        : currentCid());
    return queuedIntent(cid, text, id);
}

function eventItemIntent(event: unknown, cid: string): Intent | undefined {
    if (!event || typeof event !== "object") return undefined;
    const rec = event as { type?: unknown };
    if (rec.type !== QUEUE_INTERJECT && rec.type !== "response.create") return undefined;
    return queuedIntent(cid, eventText(event), eventQueueId(event));
}

function wrapGatewaySend() {
    try {
        const mgr = Gateway.gatewayConnectionManager;
        if (!mgr || typeof mgr.send !== "function") return;
        if (!gwOff.length) gwOff = [mgr.on(onGwEvent), mgr.onOutgoing(onGwOutgoing)];
        if (wrappedGwSend && mgr.send === wrappedGwSend) return;
        gwHost = mgr;
        origGwSend = mgr.send;
        const orig = origGwSend;
        const wrapped: SendFn = function voidModeSyncGwSend(this: unknown, ...args: unknown[]) {
            if (onImaginePage()) return orig.apply(mgr, args);
            const [cid, event] = args;
            if (typeof cid === "string" && holdQueueEvent(cid, event)) return Promise.resolve(GW_OK);
            const type = event && typeof event === "object" ? String((event as { type?: unknown }).type ?? "") : "";
            if (type === QUEUE_ADD) {
                const saved = (typeof cid === "string" ? itemIntent.get(eventQueueId(event)) : undefined) ?? pendingEnqueue?.intent;
                if (saved?.modeId) patchGwEvent(event, saved);
                return orig.apply(mgr, args);
            }
            const queued = typeof cid === "string" ? eventItemIntent(event, cid) : undefined;
            if (queued?.modeId && !sendOverride) {
                armOverride(queued, String(cid));
                patchGwEvent(event, queued);
                return orig.apply(mgr, args);
            }
            if (!GW_TYPES.has(type)) return orig.apply(mgr, args);
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
    for (const off of gwOff) off();
    gwOff = [];
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
        const [first] = args;
        if (!sendOverride) {
            const id = qid(first);
            const text = isTurnArgs(first) ? first.text : "";
            const cid = isTurnArgs(first) ? first.convId : currentCid();
            const queued = queuedIntent(cid, text, id);
            if (queued?.modeId) {
                armOverride(queued, cid);
                patchSendArgs(args, queued);
                return orig.apply(this, args);
            }
        }
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
        noteEnqueue(args);
        const [first] = args;
        const live = enqueueIntent();
        if (!isTurnArgs(first) || !live.modeId) {
            try {
                return orig.apply(this, args);
            } finally {
                afterEnqueue();
            }
        }
        pendingEnqueue = { args: first, intent: { ...live } };
        if (conversation(first.convId)?.activeGeneration) diverting = first;
        try {
            return orig.apply(this, args);
        } finally {
            const token = first;
            queueMicrotask(() => {
                if (pendingEnqueue?.args === token) pendingEnqueue = null;
                if (diverting === token) diverting = null;
            });
            afterEnqueue();
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
    if ((current as SendFn & Record<symbol, unknown>)[WRAP_MARK] === true) return;
    if (wrappedFns.get(label) === current) return;
    origFns.set(label, current);
    const wrapped = make(current);
    (wrapped as SendFn & Record<symbol, unknown>)[WRAP_MARK] = true;
    wrappedFns.set(label, wrapped);
    setState({ [key]: wrapped });
}

function wrapSendFns() {
    wrapOne("chat.sendResponse", () => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), "sendResponse");
    wrapOne("chat.establishNewConversation", () => ChatPageStore.useChatPageStore.getState(), p => ChatPageStore.useChatPageStore.setState(p), "establishNewConversation");
    wrapOne("resp.streamResponse", () => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), "streamResponse");
    wrapOne("resp.streamCreateAndRespond", () => ResponseStore.useResponseStore.getState(), p => ResponseStore.useResponseStore.setState(p), "streamCreateAndRespond");
    wrapOne("msg.queueMessage", () => MessageStore.useMessageStore.getState(), p => MessageStore.useMessageStore.setState(p), "queueMessage", makeQueueWrapper);
    wrapOne("msg.sendMessage", () => MessageStore.useMessageStore.getState(), p => MessageStore.useMessageStore.setState(p), "sendMessage");
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
    if (!CHAT_POST.test(url) || STOP_URL.test(url) || text == null) return null;
    const live = intentForBody(text);
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

function modeLabel(id: string) {
    let title = "";
    try {
        title = ModesStore.useModesStore.getState().modes.find(m => m.id === id)?.title ?? "";
    } catch {
        title = "";
    }
    if (title) return title;
    return CATALOG.find(m => m.id === id)?.label ?? id;
}

function modeChoices(): { id: string; label: string }[] {
    const labels = new Map<string, string>(CATALOG.map(m => [m.id, m.label]));
    let extra: { id: string; title: string }[] = [];
    try {
        extra = ModesStore.useModesStore.getState().modes ?? [];
    } catch {
        extra = [];
    }
    for (const m of extra) if (m.id) labels.set(m.id, m.title || labels.get(m.id) || m.id);
    const ids = extra.length ? extra.map(m => m.id).filter(Boolean) : CATALOG.map(m => m.id);
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, label: labels.get(id) || id });
    }
    for (const m of CATALOG) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push({ id: m.id, label: labels.get(m.id) || m.label });
    }
    return out;
}

function paintGlyph(host: HTMLElement, modeId: string) {
    host.replaceChildren();
    const src = document.querySelector(`${PIN_SEL}[data-void-mode-id="${CSS.escape(modeId)}"] svg`);
    if (src) {
        const svg = src.cloneNode(true) as SVGElement;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("aria-hidden", "true");
        host.append(svg);
        return;
    }
    host.innerHTML = ICONS[modeId] || ICONS.fast;
}

function closeMenu() {
    menu?.remove();
    menu = null;
    menuFor = null;
}

function setItemMode(id: string, modeId: string) {
    if (!id || !modeId) return;
    const next = captureIntent(modeId, itemIntent.get(id) ?? snapshot());
    itemIntent.set(id, next);
    for (const list of held.values()) {
        const turn = list.find(h => h.id === id);
        if (turn) turn.intent = next;
    }
    logger.info("queue item", id, "->", next.modeId);
    schedulePaint();
}

function openMenu(chip: HTMLElement, id: string) {
    closeMenu();
    const box = document.createElement("div");
    box.className = QMENU;
    box.setAttribute("role", "menu");
    const current = itemIntent.get(id)?.modeId || liveIntent().modeId;
    for (const choice of modeChoices()) {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = QOPT;
        opt.setAttribute("role", "menuitem");
        opt.setAttribute("aria-selected", choice.id === current ? "true" : "false");
        opt.dataset.voidQmode = choice.id;
        paintGlyph(opt, choice.id);
        const span = document.createElement("span");
        span.textContent = choice.label;
        opt.append(span);
        opt.addEventListener("pointerdown", e => e.stopPropagation());
        opt.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            setItemMode(id, choice.id);
            closeMenu();
        });
        box.append(opt);
    }
    document.body.append(box);
    const rect = chip.getBoundingClientRect();
    const mw = box.offsetWidth;
    const mh = box.offsetHeight;
    const left = Math.min(Math.max(8, rect.right - mw), window.innerWidth - mw - 8);
    const top = rect.bottom + 6 + mh > window.innerHeight - 8 ? rect.top - mh - 6 : rect.bottom + 6;
    box.style.left = `${Math.max(8, left)}px`;
    box.style.top = `${Math.max(8, top)}px`;
    menu = box;
    menuFor = id;
}

function onChipClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const chip = e.currentTarget as HTMLElement;
    const id = chip.getAttribute(QITEM) || "";
    if (!id) return;
    if (menuFor === id) closeMenu();
    else openMenu(chip, id);
}

function actionRail(row: HTMLElement): HTMLElement | null {
    const labeled = row.querySelector(RAIL_SEL);
    if (labeled?.parentElement) return labeled.parentElement;
    const blocks = [...row.querySelectorAll(":scope > div")].filter(d => d.querySelectorAll("button").length >= 2);
    return (blocks.at(-1) as HTMLElement) ?? null;
}

function trayCard(): HTMLElement | null {
    const btn = document.querySelector(TOGGLE_SEL);
    if (!(btn instanceof HTMLElement)) return null;
    let node: HTMLElement | null = btn;
    let card: HTMLElement | null = null;
    while (node && node !== document.body && !node.matches("main")) {
        if (node.querySelector(RAIL_SEL)) card = node;
        node = node.parentElement;
    }
    return card ?? (btn.closest(".rounded-xl") as HTMLElement | null) ?? btn.parentElement;
}

function queueRows(card: HTMLElement): HTMLElement[] {
    const sortable = [...card.querySelectorAll<HTMLElement>(ROW_SEL)].filter(el => el.querySelector(RAIL_SEL) || el.querySelector(".line-clamp-2"));
    if (sortable.length) return sortable;
    const anchors = [...card.querySelectorAll<HTMLElement>(SEND_NOW_SEL)];
    const use = anchors.length ? anchors : [...card.querySelectorAll<HTMLElement>('[aria-label="Remove from queue"]')];
    const rows: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    for (const btn of use) {
        let row: HTMLElement = btn;
        for (let parent = btn.parentElement; parent && parent !== card && card.contains(parent); parent = parent.parentElement) {
            const n = Math.max(parent.querySelectorAll(SEND_NOW_SEL).length, parent.querySelectorAll('[aria-label="Remove from queue"]').length);
            if (n > 1) break;
            row = parent;
        }
        if (seen.has(row)) continue;
        seen.add(row);
        rows.push(row);
    }
    if (rows.length) return rows;
    return [...card.querySelectorAll<HTMLElement>(".line-clamp-2")].map(el => el.parentElement instanceof HTMLElement ? el.parentElement : el);
}

function rowBody(row: HTMLElement): string {
    const clamp = row.querySelector(".line-clamp-2")?.textContent?.trim();
    if (clamp) return clamp;
    const copy = row.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("button, svg").forEach(el => el.remove());
    return (copy.textContent || "").replaceAll(/\s+/g, " ").trim();
}

function idForRow(row: HTMLElement, items: GatewayQueueItem[], index: number, used: Set<string>): string {
    const existing = row.getAttribute(QITEM) || "";
    if (existing && !used.has(existing) && (!items.length || items.some(q => qid(q) === existing))) return existing;
    const indexed = qid(items[index]);
    if (indexed && !used.has(indexed)) return indexed;
    const body = rowBody(row);
    const cid = currentCid();
    const conv = cid ? conversation(cid) : undefined;
    if (body && conv) {
        const hit = items.find(q => {
            const id = qid(q);
            return !!id && !used.has(id) && itemText(conv, id) === body;
        });
        if (hit) return qid(hit);
    }
    if (existing && !used.has(existing)) return existing;
    if (!items.length && body) return `row:${body.slice(0, 120)}`;
    return "";
}

function currentQueue(): GatewayQueueItem[] {
    const cid = currentCid();
    if (!cid) return [];
    const conv = conversation(cid);
    const queue = conv?.queue;
    if (!Array.isArray(queue)) return [];
    return queue.toSorted((a, b) => a.position - b.position);
}

function unpaint() {
    closeMenu();
    for (const el of document.querySelectorAll(`.${CHIP}`)) el.remove();
}

function mountChip(row: HTMLElement, id: string) {
    if (!itemIntent.has(id)) {
        const saved = pendingEnqueue?.intent?.modeId ? pendingEnqueue.intent : (intent.modeId ? intent : undefined);
        if (saved?.modeId) itemIntent.set(id, { ...saved });
    }
    const modeId = itemIntent.get(id)?.modeId || intent.modeId || liveIntent().modeId;
    let chip = row.querySelector<HTMLButtonElement>(`.${CHIP}`);
    if (!chip) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = CHIP;
        chip.addEventListener("pointerdown", e => e.stopPropagation());
        chip.addEventListener("click", onChipClick);
        const rail = actionRail(row);
        if (rail) rail.before(chip);
        else row.append(chip);
    }
    if (chip.getAttribute(QITEM) === id && chip.dataset.mode === modeId) return;
    chip.setAttribute(QITEM, id);
    chip.dataset.mode = modeId;
    const label = modeLabel(modeId);
    chip.title = label;
    chip.setAttribute("aria-label", label);
    paintGlyph(chip, modeId);
}

function paint() {
    paintRaf = 0;
    if (!settings.store.showQueueMode || onImaginePage()) {
        unpaint();
        return;
    }
    const card = trayCard();
    if (!card) {
        closeMenu();
        return;
    }
    const rows = queueRows(card);
    const items = currentQueue();
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = idForRow(row, items, i, seen);
        if (!id) continue;
        row.setAttribute(QITEM, id);
        seen.add(id);
        mountChip(row, id);
    }
    for (const chip of card.querySelectorAll(`.${CHIP}`)) {
        const id = chip.getAttribute(QITEM);
        if (id && !seen.has(id)) chip.remove();
    }
    if (menuFor && !seen.has(menuFor)) closeMenu();
}

function schedulePaint() {
    if (paintRaf) return;
    paintRaf = requestAnimationFrame(paint);
}

function bindObs() {
    obs?.disconnect();
    const root = document.querySelector("main") ?? document.body;
    obs = new MutationObserver(() => schedulePaint());
    obs.observe(root, { childList: true, subtree: true });
}

function onPointerUp(e: PointerEvent) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest(`.${CHIP}, .${QMENU}`)) return;
    if (menu && !t.closest(`.${QMENU}`)) closeMenu();
    const pin = t.closest(PIN_SEL);
    if (pin instanceof HTMLElement) {
        const id = pin.getAttribute("data-void-mode-id");
        if (id) rememberMode(id);
        return;
    }
    if (!e.isTrusted) return;
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

function onPointerDown(e: PointerEvent) {
    if (onImaginePage()) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest(`.${CHIP}, .${QMENU}`)) return;
    if (t.closest(`${TRIGGER_SEL}, ${PIN_SEL}, ${MENU_SEL}`)) {
        userPicking = true;
        if (t.closest(TRIGGER_SEL)) awaitingMenu = true;
    }
    const send = t.closest(SEND_NOW_SEL);
    if (!send) return;
    const row = send.closest(`[${QITEM}], ${ROW_SEL}`);
    const id = row instanceof HTMLElement ? row.getAttribute(QITEM) || "" : "";
    const item = id ? itemIntent.get(id) : undefined;
    if (item?.modeId) armOverride(item, currentCid());
}

function onKeyDown(e: KeyboardEvent) {
    if (!e.isTrusted) return;
    if (e.key === "Escape") closeMenu();
    if (e.key === "Tab" && e.shiftKey) userPicking = true;
}

function onPicker(id: string) {
    if (applying || sendOverride) return;
    if (!id) return;
    if (userPicking || awaitingMenu) rememberSnapshot();
}

function onChatPage() {
    wrapSendFns();
    const key = navKey();
    if (key !== lastNavKey) {
        lastNavKey = key;
        onNavigate();
        return;
    }
    if (sendOverride || applying) return;
    if (loadPending()) fightHydrate();
}

function onStreamEnd({ responseId }: VoidPPEventMap["streamEnd"]) {
    wrapSendFns();
    for (const cid of held.keys()) {
        if (conversation(cid)?.nodes[responseId]) flushNext(cid, responseId);
    }
}

function queueKey(s: MessageStoreState) {
    const cid = currentCid();
    const q = cid ? s.conversations[cid]?.queue ?? [] : [];
    return q.map(i => `${qid(i)}:${i.position}`).join(",");
}

function onQueue() {
    pruneIntents();
    wrapSendFns();
    schedulePaint();
}

let modeStarted = false;

export function startMode() {
    if (modeStarted) return;
    modeStarted = true;
    setIntent(snapshot());
    lastNavKey = navKey();
    abort = new AbortController();
    const { signal } = abort;
    document.addEventListener("pointerup", onPointerUp, { capture: true, signal });
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
    bindObs();
    schedulePaint();
    try {
        wrapSendFns();
        hookFetch();
        hookXhr();
    } catch (e) {
        logger.warn("Failed to hook send path", e);
    }
    if (intent.modeId) applyIntent(intent);
}

export function stopMode() {
    if (!modeStarted) return;
    modeStarted = false;
    abort?.abort();
    abort = null;
    if (loadTail) {
        clearTimeout(loadTail);
        loadTail = null;
    }
    if (overrideTail) {
        clearTimeout(overrideTail);
        overrideTail = null;
    }
    if (paintRaf) cancelAnimationFrame(paintRaf);
    paintRaf = 0;
    obs?.disconnect();
    obs = null;
    unpaint();
    setRestoreFlag(false);
    unhookFetch();
    unhookXhr();
    unwrapSendFns();
    for (const f of flushing.values()) clearTimeout(f.timer);
    flushing.clear();
    sentModel.clear();
    ackedModel.clear();
    busy.clear();
    held.clear();
    itemIntent.clear();
    itemBody.clear();
    removed.clear();
    diverting = null;
    pendingEnqueue = null;
    sendOverride = null;
    overrideCid = "";
    applying = false;
    userPicking = false;
    awaitingMenu = false;
    setIntent(EMPTY);
    lastNavKey = "";
}

export function onModeSettingsChange() {
    schedulePaint();
}

export function onModeStreamEnd(data: VoidPPEventMap["streamEnd"]) {
    onStreamEnd(data);
}

export function modePickerKey(s: ModesStoreState) {
    return s.selectedModeId;
}

export function onModePicker(id: string) {
    onPicker(id);
}

export function modeChatKey(s: ChatPageStoreState) {
    return `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.projectId ?? ""}|${s.modelMode}|${s.activeModelId}`;
}

export function onModeChatPage() {
    onChatPage();
}

export function modeQueueKey(s: MessageStoreState) {
    return queueKey(s);
}

export function onModeQueue() {
    onQueue();
}

export function modeRouteKey(s: RoutingStoreState) {
    return String(s.route.conversationId ?? "");
}

export function onModeRoute() {
    const key = navKey();
    if (key === lastNavKey) return;
    lastNavKey = key;
    onNavigate();
}

export function modeHydrateKey(s: ResponseStoreState) {
    return `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}`;
}

export function onModeHydrate() {
    wrapSendFns();
    syncRestoreFlag();
    fightHydrate();
}
