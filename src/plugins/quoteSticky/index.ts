/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TextQuoteIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import { ChatPageStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

const logger = new Logger("QuoteSticky");
const KEEP = 40;
const FIGHT_MS = 800;
const QUERY = ".query-bar";
const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
const KEEP_BTN = /submit|send|attach|dictat|mode|file/i;

interface Snap {
    text: string;
    popup: unknown;
}

const saved = new Map<string, Snap>();
let lastKey = "";
let applying = false;
let fighting = false;
let fightTimer: ReturnType<typeof setTimeout> | null = null;
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

function read(): { key: string; text: string; popup: unknown } {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return { key: keyOf(s), text: String(s.quotedText || ""), popup: s.quotePopupData };
    } catch {
        return { key: "", text: "", popup: undefined };
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

function applyQuote(text: string | undefined, popup: unknown) {
    const chat = ChatPageStore.useChatPageStore.getState();
    applying = true;
    try {
        if (chat.quotedText !== text) chat.setQuotedText(text);
        if ("quotePopupData" in chat && chat.quotePopupData !== popup) chat.setQuotePopupData(popup);
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function restore(key: string) {
    if (!key || onImaginePage()) return;
    const snap = saved.get(key);
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        if (snap?.text) {
            applyQuote(snap.text, snap.popup);
            logger.info("restored", key);
            return;
        }
        if (chat.quotedText || chat.quotePopupData) applyQuote();
    } catch (e) {
        logger.debug("restore failed", e);
    }
}

function armFight() {
    fighting = true;
    if (fightTimer) clearTimeout(fightTimer);
    fightTimer = setTimeout(() => {
        fightTimer = null;
        fighting = false;
    }, FIGHT_MS);
}

function onChat() {
    if (applying || onImaginePage()) return;
    const now = read();
    if (!now.key) return;
    if (now.key !== lastKey) {
        lastKey = now.key;
        armFight();
        restore(now.key);
        return;
    }
    if (now.text) {
        remember(now.key, { text: now.text, popup: now.popup });
        return;
    }
    if (fighting) {
        const snap = saved.get(now.key);
        if (snap?.text) {
            applyQuote(snap.text, snap.popup);
            return;
        }
    }
    saved.delete(now.key);
}

function isQuoteDismiss(el: Element): boolean {
    const btn = el.closest(`${QUERY} button, ${QUERY} [role='button']`);
    if (!(btn instanceof HTMLElement)) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    if (KEEP_BTN.test(label)) return false;
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

function onPointerDown(e: PointerEvent) {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element) || !isQuoteDismiss(t)) return;
    fighting = false;
    if (fightTimer) {
        clearTimeout(fightTimer);
        fightTimer = null;
    }
    const now = read();
    if (now.key) saved.delete(now.key);
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
        if (now.key && now.text) remember(now.key, { text: now.text, popup: now.popup });
        abort = new AbortController();
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: abort.signal });
    },

    stop() {
        abort?.abort();
        abort = null;
        if (fightTimer) clearTimeout(fightTimer);
        fightTimer = null;
        saved.clear();
        lastKey = "";
        applying = false;
        fighting = false;
    },

    zustand: {
        ChatPageStore: {
            selector: (s: ChatPageStoreState) => `${keyOf(s)}|${s.quotedText ?? ""}`,
            handler: onChat,
        },
    },
});
