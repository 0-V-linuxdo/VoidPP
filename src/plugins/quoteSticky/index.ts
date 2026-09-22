/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { TextQuoteIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, MessageStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

const logger = new Logger("QuoteSticky");
const cl = classNameFactory("void-qs-");
const KEEP = 40;
const QUERY = ".query-bar";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
const KEEP_BTN = /submit|send|attach|dictat|mode|file|stop|abort|cancel|暂停|停止/i;
const CHAT_POST = /\/rest\/app-chat\/conversations/;
const STOP_URL = /stop|abort|cancel/i;
const RESTORE_GAP_MS = 80;
const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

interface Fields {
    responseId: string;
    parentResponseId: string;
    parentQuotedText: string;
    parentQuoteSource: unknown;
}

interface Snap {
    text: string;
    popup: unknown;
    fields: Fields;
}

type SendFn = (...args: unknown[]) => unknown;

const saved = new Map<string, Snap>();
const origFns = new Map<string, SendFn>();
const wrappedFns = new Map<string, SendFn>();

let lastKey = "";
let lastText = "";
let lastPopup: unknown;
let applying = false;
let lastRestoreAt = 0;
let abort: AbortController | null = null;
let observer: MutationObserver | null = null;
let origFetch: typeof fetch | null = null;
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

function pathCid(): string {
    try {
        const path = location.pathname;
        const inPath = path.match(/\/(?:c|chat)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] || "";
        if (inPath) return inPath;
        const q = new URLSearchParams(location.search).get("conversationId") || "";
        return UUID.test(q) ? q : "";
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

function storeCid(s?: ChatPageStoreState): string {
    try {
        const st = s ?? ChatPageStore.useChatPageStore.getState();
        return String(st.conversationId || st.optimisticConversationId || "");
    } catch {
        return "";
    }
}

function viewKey(s?: ChatPageStoreState): string {
    const ids: string[] = [];
    for (const id of [pathCid(), routeCid(), storeCid(s)]) {
        if (id && UUID.test(id) && !ids.includes(id)) ids.push(id);
    }
    if (ids.length > 1) return "";
    if (ids.length === 1) return ids[0] ?? "";
    const project = s?.projectId ?? projectId();
    return `home:${project || ""}`;
}

function ownKey(): string {
    return viewKey() || lastKey;
}

function str(v: unknown): string {
    if (typeof v === "string") return v;
    if (v == null) return "";
    return String(v);
}

function extractFields(popup: unknown, text: string): Fields {
    const rec = popup && typeof popup === "object" ? popup as Record<string, unknown> : {};
    const responseId = str(rec.responseId ?? rec.parentResponseId ?? rec.id);
    return {
        responseId,
        parentResponseId: str(rec.parentResponseId ?? rec.responseId ?? rec.id),
        parentQuotedText: str(rec.parentQuotedText ?? rec.quotedText ?? text),
        parentQuoteSource: rec.parentQuoteSource ?? rec.source ?? (responseId ? { responseId } : undefined),
    };
}

function popupFor(snap: Snap): unknown {
    const fields = { ...snap.fields, quotedText: snap.text, parentQuotedText: snap.fields.parentQuotedText || snap.text };
    if (snap.popup && typeof snap.popup === "object") {
        try {
            return { ...fields, ...(snap.popup as object) };
        } catch { /* frozen / host object */ }
    }
    return fields;
}

function popupSig(p: unknown): string {
    if (p == null) return "";
    if (typeof p !== "object") return String(p);
    const rec = p as Record<string, unknown>;
    return String(rec.responseId ?? rec.parentResponseId ?? rec.id ?? rec.quotedText ?? "1");
}

function chatSel(s: ChatPageStoreState): string {
    return `${viewKey(s)}|${pathCid()}|${routeCid()}|${storeCid(s)}|${s.quotedText ?? ""}|${s.chatPageLoaded ? 1 : 0}|${popupSig(s.quotePopupData)}`;
}

function hydrateSel(s: ResponseStoreState): string {
    return `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}`;
}

function readText(): { key: string; text: string; popup: unknown } {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return { key: viewKey(s), text: String(s.quotedText || ""), popup: s.quotePopupData };
    } catch {
        return { key: viewKey(), text: "", popup: undefined };
    }
}

function remember(key: string, text: string, popup: unknown) {
    if (!key || !text) return;
    saved.delete(key);
    saved.set(key, { text, popup, fields: extractFields(popup, text) });
    while (saved.size > KEEP) {
        const oldest = saved.keys().next().value;
        if (oldest === undefined) break;
        saved.delete(oldest);
    }
}

function stashOutgoing() {
    if (lastKey && lastText) remember(lastKey, lastText, lastPopup);
}

function drop(key: string) {
    if (key) saved.delete(key);
    if (key === lastKey) {
        lastText = "";
        lastPopup = undefined;
    }
}

function clearLive() {
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        if (!chat.quotedText && chat.quotePopupData == null) return;
        applying = true;
        try {
            if (chat.quotedText) chat.setQuotedText("");
            if (typeof chat.setQuotePopupData === "function" && chat.quotePopupData != null) chat.setQuotePopupData(null);
        } finally {
            applying = false;
        }
    } catch (e) {
        logger.debug("clear failed", e);
    }
}

function applyQuote(key: string, text: string, popup: unknown) {
    if (viewKey() !== key) return;
    const store = storeCid();
    if (store && UUID.test(store) && store !== key) return;
    const chat = ChatPageStore.useChatPageStore.getState();
    applying = true;
    try {
        if (chat.quotedText !== text) chat.setQuotedText(text);
        if (typeof chat.setQuotePopupData === "function" && popupSig(chat.quotePopupData) !== popupSig(popup)) chat.setQuotePopupData(popup);
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function officialVisible(text: string): boolean {
    const bar = document.querySelector(QUERY);
    if (!(bar instanceof HTMLElement) || !text) return false;
    const clip = text.replaceAll(/\s+/g, " ").trim().slice(0, 12);
    if (!clip) return false;
    for (const n of bar.querySelectorAll("div, span, button")) {
        if (!(n instanceof HTMLElement) || n.closest(`.${cl("chip")}`)) continue;
        if (n.offsetHeight > 0 && n.offsetHeight <= 72 && (n.textContent || "").includes(clip)) return true;
    }
    return false;
}

function removeFallback() {
    for (const n of document.querySelectorAll(`.${cl("chip")}`)) n.remove();
}

function onFallbackDismiss(e: Event) {
    e.stopPropagation();
    dismiss();
}

function makeChip(): HTMLElement {
    const el = document.createElement("div");
    el.className = cl("chip");
    el.dataset.voidQs = "";
    const mark = document.createElement("span");
    mark.className = cl("mark");
    mark.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = cl("text");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cl("x");
    btn.setAttribute("aria-label", "Remove quote");
    btn.innerHTML = X_SVG;
    btn.addEventListener("pointerdown", onFallbackDismiss);
    el.append(mark, text, btn);
    return el;
}

function paintFallback(key: string, snap: Snap) {
    const bar = document.querySelector(QUERY);
    if (viewKey() !== key || !(bar instanceof HTMLElement) || onImaginePage()) {
        removeFallback();
        return;
    }
    if (officialVisible(snap.text)) {
        removeFallback();
        return;
    }
    let el = bar.querySelector(`.${cl("chip")}`);
    if (el instanceof HTMLElement && el.dataset.voidQsKey !== key) {
        el.remove();
        el = null;
    }
    if (!(el instanceof HTMLElement)) {
        el = makeChip();
        el.dataset.voidQsKey = key;
        const editor = bar.querySelector(".tiptap, [contenteditable='true']");
        const row = editor?.parentElement;
        if (row && bar.contains(row) && row !== bar) row.prepend(el);
        else if (editor && editor.parentElement === bar) editor.before(el);
        else bar.prepend(el);
    }
    el.dataset.voidQsKey = key;
    const label = el.querySelector(`.${cl("text")}`);
    if (label) label.textContent = snap.text.replaceAll(/\s+/g, " ").trim();
}

function restore(key: string) {
    if (!key || onImaginePage() || viewKey() !== key) {
        if (viewKey() !== key) removeFallback();
        return;
    }
    const snap = saved.get(key);
    if (!snap?.text) {
        removeFallback();
        return;
    }
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        const live = String(chat.quotedText || "");
        const same = live === snap.text && popupSig(chat.quotePopupData) === popupSig(popupFor(snap));
        const now = performance.now();
        if (!same && now - lastRestoreAt >= RESTORE_GAP_MS) {
            lastRestoreAt = now;
            applyQuote(key, snap.text, popupFor(snap));
            logger.info("restored", key);
        }
        paintFallback(key, snap);
    } catch (e) {
        logger.debug("restore failed", e);
        paintFallback(key, snap);
    }
}

function ensureChip() {
    if (onImaginePage()) return;
    const key = viewKey();
    if (!key) {
        hold();
        return;
    }
    const snap = saved.get(key);
    if (!snap?.text) {
        removeFallback();
        return;
    }
    restore(key);
}

function hold() {
    stashOutgoing();
    removeFallback();
    clearLive();
}

function dismiss() {
    const key = ownKey();
    applying = true;
    try {
        drop(key);
        const chat = ChatPageStore.useChatPageStore.getState();
        if (chat.quotedText) chat.setQuotedText("");
        if (typeof chat.setQuotePopupData === "function" && chat.quotePopupData != null) chat.setQuotePopupData(null);
    } catch (e) {
        logger.debug("dismiss failed", e);
    } finally {
        applying = false;
    }
    removeFallback();
}

function onChat() {
    if (applying || onImaginePage()) return;
    const key = viewKey();
    if (!key) {
        hold();
        return;
    }
    const now = readText();
    if (key !== lastKey) {
        stashOutgoing();
        lastKey = key;
        lastRestoreAt = 0;
        const snap = saved.get(key);
        if (snap?.text) {
            lastText = snap.text;
            lastPopup = snap.popup;
            restore(key);
        } else {
            lastText = "";
            lastPopup = undefined;
            clearLive();
            removeFallback();
        }
        return;
    }
    if (now.text) {
        remember(key, now.text, now.popup);
        lastText = now.text;
        lastPopup = now.popup;
        if (!officialVisible(now.text)) paintFallback(key, saved.get(key)!);
        else removeFallback();
        return;
    }
    restore(key);
}

function onNav() {
    wrapAll();
    onChat();
}

function barButton(el: Element): HTMLElement | null {
    const btn = el.closest(`${QUERY} button, ${QUERY} [role='button']`);
    return btn instanceof HTMLElement ? btn : null;
}

function isQuoteDismiss(el: Element): boolean {
    if (el.closest(`.${cl("x")}`)) return true;
    const btn = barButton(el);
    if (!btn || btn.closest(`.${cl("chip")}`)) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    if (KEEP_BTN.test(label)) return false;
    if (DISMISS.test(label)) return true;
    const q = readText().text || lastText;
    if (!q || (btn.textContent || "").trim() || !btn.querySelector("svg")) return false;
    const bar = btn.closest(QUERY);
    let n: HTMLElement | null = btn.parentElement;
    while (n && n !== bar) {
        if (n.querySelector("textarea, [contenteditable='true'], .tiptap")) return false;
        if (n.offsetHeight > 0 && n.offsetHeight <= 72) {
            return (n.textContent || "").replaceAll(/\s+/g, " ").includes(q.replaceAll(/\s+/g, " ").slice(0, 12));
        }
        n = n.parentElement;
    }
    return false;
}

function markConsumed(key = ownKey()) {
    drop(key);
    removeFallback();
}

function onPointerDown(e: PointerEvent) {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element) || !isQuoteDismiss(t)) return;
    dismiss();
}

function isQuoteSend(raw: unknown, want: string): boolean {
    if (!want || raw == null) return false;
    if (typeof raw === "string") {
        if (!raw.startsWith("{") && !raw.startsWith("[")) return false;
        try {
            return isQuoteSend(JSON.parse(raw), want);
        } catch {
            return false;
        }
    }
    if (typeof raw !== "object" || Array.isArray(raw)) return false;
    const rec = raw as Record<string, unknown>;
    const sending = "message" in rec || "text" in rec || "fileAttachments" in rec || "fileAttachmentIds" in rec;
    if (!sending) return false;
    const q = rec.parentQuotedText ?? rec.quotedText;
    return typeof q === "string" && q.replaceAll(/\s+/g, " ").trim() === want.replaceAll(/\s+/g, " ").trim();
}

function makeSendWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickySend(this: unknown, ...args: unknown[]) {
        const key = ownKey();
        const had = saved.get(key)?.text || readText().text;
        const result = orig.apply(this, args);
        if (had && isQuoteSend(args[0], had)) markConsumed(key);
        return result;
    };
}

function scheduleRestore() {
    const key = viewKey();
    if (!key || !saved.get(key)?.text) return;
    queueMicrotask(() => {
        if (viewKey() === key) restore(key);
    });
}

function makeQuotedTextWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickyQuotedText(this: unknown, ...args: unknown[]) {
        const result = orig.apply(this, args);
        if (applying) return result;
        const text = String(args[0] ?? "");
        const agreed = viewKey();
        const popup = ChatPageStore.useChatPageStore.getState().quotePopupData;
        if (text) {
            if (!agreed) {
                if (lastKey && lastText) remember(lastKey, lastText, lastPopup);
                return result;
            }
            if (lastKey && lastKey !== agreed) return result;
            remember(agreed, text, popup);
            lastText = text;
            lastPopup = popup;
            lastKey = agreed;
        } else if (agreed && (!lastKey || lastKey === agreed) && saved.get(agreed)?.text) {
            scheduleRestore();
        }
        return result;
    };
}

function makePopupWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickyPopup(this: unknown, ...args: unknown[]) {
        const result = orig.apply(this, args);
        if (applying) return result;
        const agreed = viewKey();
        const popup = args[0];
        const live = String(ChatPageStore.useChatPageStore.getState().quotedText || "");
        if (popup != null && agreed && live && (!lastKey || lastKey === agreed)) {
            remember(agreed, live, popup);
            lastPopup = popup;
            lastText = live;
            lastKey = agreed;
        } else if (popup != null && !agreed && lastKey && lastText) {
            remember(lastKey, lastText, popup);
            lastPopup = popup;
        } else if (agreed && (!lastKey || lastKey === agreed) && saved.get(agreed)?.text) {
            scheduleRestore();
        }
        return result;
    };
}

function makeNavWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickyNav(this: unknown, ...args: unknown[]) {
        stashOutgoing();
        const result = orig.apply(this, args);
        queueMicrotask(onNav);
        return result;
    };
}

function wrapOne(label: string, getState: () => Record<string, unknown>, setState: (partial: object) => void, key: string, make: (orig: SendFn) => SendFn) {
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
    const wrapped = make(current as SendFn);
    wrappedFns.set(label, wrapped);
    setState({ [key]: wrapped });
}

function chatState() {
    return ChatPageStore.useChatPageStore.getState() as unknown as Record<string, unknown>;
}

function msgState() {
    return MessageStore.useMessageStore.getState() as unknown as Record<string, unknown>;
}

function chatSet(p: object) {
    ChatPageStore.useChatPageStore.setState(p);
}

function msgSet(p: object) {
    MessageStore.useMessageStore.setState(p);
}

function wrapAll() {
    wrapOne("chat.setQuotedText", chatState, chatSet, "setQuotedText", makeQuotedTextWrapper);
    wrapOne("chat.setQuotePopupData", chatState, chatSet, "setQuotePopupData", makePopupWrapper);
    wrapOne("chat.setConversationId", chatState, chatSet, "setConversationId", makeNavWrapper);
    wrapOne("chat.setOptimisticConversationId", chatState, chatSet, "setOptimisticConversationId", makeNavWrapper);
    wrapOne("msg.sendMessage", msgState, msgSet, "sendMessage", makeSendWrapper);
    wrapOne("msg.queueMessage", msgState, msgSet, "queueMessage", makeSendWrapper);
}

function unwrapOne(getState: () => Record<string, unknown>, setState: (partial: object) => void, key: string, label: string) {
    const orig = origFns.get(label);
    if (!orig) return;
    try {
        const state = getState();
        if (state[key] === wrappedFns.get(label)) setState({ [key]: orig });
    } catch { /* store gone */ }
}

function unwrapAll() {
    unwrapOne(chatState, chatSet, "setQuotedText", "chat.setQuotedText");
    unwrapOne(chatState, chatSet, "setQuotePopupData", "chat.setQuotePopupData");
    unwrapOne(chatState, chatSet, "setConversationId", "chat.setConversationId");
    unwrapOne(chatState, chatSet, "setOptimisticConversationId", "chat.setOptimisticConversationId");
    unwrapOne(msgState, msgSet, "sendMessage", "msg.sendMessage");
    unwrapOne(msgState, msgSet, "queueMessage", "msg.queueMessage");
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
    return "";
}

function wrapFetch() {
    if (origFetch) return;
    origFetch = window.fetch.bind(window);
    const inner = origFetch;
    window.fetch = function voidQuoteStickyFetch(input: RequestInfo | URL, init?: RequestInit) {
        const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        const url = requestUrl(input);
        if ((method === "POST" || method === "PUT") && CHAT_POST.test(url) && !STOP_URL.test(url)) {
            const key = ownKey();
            const want = saved.get(key)?.text || readText().text;
            if (want && isQuoteSend(requestBody(input, init), want)) markConsumed(key);
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
    managedStyle: "quoteSticky",
    cleanupSelectors: [`.${cl("chip")}`],

    start() {
        const now = readText();
        lastKey = now.key;
        if (now.key && now.text) {
            remember(now.key, now.text, now.popup);
            lastText = now.text;
            lastPopup = now.popup;
        }
        abort = new AbortController();
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: abort.signal });
        observer = new MutationObserver(onMutate);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        wrapAll();
        wrapFetch();
    },

    stop() {
        abort?.abort();
        abort = null;
        observer?.disconnect();
        observer = null;
        if (mutRaf) cancelAnimationFrame(mutRaf);
        mutRaf = 0;
        unwrapAll();
        unwrapFetch();
        removeFallback();
        saved.clear();
        lastKey = "";
        lastText = "";
        lastPopup = undefined;
        applying = false;
        lastRestoreAt = 0;
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
