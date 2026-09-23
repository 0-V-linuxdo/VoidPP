/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ModelId, ModelMode } from "@grok-types/enums/models";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { GatewayConversation, GatewayQueueItem, GatewayTurnArgs, MessageStoreState } from "@grok-types/stores/MessageStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, MessageStore, ModesStore, ResponseStore, RoutingStore, SessionStore } from "@turbopack/common/stores";
import { idbGet, idbSet } from "@utils/idb";
import { Logger } from "@utils/Logger";
import { pageWindow } from "@utils/misc";

import {
    applyRowText,
    bindPending,
    clipText,
    fileIdsOf,
    freshSnaps,
    type OfficialItem,
    projectQueue,
    type QueueIntent,
    type QueueSnap,
    quoteText,
    sameQueue,
    shouldReplay,
} from "./sync";

const logger = new Logger("QueuePersist");

const ENQUEUE_FORCE = Symbol.for("voidpp.modeSync.enqueueIntent");

const DB_KEY = "queue-persist:v1";
const LOCAL_ACCOUNT = "local";
const SETTLE_MS = 450;
const RETRY_MS = 250;
const MAX_WAIT_MS = 8_000;
const ROW_SEL = '[aria-roledescription="sortable"], [aria-roledescription="draggable"]';
const TOGGLE_SEL = 'button[aria-label="Toggle queued messages"], button[aria-label*="queued" i]';
const RAIL_SEL = '[aria-label="Remove from queue"], [aria-label="Send now"], [aria-label="Edit queued message"]';
const SEND_NOW_SEL = '[aria-label="Send now"]';

interface Doc {
    version: 1;
    buckets: Record<string, Record<string, QueueSnap[]>>;
}

type SendFn = (...args: unknown[]) => unknown;

const memory = new Map<string, QueueSnap[]>();
const pending = new Map<string, QueueSnap[]>();
const decided = new Set<string>();
const restoring = new Set<string>();
const retried = new Set<string>();
const waits = new Map<string, number>();

let doc: Doc = { version: 1, buckets: {} };
let alive = false;
let ready = false;
let replaying = false;
let suppress = false;
let reconnects = 0;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerCid = "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let domTimer: ReturnType<typeof setTimeout> | null = null;
let obs: MutationObserver | null = null;
let origReconnect: SendFn | null = null;
let wrappedReconnect: SendFn | null = null;

function emptyDoc(): Doc {
    return { version: 1, buckets: {} };
}

function accountId(): string {
    try {
        const user = SessionStore.getSessionStoreState?.()?.user
            ?? SessionStore.sessionStoreState?.getState?.()?.user;
        return user?.userId || user?.xUserId || LOCAL_ACCOUNT;
    } catch {
        return LOCAL_ACCOUNT;
    }
}

function onImagine(): boolean {
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

function currentCid(): string {
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        const id = chat.conversationId || chat.optimisticConversationId;
        if (id) return String(id);
    } catch { /* store not ready */ }
    try {
        return String(RoutingStore.useRoutingStore.getState().route?.conversationId ?? "");
    } catch {
        return "";
    }
}

function liveIntent(): QueueIntent | undefined {
    const host = pageWindow as unknown as Record<symbol, unknown>;
    const forced = (host[ENQUEUE_FORCE] ?? host[Symbol.for("voidpp.modeSync.intent")]) as Partial<QueueIntent> | undefined;
    if (forced?.modeId) {
        return {
            modeId: String(forced.modeId),
            modelMode: String(forced.modelMode || ""),
            activeModelId: String(forced.activeModelId || ""),
        };
    }
    try {
        const modeId = String(ModesStore.useModesStore.getState().selectedModeId || "");
        if (!modeId) return undefined;
        const chat = ChatPageStore.useChatPageStore.getState();
        return {
            modeId,
            modelMode: String(chat.modelMode || ""),
            activeModelId: String(chat.activeModelId || ""),
        };
    } catch {
        return undefined;
    }
}

function withIntent<T>(intent: QueueIntent | undefined, fn: () => T): T {
    if (!intent?.modeId) return fn();
    let modes: ReturnType<typeof ModesStore.useModesStore.getState> | null = null;
    let chat: ReturnType<typeof ChatPageStore.useChatPageStore.getState> | null = null;
    let prevMode = "";
    let prevModel = "";
    let prevActive = "";
    try {
        modes = ModesStore.useModesStore.getState();
        chat = ChatPageStore.useChatPageStore.getState();
        prevMode = String(modes.selectedModeId || "");
        prevModel = String(chat.modelMode || "");
        prevActive = String(chat.activeModelId || "");
        if (prevMode !== intent.modeId) modes.setSelectedModeId(intent.modeId, { source: "sync" });
        if (intent.modelMode && prevModel !== intent.modelMode) chat.setModelMode(intent.modelMode as ModelMode);
        if (intent.activeModelId && prevActive !== intent.activeModelId) chat.setActiveModelId(intent.activeModelId as ModelId);
    } catch (e) {
        logger.debug("intent apply failed", e);
    }
    try {
        if (intent?.modeId) (pageWindow as unknown as Record<symbol, unknown>)[ENQUEUE_FORCE] = intent;
        return fn();
    } finally {
        delete (pageWindow as unknown as Record<symbol, unknown>)[ENQUEUE_FORCE];
        try {
            if (modes && prevMode && modes.selectedModeId !== prevMode) modes.setSelectedModeId(prevMode, { source: "sync" });
            if (chat && prevModel && String(chat.modelMode || "") !== prevModel) chat.setModelMode(prevModel as ModelMode);
            if (chat && prevActive && String(chat.activeModelId || "") !== prevActive) chat.setActiveModelId(prevActive as ModelId);
        } catch (e) {
            logger.debug("intent restore failed", e);
        }
    }
}

function qid(item: GatewayQueueItem): string {
    const rec = item as GatewayQueueItem & { queueItemId?: string };
    return String(rec.queue_item_id || rec.queueItemId || "");
}

function qparent(item: GatewayQueueItem): string | null {
    const rec = item as GatewayQueueItem & { parentResponseId?: string | null };
    const parent = rec.parent_response_id ?? rec.parentResponseId;
    return parent == null || parent === "" ? null : String(parent);
}

function nodeFields(conv: GatewayConversation, id: string): Pick<OfficialItem, "text" | "fileAttachmentIds" | "parentQuotedText"> {
    const node = conv.nodes?.[id];
    const content = node?.content as { message?: unknown; query?: unknown; parentQuotedText?: unknown; fileAttachments?: unknown; fileUris?: unknown } | undefined;
    if (!content) return { text: "", fileAttachmentIds: [], parentQuotedText: "" };
    return {
        text: clipText(content.message) || clipText(content.query),
        fileAttachmentIds: fileIdsOf(content.fileAttachments ?? content.fileUris),
        parentQuotedText: quoteText(content.parentQuotedText),
    };
}

function toOfficial(conv: GatewayConversation | undefined): OfficialItem[] {
    if (!conv?.queue?.length) return [];
    return conv.queue.map(item => {
        const id = qid(item);
        const fields = nodeFields(conv, id);
        return {
            id,
            position: Number(item.position) || 0,
            parentId: qparent(item),
            ...fields,
        };
    }).filter(item => item.id);
}

function readOfficial(cid: string): OfficialItem[] {
    try {
        return toOfficial(MessageStore.useMessageStore.getState().conversations?.[cid]);
    } catch {
        return [];
    }
}

function idSet(cid: string): Set<string> {
    return new Set(readOfficial(cid).map(item => item.id));
}

function localId(): string {
    seq += 1;
    return `pending:${seq}`;
}

function pushPending(cid: string, snap: QueueSnap) {
    const list = pending.get(cid) ?? [];
    list.push(snap);
    pending.set(cid, list);
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
    return rows;
}

function rowTexts(ids: string[]): { id: string; text: string }[] {
    const card = trayCard();
    if (!card) return [];
    const rows = queueRows(card);
    const out: { id: string; text: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = row.getAttribute("data-void-qitem") || ids[i] || "";
        const text = (row.querySelector(".line-clamp-2")?.textContent ?? "").trim();
        if (id && text) out.push({ id, text });
    }
    return out;
}

function remember(cid: string, next: QueueSnap[]) {
    const prev = memory.get(cid) ?? [];
    if (sameQueue(prev, next)) return;
    if (next.length) memory.set(cid, next);
    else memory.delete(cid);
    persistSoon();
}

function syncOne(cid: string, hydrated: boolean) {
    const now = Date.now();
    const official = readOfficial(cid);
    const bound = bindPending(freshSnaps(memory.get(cid) ?? [], now), official, pending.get(cid) ?? [], now);
    if (bound.pending.length) pending.set(cid, bound.pending);
    else pending.delete(cid);
    let next = projectQueue(bound.saved, official, bound.pending, hydrated, now);
    if (hydrated && !replaying && cid === currentCid()) next = applyRowText(next, rowTexts(next.map(item => item.id)), now);
    remember(cid, next);
}

function syncFromStore() {
    if (!ready || replaying || onImagine()) return;
    let convs: Record<string, GatewayConversation> = {};
    try {
        convs = MessageStore.useMessageStore.getState().conversations ?? {};
    } catch {
        return;
    }
    const seen = new Set<string>();
    for (const cid of Object.keys(convs)) {
        seen.add(cid);
        syncOne(cid, decided.has(cid));
    }
    for (const cid of memory.keys()) {
        if (seen.has(cid) || !decided.has(cid)) continue;
        syncOne(cid, true);
    }
}

function bucketsToMemory(account: string) {
    const primary = doc.buckets[account] ?? {};
    const local = account === LOCAL_ACCOUNT ? {} : (doc.buckets[LOCAL_ACCOUNT] ?? {});
    const cids = new Set([...Object.keys(primary), ...Object.keys(local), ...memory.keys()]);
    const now = Date.now();
    for (const cid of cids) {
        const fromPrimary = freshSnaps(primary[cid] ?? [], now);
        const fromLocal = freshSnaps(local[cid] ?? [], now);
        const disk = fromPrimary.length ? fromPrimary : fromLocal;
        const live = memory.get(cid) ?? [];
        if (!live.length && disk.length) memory.set(cid, disk);
    }
}

function recordBuckets(): Record<string, QueueSnap[]> {
    const now = Date.now();
    const out: Record<string, QueueSnap[]> = {};
    for (const [cid, items] of memory) {
        const fresh = freshSnaps(items, now);
        if (fresh.length) out[cid] = fresh;
    }
    return out;
}

function persistSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        void persist();
    }, 80);
}

async function persist() {
    if (!alive) return;
    const account = accountId();
    doc.buckets[account] = recordBuckets();
    if (account !== LOCAL_ACCOUNT && doc.buckets[LOCAL_ACCOUNT]) {
        for (const cid of Object.keys(doc.buckets[account] ?? {})) delete doc.buckets[LOCAL_ACCOUNT][cid];
        if (!Object.keys(doc.buckets[LOCAL_ACCOUNT]).length) delete doc.buckets[LOCAL_ACCOUNT];
    }
    try {
        await idbSet(DB_KEY, doc);
    } catch (e) {
        logger.debug("persist failed", e);
    }
}

async function load() {
    try {
        const raw = await idbGet<Doc>(DB_KEY);
        if (raw && raw.version === 1 && raw.buckets && typeof raw.buckets === "object") doc = raw;
        else doc = emptyDoc();
    } catch (e) {
        logger.debug("load failed", e);
        doc = emptyDoc();
    }
    bucketsToMemory(accountId());
}

function loadBusy(cid: string): boolean {
    try {
        const state = ResponseStore.useResponseStore.getState();
        return !!(
            state.initialResponsesPromisesByConversationId?.[cid]
            || state.nodesPromisesByConversationId?.[cid]
            || state.inflightPromisesByConversationId?.[cid]
        );
    } catch {
        return false;
    }
}

function scheduleCurrent() {
    if (!alive || !ready || replaying) return;
    const cid = currentCid();
    if (!cid || onImagine() || decided.has(cid) || restoring.has(cid)) return;
    if (timer && timerCid !== cid) {
        clearTimeout(timer);
        timer = null;
    }
    timerCid = cid;
    if (!waits.has(cid)) waits.set(cid, Date.now());
    const elapsed = Date.now() - (waits.get(cid) ?? 0);
    const busy = (loadBusy(cid) || reconnects > 0) && elapsed < MAX_WAIT_MS;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        void restore(cid);
    }, busy ? RETRY_MS : SETTLE_MS);
}

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function replay(cid: string, saved: QueueSnap[]): Promise<QueueSnap[]> {
    const placed: QueueSnap[] = [];
    const ordered = freshSnaps(saved, Date.now()).slice().sort((a, b) => a.position - b.position);
    for (const item of ordered) {
        const before = idSet(cid);
        suppress = true;
        try {
            await withIntent(item.intent, () => {
                const state = MessageStore.useMessageStore.getState();
                return state.queueMessage({
                    convId: cid,
                    parentId: item.parentId,
                    text: item.text,
                    fileAttachmentIds: item.fileAttachmentIds.length ? item.fileAttachmentIds : undefined,
                    parentQuotedText: item.parentQuotedText || undefined,
                });
            });
        } catch (e) {
            logger.debug("replay failed", e);
        } finally {
            suppress = false;
        }
        let neu = readOfficial(cid).find(off => !before.has(off.id));
        if (!neu) {
            await sleep(40);
            neu = readOfficial(cid).find(off => !before.has(off.id));
        }
        if (neu) {
            placed.push({
                ...item,
                id: neu.id,
                position: neu.position,
                parentId: neu.parentId,
                savedAt: Date.now(),
            });
        } else {
            placed.push(item);
        }
    }
    return placed;
}

async function restore(cid: string) {
    if (!alive || !ready || decided.has(cid) || restoring.has(cid) || replaying) return;
    if (currentCid() !== cid || onImagine()) return;
    const elapsed = Date.now() - (waits.get(cid) ?? 0);
    if ((loadBusy(cid) || reconnects > 0) && elapsed < MAX_WAIT_MS) {
        scheduleCurrent();
        return;
    }
    const official = readOfficial(cid);
    if (official.length) {
        syncOne(cid, true);
        decided.add(cid);
        return;
    }
    const saved = freshSnaps(memory.get(cid) ?? [], Date.now());
    if (!shouldReplay(0, saved, Date.now())) {
        syncOne(cid, true);
        decided.add(cid);
        return;
    }
    restoring.add(cid);
    replaying = true;
    let retry = false;
    try {
        const placed = await replay(cid, saved);
        const after = readOfficial(cid);
        if (!after.length) {
            memory.set(cid, saved);
            persistSoon();
            if (!retried.has(cid)) {
                retried.add(cid);
                waits.set(cid, Date.now());
                retry = true;
            } else {
                decided.add(cid);
            }
        } else {
            memory.set(cid, placed);
            persistSoon();
            decided.add(cid);
        }
    } catch (e) {
        logger.debug("restore failed", e);
        retry = true;
    } finally {
        replaying = false;
        restoring.delete(cid);
    }
    if (retry || !decided.has(cid)) scheduleCurrent();
    else if (readOfficial(cid).length) syncOne(cid, true);
}

function snapFromArgs(raw: unknown): { cid: string; snap: QueueSnap } | null {
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as GatewayTurnArgs;
    const cid = String(rec.convId || "");
    if (!cid) return null;
    const text = clipText(rec.text);
    const fileAttachmentIds = fileIdsOf(rec.fileAttachmentIds);
    if (!text && !fileAttachmentIds.length) return null;
    return {
        cid,
        snap: {
            id: localId(),
            text,
            fileAttachmentIds,
            parentQuotedText: quoteText(rec.parentQuotedText),
            parentId: rec.parentId ?? null,
            intent: liveIntent(),
            position: 1_000_000,
            savedAt: Date.now(),
        },
    };
}

export function noteEnqueue(args: unknown[]) {
    if (!alive || suppress || onImagine()) return;
    const parsed = snapFromArgs(args[0]);
    if (parsed) pushPending(parsed.cid, parsed.snap);
}

export function afterEnqueue() {
    if (alive && ready && !replaying) syncFromStore();
}

function wrapReconnect() {
    let state: ChatPageStoreState;
    try {
        state = ChatPageStore.useChatPageStore.getState();
    } catch {
        return;
    }
    const current = state.reconnectToInflightResponses as SendFn | undefined;
    if (typeof current !== "function" || current === wrappedReconnect) return;
    origReconnect = current;
    const wrapped: SendFn = function voidQueuePersistReconnect(this: unknown, ...args: unknown[]) {
        reconnects += 1;
        let result: unknown;
        try {
            result = origReconnect?.apply(this, args);
        } catch (e) {
            reconnects = Math.max(0, reconnects - 1);
            throw e;
        }
        void Promise.resolve(result).finally(() => {
            reconnects = Math.max(0, reconnects - 1);
            scheduleCurrent();
        });
        return result;
    };
    wrappedReconnect = wrapped;
    ChatPageStore.useChatPageStore.setState({ reconnectToInflightResponses: wrapped as ChatPageStoreState["reconnectToInflightResponses"] });
}

function unwrapReconnect() {
    if (!origReconnect || !wrappedReconnect) return;
    try {
        const state = ChatPageStore.useChatPageStore.getState();
        if (state.reconnectToInflightResponses === wrappedReconnect) {
            ChatPageStore.useChatPageStore.setState({ reconnectToInflightResponses: origReconnect as ChatPageStoreState["reconnectToInflightResponses"] });
        }
    } catch { /* store gone */ }
    origReconnect = null;
    wrappedReconnect = null;
}

function scheduleDom() {
    if (domTimer || !ready || replaying) return;
    domTimer = setTimeout(() => {
        domTimer = null;
        const cid = currentCid();
        if (!alive || !ready || replaying || onImagine() || !cid || !decided.has(cid)) return;
        syncOne(cid, true);
    }, 200);
}

function bindObs() {
    obs?.disconnect();
    const root = document.querySelector("main") ?? document.body;
    obs = new MutationObserver(() => scheduleDom());
    obs.observe(root, { childList: true, subtree: true, characterData: true });
}

function onPersistStore() {
    if (!alive) return;
    syncFromStore();
    scheduleCurrent();
}

function onPersistPage() {
    if (!alive) return;
    wrapReconnect();
    scheduleCurrent();
}

async function boot() {
    await load();
    if (!alive) return;
    ready = true;
    wrapReconnect();
    bindObs();
    syncFromStore();
    scheduleCurrent();
}

export function startPersist() {
    if (alive) return;
    alive = true;
    ready = false;
    void boot();
}

export function stopPersist() {
    if (!alive && !ready) return;
    alive = false;
    ready = false;
    replaying = false;
    suppress = false;
    reconnects = 0;
    if (timer) clearTimeout(timer);
    timer = null;
    timerCid = "";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (domTimer) clearTimeout(domTimer);
    domTimer = null;
    obs?.disconnect();
    obs = null;
    unwrapReconnect();
    memory.clear();
    pending.clear();
    decided.clear();
    restoring.clear();
    retried.clear();
    waits.clear();
    doc = emptyDoc();
    lastQueueKey = "";
    lastNavKey = "";
}

export function persistQueueKey(s: MessageStoreState) {
    return Object.entries(s.conversations ?? {}).map(([cid, conv]) => {
        const items = [...(conv.queue ?? [])].sort((a, b) => a.position - b.position);
        return `${cid}=${items.map(item => `${qid(item)}:${item.position}:${nodeFields(conv, qid(item)).text.length}`).join(",")}`;
    }).sort().join("|");
}

let lastQueueKey = "";
let lastNavKey = "";

export function onPersistQueue() {
    let key = "";
    try {
        key = persistQueueKey(MessageStore.useMessageStore.getState());
    } catch {
        key = "";
    }
    if (key === lastQueueKey) return;
    lastQueueKey = key;
    onPersistStore();
}

export function persistChatKey(s: ChatPageStoreState) {
    return `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.chatPageLoaded ? 1 : 0}`;
}

export function persistResponseKey(s: ResponseStoreState) {
    return `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.inflightPromisesByConversationId ?? {}).join(",")}`;
}

export function persistRouteKey(s: RoutingStoreState) {
    return `${s.route?.page ?? ""}|${s.route?.conversationId ?? ""}`;
}

export function onPersistNav() {
    let key = "";
    try {
        key = [
            persistChatKey(ChatPageStore.useChatPageStore.getState()),
            persistRouteKey(RoutingStore.useRoutingStore.getState()),
            persistResponseKey(ResponseStore.useResponseStore.getState()),
        ].join("|");
    } catch {
        key = "";
    }
    if (key === lastNavKey) return;
    lastNavKey = key;
    onPersistPage();
}
