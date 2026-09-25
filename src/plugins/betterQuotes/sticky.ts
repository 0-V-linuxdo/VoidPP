/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, MessageStore, RoutingStore } from "@turbopack/common/stores";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";

import { mountQuoteMark } from "./icon";
import { DISMISS, KEEP as KEEP_BTN, onImaginePage, QUERY } from "./shared";

const logger = new Logger("QuoteSticky");
const cl = classNameFactory("void-qs-");
const KEEP = 40;
const RESTORE_GAP_MS = 80;
const COLLAPSE_PX = 80;
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
let mutRaf = 0;
let armed = false;
let hold = false;
let holdKey = "";
let pendingRestore = "";
let unsubQuote: (() => void) | null = null;

function onProjectPath(): boolean {
    try {
        return (location.pathname.replace(/\/+$/, "") || "/").startsWith("/project/");
    } catch {
        return false;
    }
}

function viewportHeight(): number {
    const inner = window.innerHeight || 0;
    const visual = window.visualViewport?.height ?? inner;
    if (inner <= 0) return visual;
    if (visual <= 0) return inner;
    return Math.min(inner, visual);
}

function viewportCollapsed(): boolean {
    const h = viewportHeight();
    return h > 0 && h < COLLAPSE_PX;
}

function pinHold() {
    const live = readText();
    if (!hold) holdKey = live.key || lastKey || routeCid() || pathCid();
    hold = true;
    const key = holdKey;
    if (!key) return;
    if (live.text) {
        remember(key, live.text, live.popup);
        lastText = live.text;
        lastPopup = live.popup;
        return;
    }
    const snap = saved.get(key);
    const text = lastText || snap?.text || "";
    if (!text) return;
    remember(key, text, lastPopup ?? snap?.popup);
}

function settleHold(): boolean {
    if (!armed || onImaginePage()) return false;
    if (viewportCollapsed()) {
        pinHold();
        return true;
    }
    if (!hold && !pendingRestore) return false;
    const key = (hold ? holdKey : pendingRestore) || lastKey;
    const dest = destKey();
    if (dest && key && dest !== key) {
        hold = false;
        holdKey = "";
        pendingRestore = "";
        return false;
    }
    hold = false;
    holdKey = "";
    const snap = key ? saved.get(key) : undefined;
    if (!key || !snap?.text) {
        pendingRestore = "";
        return true;
    }
    pendingRestore = key;
    lastKey = key;
    lastText = snap.text;
    lastPopup = snap.popup;
    if (dest !== key) return true;
    lastRestoreAt = 0;
    restore(key);
    pendingRestore = "";
    return true;
}

function pathCid(): string {
    try {
        const path = location.pathname;
        const inPath = path.match(/\/(?:c|chat|conversation)\/([^/?#]+)/i)?.[1] || "";
        if (inPath && inPath !== "new") return decodeURIComponent(inPath);
        const q = new URLSearchParams(location.search);
        for (const name of ["conversationId", "chat"]) {
            const v = q.get(name) || "";
            if (v) return v;
        }
        return "";
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

function realCid(s?: ChatPageStoreState): string {
    try {
        const st = s ?? ChatPageStore.useChatPageStore.getState();
        return String(st.conversationId || "");
    } catch {
        return "";
    }
}

function snapKey(s?: ChatPageStoreState): string {
    const cid = realCid(s);
    if (cid) return cid;
    return pathCid() || routeCid();
}

function destKey(s?: ChatPageStoreState): string {
    return realCid(s);
}

function ownKey(): string {
    return realCid() || pathCid() || routeCid() || lastKey;
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

export function chatSel(s: ChatPageStoreState): string {
    return `${destKey(s)}|${pathCid()}|${routeCid()}|${realCid(s)}|${s.quotedText ?? ""}|${s.chatPageLoaded ? 1 : 0}|${popupSig(s.quotePopupData)}`;
}

export function hydrateSel(s: ResponseStoreState): string {
    return `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}`;
}

function readText(): { key: string; text: string; popup: unknown } {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return { key: destKey(s), text: String(s.quotedText || ""), popup: s.quotePopupData };
    } catch {
        return { key: destKey(), text: "", popup: undefined };
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
    if (hold || pendingRestore || viewportCollapsed()) return;
    lastRestoreAt = 0;
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
    if (destKey() !== key) return;
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
        if (n.closest(".tiptap, [contenteditable='true']")) continue;
        if (n.querySelector("textarea, [contenteditable='true'], .tiptap")) continue;
        if (n.offsetHeight <= 0 || n.offsetHeight > 72) continue;
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        if ((n.textContent || "").includes(clip)) return true;
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
    mountQuoteMark(mark);
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

function placeChip(el: HTMLElement, bar: HTMLElement) {
    const r = bar.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) {
        if (hold || viewportCollapsed() || pendingRestore) return;
        el.style.display = "none";
        return;
    }
    el.style.display = "flex";
    el.style.width = `${Math.max(120, r.width - 24)}px`;
    el.style.left = `${r.left + 12}px`;
    el.style.top = `${Math.max(8, r.top + 6)}px`;
}

function paintFallback(key: string, snap: Snap) {
    const bar = document.querySelector(QUERY);
    const path = pathCid();
    const quiet = hold || viewportCollapsed() || pendingRestore === key;
    if (!key || onImaginePage() || destKey() !== key || (path && path !== key) || !(bar instanceof HTMLElement)) {
        if (!quiet) removeFallback();
        return;
    }
    if (officialVisible(snap.text)) {
        removeFallback();
        return;
    }
    let el = document.querySelector(`.${cl("chip")}`);
    if (el instanceof HTMLElement && el.dataset.voidQsKey !== key) {
        el.remove();
        el = null;
    }
    if (!(el instanceof HTMLElement)) {
        el = makeChip();
        el.dataset.voidQsKey = key;
        document.body.append(el);
    }
    el.dataset.voidQsKey = key;
    const label = el.querySelector(`.${cl("text")}`);
    const shown = snap.text.replaceAll(/\s+/g, " ").trim();
    if (label && label.textContent !== shown) label.textContent = shown;
    placeChip(el, bar);
}

function restore(key: string) {
    if (!key || onImaginePage() || destKey() !== key) {
        if (destKey() !== key) removeFallback();
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
    if (viewportCollapsed() || hold) {
        pinHold();
        return;
    }
    if (pendingRestore) return;
    const dest = destKey();
    const path = pathCid();
    if (!dest || (path && path !== dest)) {
        removeFallback();
        return;
    }
    const snap = saved.get(dest);
    if (!snap?.text) {
        removeFallback();
        return;
    }
    restore(dest);
}

function dismiss() {
    hold = false;
    holdKey = "";
    pendingRestore = "";
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

export function routeSel(s: RoutingStoreState): string {
    return String(s.route.conversationId ?? "");
}

export function onChat() {
    if (!armed || applying || onImaginePage()) return;
    if (settleHold()) return;
    const now = readText();
    const dest = destKey();
    const key = snapKey();
    if (now.text && key && !(dest && lastKey && dest !== lastKey)) {
        remember(key, now.text, now.popup);
        lastText = now.text;
        lastPopup = now.popup;
        lastKey = key;
    }
    if (!dest) {
        stashOutgoing();
        removeFallback();
        if (!pathCid() && !routeCid() && !onProjectPath()) {
            lastText = "";
            lastPopup = undefined;
            clearLive();
        }
        return;
    }
    const path = pathCid();
    if (path && path === lastKey && path !== dest) {
        const prior = saved.get(path);
        if (prior?.text) remember(dest, prior.text, prior.popup);
        saved.delete(path);
        lastKey = dest;
        lastText = prior?.text || lastText;
        lastPopup = prior?.popup ?? lastPopup;
    }
    if (path && path !== dest) {
        removeFallback();
        return;
    }
    if (dest !== lastKey) {
        stashOutgoing();
        lastKey = dest;
        lastRestoreAt = 0;
        const snap = saved.get(dest);
        if (snap?.text) {
            lastText = snap.text;
            lastPopup = snap.popup;
            restore(dest);
        } else {
            lastText = "";
            lastPopup = undefined;
            clearLive();
            removeFallback();
        }
        return;
    }
    if (now.text) {
        const snap = saved.get(dest);
        if (snap && !officialVisible(now.text)) paintFallback(dest, snap);
        else removeFallback();
        return;
    }
    restore(dest);
}

export function onNav() {
    if (!armed) return;
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

function payloadText(rec: Record<string, unknown>): string {
    const raw = rec.message ?? rec.text ?? rec.query;
    if (typeof raw === "string") return raw.trim();
    if (raw && typeof raw === "object") {
        const inner = raw as Record<string, unknown>;
        const nested = inner.text ?? inner.content ?? inner.message;
        if (typeof nested === "string") return nested.trim();
    }
    return "";
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
    if (!payloadText(rec)) return false;
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
    if (hold || viewportCollapsed() || pendingRestore) return;
    const key = destKey();
    if (!key || !saved.get(key)?.text) return;
    queueMicrotask(() => {
        if (destKey() === key) restore(key);
    });
}

function makeQuotedTextWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickyQuotedText(this: unknown, ...args: unknown[]) {
        const result = orig.apply(this, args);
        if (applying) return result;
        const text = String(args[0] ?? "");
        const dest = destKey();
        const popup = ChatPageStore.useChatPageStore.getState().quotePopupData;
        if (text) {
            const key = dest || pathCid() || routeCid() || lastKey;
            if (!key) return result;
            if (dest && lastKey && dest !== lastKey) {
                if (lastText) remember(lastKey, lastText, lastPopup);
                return result;
            }
            remember(key, text, popup ?? lastPopup);
            lastText = text;
            lastPopup = popup ?? lastPopup;
            lastKey = key;
        } else if (dest && (!lastKey || lastKey === dest) && saved.get(dest)?.text) {
            scheduleRestore();
        }
        return result;
    };
}

function makePopupWrapper(orig: SendFn): SendFn {
    return function voidQuoteStickyPopup(this: unknown, ...args: unknown[]) {
        const result = orig.apply(this, args);
        if (applying) return result;
        const dest = destKey();
        const popup = args[0];
        const live = String(ChatPageStore.useChatPageStore.getState().quotedText || "");
        if (popup != null && live && !(dest && lastKey && dest !== lastKey)) {
            const key = dest || pathCid() || routeCid() || lastKey;
            if (key) {
                remember(key, live, popup);
                lastPopup = popup;
                lastText = live;
                lastKey = key;
            }
        } else if (dest && (!lastKey || lastKey === dest) && saved.get(dest)?.text) {
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

function onMutate() {
    if (!armed || mutRaf) return;
    mutRaf = requestAnimationFrame(() => {
        mutRaf = 0;
        if (armed) ensureChip();
    });
}

function onStore(state: ChatPageStoreState) {
    if (!armed || applying) return;
    const text = String(state.quotedText || "");
    if (!text) {
        if (viewportCollapsed() || hold) pinHold();
        return;
    }
    if (viewportCollapsed() || hold) {
        pinHold();
        return;
    }
    const dest = String(state.conversationId || "");
    if (dest && lastKey && dest !== lastKey) return;
    const key = dest || pathCid() || routeCid() || lastKey;
    if (!key) return;
    remember(key, text, state.quotePopupData);
    lastText = text;
    lastPopup = state.quotePopupData;
    lastKey = key;
}

export function startSticky() {
    if (armed) return;
    armed = true;
    const now = readText();
    const key = snapKey() || now.key;
    lastKey = key;
    if (key && now.text) {
        remember(key, now.text, now.popup);
        lastText = now.text;
        lastPopup = now.popup;
    }
    abort = new AbortController();
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: abort.signal });
    const poke = () => onMutate();
    const onViewport = () => {
        if (!settleHold()) onMutate();
    };
    window.addEventListener("scroll", poke, { capture: true, passive: true, signal: abort.signal });
    window.addEventListener("resize", onViewport, { passive: true, signal: abort.signal });
    window.visualViewport?.addEventListener("resize", onViewport, { passive: true, signal: abort.signal });
    observer = new MutationObserver(onMutate);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    wrapAll();
    try {
        unsubQuote = ChatPageStore.useChatPageStore.subscribe(onStore);
    } catch { /* store not ready */ }
    ensureChip();
}

export function stopSticky() {
    if (!armed) return;
    armed = false;
    abort?.abort();
    abort = null;
    observer?.disconnect();
    observer = null;
    unsubQuote?.();
    unsubQuote = null;
    if (mutRaf) cancelAnimationFrame(mutRaf);
    mutRaf = 0;
    unwrapAll();
    removeFallback();
    saved.clear();
    lastKey = "";
    lastText = "";
    lastPopup = undefined;
    applying = false;
    lastRestoreAt = 0;
    hold = false;
    holdKey = "";
    pendingRestore = "";
}
