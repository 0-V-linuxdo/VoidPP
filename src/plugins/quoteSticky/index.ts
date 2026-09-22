/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TextQuoteIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

const logger = new Logger("QuoteSticky");
const KEEP = 40;
const QUERY = ".query-bar";
const EDITOR = ".tiptap, [contenteditable='true']";
const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
const SEND = /submit|send|发送/i;
const KEEP_BTN = /attach|dictat|mode|file/i;

interface Snap {
    text: string;
    popup: unknown;
}

const saved = new Map<string, Snap>();
let lastKey = "";
let lastText = "";
let lastPopup: unknown;
let lastSig = "";
let applying = false;
let consume = false;
let abort: AbortController | null = null;

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

function keyOf(s: ChatPageStoreState): string {
    const cid = String(s.conversationId || s.optimisticConversationId || "");
    const ws = String(s.projectId || "");
    return cid || `home:${ws}`;
}

function popupSig(p: unknown): string {
    if (p == null) return "";
    if (typeof p !== "object") return String(p);
    const rec = p as Record<string, unknown>;
    return String(rec.responseId ?? rec.parentResponseId ?? rec.id ?? rec.quotedText ?? "1");
}

function messageSig(s: ChatPageStoreState): string {
    return `${s.lastMessageId ?? ""}|${s.optimisticMessageId ?? ""}`;
}

function chatSel(s: ChatPageStoreState): string {
    return `${keyOf(s)}|${s.quotedText ?? ""}|${s.chatPageLoaded ? 1 : 0}|${messageSig(s)}|${popupSig(s.quotePopupData)}`;
}

function hydrateSel(s: ResponseStoreState): string {
    return `${Object.keys(s.initialResponsesPromisesByConversationId ?? {}).join(",")}|${Object.keys(s.nodesPromisesByConversationId ?? {}).join(",")}`;
}

function read(): { key: string; text: string; popup: unknown; sig: string } {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return { key: keyOf(s), text: String(s.quotedText || ""), popup: s.quotePopupData, sig: messageSig(s) };
    } catch {
        return { key: "", text: "", popup: undefined, sig: "" };
    }
}

function remember(key: string, snap: Snap) {
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

function applyQuote(text: string | undefined, popup: unknown) {
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
    if (!key || consume || onImaginePage()) return;
    const snap = saved.get(key);
    if (!snap?.text) return;
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        if (keyOf(chat) !== key) return;
        const live = String(chat.quotedText || "");
        if (live === snap.text && popupSig(chat.quotePopupData) === popupSig(snap.popup)) return;
        applyQuote(snap.text, snap.popup);
        logger.info("restored", key);
    } catch (e) {
        logger.debug("restore failed", e);
    }
}

function sent(prevSig: string, nextSig: string): boolean {
    if (!prevSig || prevSig === nextSig) return false;
    const [prevLast, prevOpt] = prevSig.split("|");
    const [curLast, curOpt] = nextSig.split("|");
    if (prevLast && curLast && prevLast !== curLast) return true;
    if (curOpt && curOpt !== prevOpt) return true;
    return false;
}

function onChat() {
    if (applying || onImaginePage()) return;
    const now = read();
    if (!now.key) return;
    if (now.key !== lastKey) {
        stashOutgoing();
        lastKey = now.key;
        lastSig = now.sig;
        consume = false;
        if (now.text) {
            remember(now.key, { text: now.text, popup: now.popup });
            lastText = now.text;
            lastPopup = now.popup;
        } else {
            lastText = "";
            lastPopup = undefined;
        }
        restore(now.key);
        return;
    }
    if (now.text) {
        consume = false;
        remember(now.key, { text: now.text, popup: now.popup });
        lastText = now.text;
        lastPopup = now.popup;
        lastSig = now.sig;
        return;
    }
    const prevSig = lastSig;
    lastSig = now.sig;
    if (consume || sent(prevSig, now.sig)) {
        drop(now.key);
        consume = false;
        try {
            const chat = ChatPageStore.useChatPageStore.getState();
            if (chat.quotedText || chat.quotePopupData) applyQuote("", null);
        } catch { /* store not ready */ }
        return;
    }
    restore(now.key);
}

function onNav() {
    if (applying || onImaginePage()) return;
    onChat();
}

function barButton(el: Element): HTMLElement | null {
    const btn = el.closest(`${QUERY} button, ${QUERY} [role='button']`);
    return btn instanceof HTMLElement ? btn : null;
}

function btnLabel(btn: HTMLElement): string {
    return `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""} ${btn.getAttribute("type") || ""}`;
}

function isQuoteDismiss(el: Element): boolean {
    const btn = barButton(el);
    if (!btn) return false;
    const label = btnLabel(btn);
    if (KEEP_BTN.test(label) || SEND.test(label)) return false;
    if (DISMISS.test(label)) return true;
    const q = read().text;
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

function isSend(el: Element): boolean {
    const btn = barButton(el);
    if (!btn) return false;
    const label = btnLabel(btn);
    if (KEEP_BTN.test(label) || DISMISS.test(label)) return false;
    if (SEND.test(label) || btn.getAttribute("type") === "submit") return true;
    return false;
}

function markConsumed() {
    consume = true;
    const now = read();
    if (now.key) drop(now.key);
}

function onPointerDown(e: PointerEvent) {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (isQuoteDismiss(t)) {
        markConsumed();
        return;
    }
    if (isSend(t) && read().text) markConsumed();
}

function onKeyDown(e: KeyboardEvent) {
    if (!e.isTrusted || e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof Element) || !t.closest(EDITOR)) return;
    if (!read().text) return;
    markConsumed();
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
        const now = read();
        lastKey = now.key;
        lastSig = now.sig;
        if (now.key && now.text) {
            remember(now.key, { text: now.text, popup: now.popup });
            lastText = now.text;
            lastPopup = now.popup;
        }
        abort = new AbortController();
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: abort.signal });
        document.addEventListener("keydown", onKeyDown, { capture: true, signal: abort.signal });
    },

    stop() {
        abort?.abort();
        abort = null;
        saved.clear();
        lastKey = "";
        lastText = "";
        lastPopup = undefined;
        lastSig = "";
        applying = false;
        consume = false;
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
