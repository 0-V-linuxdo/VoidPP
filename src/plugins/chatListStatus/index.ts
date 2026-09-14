/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { VoidPPEventMap } from "@api/Events";
import { LoaderCircleIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ConversationStoreState, GrokConversation } from "@grok-types/stores/ConversationStore";
import type { GrokResponse, ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import type { ZustandStore } from "@grok-types/zustand";
import { ChatPageStore, ConversationStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { getModuleCache, isBlacklisted, onModuleLoad, silenceWarns, syncLazyModules } from "@turbopack/patchTurbopack";
import { isZustandStore } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

const logger = new Logger("ChatListStatus");
const MARK = "void-cls";
const LIVE = new Set(["streaming", "optimistic", "reconnecting", "in_progress", "in-progress"]);
const DEAD = new Set(["closed", "error", "done", "completed", "complete", "cancelled", "canceled", "aborted", "idle", "success", "worked", "failed"]);
const LIVE_WORD = /^(working|running|in[_-]?progress|executing|processing|pending|continuing|started)$/i;
const LIVE_FLAG = /^(isWorking|isRunning|inProgress|isInProgress|isExecuting|working)$/;
const SKIP_KEY = /^(message|content|html|query|text|title|thinkingTrace)$/i;
const EXTRA_HINT = /computer|sandbox|agent|task|working/i;
const OWN_HOOKS = new Set(["useChatPageStore", "useConversationStore", "useResponseStore", "useRoutingStore"]);
const SIDEBAR = '[data-sidebar="sidebar"], [data-sidebar="content"]';
const HOST = '[data-sidebar="menu-button"], [data-sidebar="menu-sub-button"]';
const ROW = 'a[href*="/c/"], a[href*="/chat/"], a[href*="chat="]';
const SPIN_PATH = "M21 12a9 9 0 1 1-6.219-8.56";

type Kind = "streaming" | "done" | "error";

const marks = new Map<string, Kind>();
const rowById = new Map<string, HTMLElement>();
const extraStores: ZustandStore<any>[] = [];
let extraSeen = new WeakSet<object>();
const extraScanned = new Set<number>();
const extraUnsubs: Array<() => void> = [];
let raf = 0;
let extraScanRaf = 0;
let extraBusy = false;
let started = false;
let obs: MutationObserver | null = null;
let extraOff: (() => void) | null = null;

function isConvId(value: unknown): value is string {
    return typeof value === "string" && value.length >= 8 && /^[a-z0-9_-]+$/i.test(value);
}

function isLiveStatus(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const status = value.trim().toLowerCase();
    if (!status || DEAD.has(status)) return false;
    return LIVE.has(status) || LIVE_WORD.test(status);
}

function isLiveBag(value: unknown, depth = 0): boolean {
    if (value == null || depth > 5) return false;
    if (typeof value === "string") return isLiveStatus(value);
    if (typeof value !== "object") return false;
    if (Array.isArray(value)) {
        const start = Math.max(0, value.length - 24);
        for (let i = value.length - 1; i >= start; i--) {
            if (isLiveBag(value[i], depth + 1)) return true;
        }
        return false;
    }
    const rec = value as Record<string, any>;
    if (isLiveStatus(rec.status ?? rec.state ?? rec.phase ?? rec.activity ?? rec.taskStatus)) return true;
    if (rec.workingFor || rec.working_for || rec.workingDuration) return true;
    let n = 0;
    for (const [key, child] of Object.entries(rec)) {
        if (++n > 48) break;
        if (SKIP_KEY.test(key)) continue;
        if (LIVE_FLAG.test(key) && child === true) return true;
        if (isLiveBag(child, depth + 1)) return true;
    }
    return false;
}

function isLiveResponse(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    if (r.partial) return true;
    if (isLiveBag(r.steps) || isLiveBag(r.toolResponses) || isLiveBag(r.fastToolResponse) || isLiveBag(r.metadata)) return true;
    const state = r.state ?? "";
    if (!state) return false;
    if (LIVE.has(state)) return true;
    return !DEAD.has(state.toLowerCase());
}

function isErrorResponse(r: GrokResponse | undefined): boolean {
    return !!r && (r.state === "error" || r.error != null);
}

function collectConvIds(value: unknown, out: Set<string>, depth = 0) {
    if (value == null || typeof value !== "object" || depth > 5) return;
    if (Array.isArray(value)) {
        const start = Math.max(0, value.length - 16);
        for (let i = start; i < value.length; i++) collectConvIds(value[i], out, depth + 1);
        return;
    }
    const rec = value as Record<string, any>;
    const id = rec.conversationId ?? rec.optimisticConversationId ?? rec.chat ?? rec.conversation_id;
    if (isConvId(id) && isLiveBag(rec)) out.add(id);
    let n = 0;
    for (const [key, child] of Object.entries(rec)) {
        if (++n > 48) break;
        if (SKIP_KEY.test(key)) continue;
        if (isConvId(key) && isLiveBag(child)) out.add(key);
        collectConvIds(child, out, depth + 1);
    }
}

function currentIds(): string[] {
    const ids: string[] = [];
    const add = (value: unknown) => {
        if (isConvId(value) && !ids.includes(value)) ids.push(value);
    };
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        add(page.conversationId);
        add(page.optimisticConversationId);
    } catch (e) {
        logger.debug("page ids unavailable:", e);
    }
    try {
        const { route } = RoutingStore.useRoutingStore.getState();
        add(route.conversationId);
        add(route.chat);
    } catch (e) {
        logger.debug("route ids unavailable:", e);
    }
    try {
        const url = new URL(location.href);
        add(url.searchParams.get("chat"));
        add(url.searchParams.get("conversationId"));
        add(url.pathname.match(/^\/(?:c|chat)\/([^/?#]+)/i)?.[1]);
    } catch (e) {
        logger.debug("url ids unavailable:", e);
    }
    return ids;
}

function considerConversation(ids: Set<string>, conversation: GrokConversation | undefined) {
    if (!conversation?.conversationId) return;
    if (conversation.state === "open" || isLiveBag(conversation.taskResult)) ids.add(conversation.conversationId);
}

function looksExtraStore(name: string, state: object): boolean {
    if (EXTRA_HINT.test(name)) return true;
    const keys = Object.keys(state);
    if (keys.some(key => EXTRA_HINT.test(key))) return true;
    let n = 0;
    for (const child of Object.values(state as Record<string, any>)) {
        if (++n > 8) break;
        if (child && typeof child === "object" && !Array.isArray(child) && Object.keys(child).slice(0, 16).some(key => EXTRA_HINT.test(key))) return true;
    }
    return false;
}

function scanModule(exports: unknown) {
    if (exports == null || typeof exports !== "object" || isBlacklisted(exports)) return;
    const mod = exports as Record<string, unknown>;
    for (const key of Object.keys(mod)) {
        if (OWN_HOOKS.has(key)) continue;
        const val = mod[key];
        if (!isZustandStore(val) || extraSeen.has(val)) continue;
        let state: object;
        try {
            state = val.getState();
        } catch {
            continue;
        }
        if (!state || typeof state !== "object") continue;
        if (!looksExtraStore(key, state)) continue;
        extraSeen.add(val);
        extraStores.push(val);
        extraUnsubs.push(val.subscribe(() => schedule()));
        logger.info("extra store", key);
    }
}

function attachExtraStores() {
    if (extraBusy) return;
    extraBusy = true;
    try {
        silenceWarns(() => syncLazyModules());
        const before = extraStores.length;
        for (const [id, exports] of getModuleCache()) {
            if (extraScanned.has(id)) continue;
            extraScanned.add(id);
            scanModule(exports);
        }
        if (extraStores.length !== before) schedule();
    } finally {
        extraBusy = false;
    }
}

function queueExtraScan() {
    if (!started || extraScanRaf) return;
    extraScanRaf = requestAnimationFrame(() => {
        extraScanRaf = 0;
        if (started) attachExtraStores();
    });
}

function extraLiveIds(ids: Set<string>) {
    for (const store of extraStores) {
        let state: any;
        try {
            state = store.getState();
        } catch {
            continue;
        }
        if (!isLiveBag(state)) continue;
        const found = new Set<string>();
        collectConvIds(state, found);
        if (found.size) {
            for (const id of found) ids.add(id);
            continue;
        }
        for (const id of currentIds()) ids.add(id);
    }
}

function liveIds(): Set<string> {
    const ids = new Set<string>();
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        const currents = currentIds();
        if (page.streamedMessageId || page.showStreamingIndicator || isLiveBag(page.sidePanelContent) || isLiveBag(page.metadata)) {
            for (const id of currents) ids.add(id);
        }
        const { byId, byConversationId, inflightPromisesByConversationId } = ResponseStore.useResponseStore.getState();
        if (isLiveResponse(byId[page.streamedMessageId ?? ""]) || isLiveResponse(byId[page.lastMessageId ?? ""]) || isLiveResponse(byId[page.sidePanelResponseId ?? ""])) {
            for (const id of currents) ids.add(id);
        }
        for (const id of Object.keys(inflightPromisesByConversationId ?? {})) ids.add(id);
        for (const [id, list] of Object.entries(byConversationId ?? {})) {
            if (list?.some(isLiveResponse)) ids.add(id);
        }
    } catch (e) {
        logger.debug("stream stores unavailable:", e);
    }
    try {
        const { byId, byIdWithWorkspaces, list } = ConversationStore.useConversationStore.getState();
        for (const conversation of list ?? []) considerConversation(ids, conversation);
        for (const conversation of Object.values(byId ?? {})) considerConversation(ids, conversation);
        for (const conversation of Object.values(byIdWithWorkspaces ?? {})) considerConversation(ids, conversation);
    } catch (e) {
        logger.debug("conversation store unavailable:", e);
    }
    extraLiveIds(ids);
    return ids;
}

function errorOf(id: string): boolean {
    try {
        const { byConversationId, byId } = ResponseStore.useResponseStore.getState();
        const list = byConversationId[id];
        if (list?.length) {
            for (let i = list.length - 1; i >= 0; i--) {
                const r = list[i];
                if (String(r.sender ?? "").toLowerCase() === "human") continue;
                return isErrorResponse(r);
            }
        }
        const page = ChatPageStore.useChatPageStore.getState();
        if ((page.conversationId === id || page.optimisticConversationId === id) && page.lastMessageId) {
            return isErrorResponse(byId[page.lastMessageId]);
        }
    } catch (e) {
        logger.debug("error lookup failed:", e);
    }
    return false;
}

function refreshMarks() {
    const live = liveIds();
    const opened = new Set(currentIds());
    for (const id of live) marks.set(id, "streaming");
    for (const [id, kind] of marks) {
        let next = kind;
        if (kind === "streaming" && !live.has(id)) {
            next = errorOf(id) ? "error" : "done";
            marks.set(id, next);
        }
        if (next !== "streaming" && opened.has(id)) marks.delete(id);
    }
}

function convOfResponse(responseId: string): string {
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const [id, list] of Object.entries(byConversationId ?? {})) {
            if (list?.some(r => r.responseId === responseId)) return id;
        }
        return currentIds()[0] ?? "";
    } catch (e) {
        logger.debug("conv lookup failed:", e);
        return "";
    }
}

function onStreamEnd({ responseId }: VoidPPEventMap["streamEnd"]) {
    const cid = convOfResponse(responseId);
    if (!cid) return;
    if (liveIds().has(cid)) {
        schedule();
        return;
    }
    if (currentIds().includes(cid)) {
        marks.delete(cid);
        schedule();
        return;
    }
    try {
        const response = ResponseStore.useResponseStore.getState().byId[responseId];
        marks.set(cid, isErrorResponse(response) ? "error" : "done");
    } catch (e) {
        logger.debug("streamEnd failed:", e);
        marks.set(cid, "done");
    }
    schedule();
}

function idFromHref(href: string): string {
    if (!href) return "";
    try {
        const u = new URL(href, location.origin);
        const id = u.searchParams.get("chat")
            || u.searchParams.get("conversationId")
            || u.pathname.match(/^\/(?:c|chat)\/([^/?#]+)/i)?.[1]
            || "";
        return isConvId(id) ? id : "";
    } catch {
        return "";
    }
}

function hrefId(el: Element): string {
    const a = el instanceof HTMLAnchorElement ? el : el.closest("a[href]") ?? el.querySelector("a[href]");
    return idFromHref(a?.getAttribute("href") ?? el.getAttribute("href") ?? "");
}

function rowHost(el: HTMLElement, root: Element): HTMLElement | null {
    if (el.classList.contains(MARK)) return null;
    if (el.closest('[data-sidebar="menu-action"], [data-sidebar="footer"], [data-sidebar="header"]')) return null;
    if (!hrefId(el)) return null;
    const wrapped = el.closest<HTMLElement>(HOST);
    return wrapped && root.contains(wrapped) ? wrapped : el;
}

function isNestedHost(el: HTMLElement): boolean {
    if (el.matches('[data-sidebar="menu-sub-button"]')) return true;
    const a = el instanceof HTMLAnchorElement ? el : el.querySelector("a[href]");
    const href = a?.getAttribute("href") ?? el.getAttribute("href") ?? "";
    return href.includes("chat=") || href.includes("/project/");
}

function spinSvg(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", SPIN_PATH);
    svg.append(path);
    return svg;
}

function ensureMark(btn: HTMLElement, kind: Kind) {
    btn.toggleAttribute("data-void-cls-nest", isNestedHost(btn));
    let mark = btn.querySelector<HTMLElement>(`:scope > .${MARK}`);
    if (!mark) {
        mark = document.createElement("span");
        mark.className = MARK;
        mark.setAttribute("aria-hidden", "true");
        btn.prepend(mark);
    }
    if (mark.dataset.kind === kind && (kind !== "streaming" || mark.querySelector("svg"))) return;
    mark.dataset.kind = kind;
    mark.replaceChildren();
    if (kind === "streaming") mark.append(spinSvg());
}

function clearMark(btn: HTMLElement) {
    btn.querySelector(`:scope > .${MARK}`)?.remove();
    btn.removeAttribute("data-void-cls-nest");
}

function roots(): Element[] {
    const found = [...document.querySelectorAll(SIDEBAR)];
    return found.length ? found : [document.body];
}

function rowForId(root: Element, id: string): HTMLElement | null {
    if (!isConvId(id)) return null;
    for (const a of root.querySelectorAll<HTMLElement>(`a[href*="${id}"]`)) {
        if (hrefId(a) !== id) continue;
        const host = rowHost(a, root);
        if (host) return host;
    }
    return null;
}

function paint() {
    if (!started) return;
    refreshMarks();
    const usedIds = new Set<string>();
    const seen = new Set<HTMLElement>();

    for (const root of roots()) {
        for (const el of root.querySelectorAll<HTMLElement>(ROW)) {
            const host = rowHost(el, root);
            if (!host || seen.has(host)) continue;
            seen.add(host);
            const id = hrefId(host);
            if (!id) {
                clearMark(host);
                continue;
            }
            usedIds.add(id);
            rowById.set(id, host);
            const kind = marks.get(id);
            if (kind) ensureMark(host, kind);
            else clearMark(host);
        }
    }

    for (const [id, el] of rowById) {
        if (!el.isConnected || !usedIds.has(id)) rowById.delete(id);
    }

    for (const [id, kind] of marks) {
        if (rowById.get(id)?.isConnected) continue;
        for (const root of roots()) {
            const host = rowForId(root, id);
            if (!host) continue;
            rowById.set(id, host);
            ensureMark(host, kind);
            break;
        }
    }

    const live = [...marks].filter(([, kind]) => kind === "streaming").map(([id]) => id);
    if (live.length && !rowById.size) logger.info("live ids with no rows", live);
}

function schedule() {
    if (!started || raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (started) paint();
    });
}

function ownMutation(list: MutationRecord[]): boolean {
    if (!list.length) return false;
    for (const m of list) {
        const { target } = m;
        if (target instanceof Element && (target.classList.contains(MARK) || target.closest(`.${MARK}`))) continue;
        for (const n of m.addedNodes) {
            if (n instanceof Element && (n.classList.contains(MARK) || n.querySelector(`.${MARK}`))) continue;
            return false;
        }
        for (const n of m.removedNodes) {
            if (n instanceof Element && n.classList.contains(MARK)) continue;
            return false;
        }
        if (m.type === "attributes") return false;
    }
    return true;
}

function observe() {
    obs?.disconnect();
    obs = new MutationObserver(list => {
        if (ownMutation(list)) return;
        schedule();
    });
    const node = document.querySelector(SIDEBAR) ?? document.body;
    obs.observe(node, node === document.body
        ? { childList: true, subtree: true }
        : { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
}

function pageKey(s: ChatPageStoreState): string {
    return `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.streamedMessageId ?? ""}|${s.lastMessageId ?? ""}|${s.sidePanelResponseId ?? ""}|${s.showStreamingIndicator ? 1 : 0}`;
}

function responseKey(s: ResponseStoreState): string {
    const inflight = Object.keys(s.inflightPromisesByConversationId ?? {}).join(",");
    const bits: string[] = [];
    for (const [id, list] of Object.entries(s.byConversationId ?? {})) {
        const last = list?.[list.length - 1];
        if (!last) continue;
        bits.push(`${id}:${last.responseId}:${last.state ?? ""}:${last.partial ? 1 : 0}:${last.steps?.length ?? 0}`);
    }
    return `${inflight}|${bits.join(",")}`;
}

function conversationKey(s: ConversationStoreState): string {
    const rows = s.list?.length ? s.list : Object.values(s.byId ?? {});
    return rows.map(conversation => `${conversation?.conversationId ?? ""}:${conversation?.state ?? ""}`).join(",");
}

function routeKey(s: RoutingStoreState): string {
    const { route } = s;
    return `${route.conversationId ?? ""}|${route.chat ?? ""}|${route.workspaceId ?? ""}`;
}

export default definePlugin({
    name: "ChatListStatus",
    icon: LoaderCircleIcon,
    description: "Show Grok reply status on sidebar chats: spinner, blue dot, or error.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.TurbopackReady,
    managedStyle: "chatListStatus",
    cleanupSelectors: [`.${MARK}`],

    start() {
        started = true;
        attachExtraStores();
        extraOff = onModuleLoad(() => queueExtraScan());
        observe();
        schedule();
    },

    stop() {
        started = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (extraScanRaf) cancelAnimationFrame(extraScanRaf);
        extraScanRaf = 0;
        obs?.disconnect();
        obs = null;
        extraOff?.();
        extraOff = null;
        for (const unsub of extraUnsubs) unsub();
        extraUnsubs.length = 0;
        extraStores.length = 0;
        extraSeen = new WeakSet();
        extraScanned.clear();
        for (const el of document.querySelectorAll(`.${MARK}`)) {
            el.parentElement?.removeAttribute("data-void-cls-nest");
            el.remove();
        }
        marks.clear();
        rowById.clear();
    },

    events: {
        streamEnd: onStreamEnd,
    },

    zustand: {
        ChatPageStore: {
            selector: pageKey,
            handler: schedule,
        },
        ResponseStore: {
            selector: responseKey,
            handler: schedule,
        },
        ConversationStore: {
            selector: conversationKey,
            handler: schedule,
        },
        RoutingStore: {
            selector: routeKey,
            handler: schedule,
        },
    },
});
