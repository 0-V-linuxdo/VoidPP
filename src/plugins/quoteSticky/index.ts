/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TextQuoteIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, MessageStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

const logger = new Logger("QuoteSticky");
const KEEP = 40;
const QUERY = ".query-bar";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
const KEEP_BTN = /submit|send|attach|dictat|mode|file/i;
const CHAT_POST = /\/rest\/app-chat\/conversations/;
const POKE_MS = [0, 50, 200, 500, 1000];

interface Snap {
    text: string;
    popup: unknown;
}

type SendFn = (...args: unknown[]) => unknown;

const saved = new Map<string, Snap>();
const origFns = new Map<string, SendFn>();
const wrappedFns = new Map<string, SendFn>();
const pokeTimers: ReturnType<typeof setTimeout>[] = [];

let lastKey = "";
let lastText = "";
let lastPopup: unknown;
let applying = false;
let abort: AbortController | null = null;
let observer: MutationObserver | null = null;
let origFetch: typeof fetch | null = null;
let pokeRaf = 0;
let mutRaf = 0;

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

function projectId(): string {
    try {
        return String(ChatPageStore.useChatPageStore.getState().projectId || "");
    } catch {
        return "";
    }
}

function routeCid(): string {
    try {
        return String(RoutingStore.useRoutingStore.getState().route.conversationId ?? "");
    } catch {
        return "";
    }
}

function pageCid(): string {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return String(s.conversationId || s.optimisticConversationId || "");
    } catch {
        return "";
    }
}

function pathCid(): string {
    try {
        return location.pathname.match(UUID)?.[0] || "";
    } catch {
        return "";
    }
}

function liveKey(): string {
    for (const id of [routeCid(), pageCid(), pathCid()]) {
        if (id && UUID.test(id)) return id;
    }
    return `home:${projectId()}`;
}

function popupSig(p: unknown): string {
    if (p == null) return "";
    if (typeof p !== "object") return String(p);
    const rec = p as Record<string, unknown>;
    return String(rec.responseId ?? rec.parentResponseId ?? rec.id ?? rec.quotedText ?? "1");
}

function chatSel(s: ChatPageStoreState): string {
    return `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.quotedText ?? ""}|${s.chatPageLoaded ? 1 : 0}|${popupSig(s.quotePopupData)}`;
}

function hydrateSel(s: ResponseStoreState): string {
    return `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}`;
}

function readText(): { key: string; text: string; popup: unknown } {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return { key: liveKey(), text: String(s.quotedText || ""), popup: s.quotePopupData };
    } catch {
        return { key: liveKey(), text: "", popup: undefined };
    }
}

function remember(key: string, snap: Snap) {
    if (!key || !snap.text) return;
    saved.delete(key);
    saved.set(key, snap);
    while (saved.size > KEEP) {
        const oldest = saved.keys().next().value;
        if (oldest === undefined) break;
        saved.delete(oldest);
    }
}

function stashOutgoing() {
    if (lastKey && lastText) remember(lastKey, { text: lastText, popup: lastPopup });
}

function drop(key: string) {
    if (key) saved.delete(key);
    if (key === lastKey) {
        lastText = "";
        lastPopup = undefined;
    }
}

function applyQuote(text: string, popup: unknown) {
    const chat = ChatPageStore.useChatPageStore.getState();
    applying = true;
    try {
        if (chat.quotedText !== text) chat.setQuotedText(text);
        if (typeof chat.setQuotePopupData === "function" && chat.quotePopupData !== popup) chat.setQuotePopupData(popup);
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function restore(key: string) {
    if (!key || onImaginePage()) return;
    const snap = saved.get(key);
    if (!snap?.text) return;
    try {
        if (liveKey() !== key) return;
        const chat = ChatPageStore.useChatPageStore.getState();
        const live = String(chat.quotedText || "");
        if (live === snap.text && popupSig(chat.quotePopupData) === popupSig(snap.popup)) return;
        applyQuote(snap.text, snap.popup);
        logger.info("restored", key);
    } catch (e) {
        logger.debug("restore failed", e);
    }
}

function chipVisible(text: string): boolean {
    const bar = document.querySelector(QUERY);
    if (!(bar instanceof HTMLElement) || !text) return false;
    const clip = text.replaceAll(/\s+/g, " ").trim().slice(0, 12);
    if (!clip) return false;
    for (const n of bar.querySelectorAll("div, span, button")) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.offsetHeight > 0 && n.offsetHeight <= 72 && (n.textContent || "").includes(clip)) return true;
    }
    return false;
}

function ensureChip() {
    if (onImaginePage()) return;
    const key = liveKey();
    const snap = saved.get(key);
    if (!snap?.text) return;
    restore(key);
    if (chipVisible(snap.text)) return;
    if (pokeRaf) cancelAnimationFrame(pokeRaf);
    pokeRaf = requestAnimationFrame(() => {
        pokeRaf = 0;
        restore(key);
    });
}

function clearPokes() {
    while (pokeTimers.length) {
        const id = pokeTimers.pop();
        if (id != null) clearTimeout(id);
    }
    if (pokeRaf) {
        cancelAnimationFrame(pokeRaf);
        pokeRaf = 0;
    }
    if (mutRaf) {
        cancelAnimationFrame(mutRaf);
        mutRaf = 0;
    }
}

function schedulePoke() {
    clearPokes();
    for (const ms of POKE_MS) pokeTimers.push(setTimeout(ensureChip, ms));
}

function onChat() {
    if (applying || onImaginePage()) return;
    const now = readText();
    if (!now.key) return;
    if (now.key !== lastKey) {
        stashOutgoing();
        lastKey = now.key;
        if (now.text) {
            remember(now.key, { text: now.text, popup: now.popup });
            lastText = now.text;
            lastPopup = now.popup;
        } else {
            const snap = saved.get(now.key);
            lastText = snap?.text || "";
            lastPopup = snap?.popup;
        }
        restore(now.key);
        schedulePoke();
        return;
    }
    if (now.text) {
        remember(now.key, { text: now.text, popup: now.popup });
        lastText = now.text;
        lastPopup = now.popup;
        return;
    }
    restore(now.key);
    ensureChip();
}

function onNav() {
    wrapSendFns();
    onChat();
}

function barButton(el: Element): HTMLElement | null {
    const btn = el.closest(`${QUERY} button, ${QUERY} [role='button']`);
    return btn instanceof HTMLElement ? btn : null;
}

function isQuoteDismiss(el: Element): boolean {
    const btn = barButton(el);
    if (!btn) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    if (KEEP_BTN.test(label)) return false;
    if (DISMISS.test(label)) return true;
    const q = readText().text || lastText;
    if (!q || (btn.textContent || "").trim() || !btn.querySelector("svg")) return false;
    const bar = btn.closest(QUERY);
    let n: HTMLElement | null = btn.parentElement;
    while (n && n !== bar) {
        if (n.offsetHeight > 0 && n.offsetHeight <= 72) {
            return (n.textContent || "").replaceAll(/\s+/g, " ").includes(q.replaceAll(/\s+/g, " ").slice(0, 12));
        }
        n = n.parentElement;
    }
    return false;
}

function markConsumed(key = liveKey()) {
    drop(key);
}

function onPointerDown(e: PointerEvent) {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element) || !isQuoteDismiss(t)) return;
    markConsumed();
}

function makeSendWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickySend(this: unknown, ...args: unknown[]) {
        const key = liveKey();
        const had = saved.get(key)?.text || readText().text;
        const result = orig.apply(this, args);
        if (had) markConsumed(key);
        return result;
    };
}

function wrapOne(label: string, getState: () => Record<string, unknown>, setState: (partial: object) => void, key: string) {
    let state: Record<string, unknown>;
    try {
        state = getState();
    } catch {
        return;
    }
    const current = state[key];
    if (typeof current !== "function") return;
    if (wrappedFns.get(label) === current) return;
    origFns.set(label, current as SendFn);
    const wrapped = makeSendWrapper(current as SendFn);
    wrappedFns.set(label, wrapped);
    setState({ [key]: wrapped });
}

function wrapSendFns() {
    wrapOne("msg.sendMessage", () => MessageStore.useMessageStore.getState() as unknown as Record<string, unknown>, p => MessageStore.useMessageStore.setState(p), "sendMessage");
    wrapOne("msg.queueMessage", () => MessageStore.useMessageStore.getState() as unknown as Record<string, unknown>, p => MessageStore.useMessageStore.setState(p), "queueMessage");
    wrapOne("chat.sendResponse", () => ChatPageStore.useChatPageStore.getState() as unknown as Record<string, unknown>, p => ChatPageStore.useChatPageStore.setState(p), "sendResponse");
}

function unwrapOne(getState: () => Record<string, unknown>, setState: (partial: object) => void, key: string, label: string) {
    const orig = origFns.get(label);
    if (!orig) return;
    try {
        const state = getState();
        if (state[key] === wrappedFns.get(label)) setState({ [key]: orig });
    } catch { /* store gone */ }
}

function unwrapSendFns() {
    unwrapOne(() => MessageStore.useMessageStore.getState() as unknown as Record<string, unknown>, p => MessageStore.useMessageStore.setState(p), "sendMessage", "msg.sendMessage");
    unwrapOne(() => MessageStore.useMessageStore.getState() as unknown as Record<string, unknown>, p => MessageStore.useMessageStore.setState(p), "queueMessage", "msg.queueMessage");
    unwrapOne(() => ChatPageStore.useChatPageStore.getState() as unknown as Record<string, unknown>, p => ChatPageStore.useChatPageStore.setState(p), "sendResponse", "chat.sendResponse");
    origFns.clear();
    wrappedFns.clear();
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

function requestBody(input: RequestInfo | URL, init?: RequestInit): string {
    if (typeof init?.body === "string") return init.body;
    if (init?.body instanceof URLSearchParams) return init.body.toString();
    if (input instanceof Request) {
        try {
            return String(init?.body ?? "");
        } catch {
            return "";
        }
    }
    return "";
}

function wrapFetch() {
    if (origFetch) return;
    origFetch = window.fetch.bind(window);
    const inner = origFetch;
    window.fetch = function voidQuoteStickyFetch(input: RequestInfo | URL, init?: RequestInit) {
        const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        const url = requestUrl(input);
        if ((method === "POST" || method === "PUT") && CHAT_POST.test(url)) {
            const key = liveKey();
            const clip = (saved.get(key)?.text || readText().text).replaceAll(/\s+/g, " ").trim().slice(0, 16);
            if (clip && requestBody(input, init).includes(clip)) markConsumed(key);
        }
        return inner(input, init);
    };
}

function unwrapFetch() {
    if (!origFetch) return;
    if (window.fetch !== origFetch) {
        try {
            window.fetch = origFetch;
        } catch { /* locked */ }
    }
    origFetch = null;
}

function onMutate() {
    if (mutRaf) return;
    mutRaf = requestAnimationFrame(() => {
        mutRaf = 0;
        ensureChip();
    });
}

export default definePlugin({
    name: "QuoteSticky",
    icon: TextQuoteIcon,
    description: "Keep the composer quote card when switching chats and coming back.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.TurbopackReady,

    start() {
        const now = readText();
        lastKey = now.key;
        if (now.key && now.text) {
            remember(now.key, { text: now.text, popup: now.popup });
            lastText = now.text;
            lastPopup = now.popup;
        }
        abort = new AbortController();
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: abort.signal });
        observer = new MutationObserver(onMutate);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        wrapSendFns();
        wrapFetch();
    },

    stop() {
        abort?.abort();
        abort = null;
        observer?.disconnect();
        observer = null;
        clearPokes();
        unwrapSendFns();
        unwrapFetch();
        saved.clear();
        lastKey = "";
        lastText = "";
        lastPopup = undefined;
        applying = false;
    },

    zustand: {
        ChatPageStore: {
            selector: chatSel,
            handler: onChat,
        },
        RoutingStore: {
            selector: (s: RoutingStoreState) => String(s.route.conversationId ?? ""),
            handler: onNav,
        },
        ResponseStore: {
            selector: hydrateSel,
            handler: onNav,
        },
    },
});
