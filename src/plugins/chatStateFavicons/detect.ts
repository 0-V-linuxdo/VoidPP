/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RoutingStore } from "@turbopack/common/stores";

export const EDITOR_SEL = '.tiptap.ProseMirror[contenteditable="true"]';
export const STOP_SELECTORS = [
    'button[aria-label="Stop model response"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="停止"]',
] as const;
export const SEND_SELECTORS = [
    'button[aria-label*="Send"]',
    'button[aria-label*="Submit"]',
    'button[type="submit"]',
] as const;

const CHAT_PAGES = new Set(["main", "chat", "workspace", "bot"]);

export function isChatSurface(): boolean {
    try {
        const page = String(RoutingStore.useRoutingStore.getState().route?.page ?? "");
        if (page) {
            if (page.startsWith("imagine") || page === "images") return false;
            return CHAT_PAGES.has(page);
        }
    } catch { /* route not ready */ }
    try {
        const path = location.pathname.replace(/\/+$/, "") || "/";
        if (path.startsWith("/imagine") || path.startsWith("/images")) return false;
        if (path === "/" || path.startsWith("/c/") || path === "/chat" || path.startsWith("/chat/") || path.startsWith("/project/") || path === "/bot" || path.startsWith("/bot/")) return true;
    } catch { /* */ }
    return false;
}

export function isVisible(el: Element | null | undefined): el is HTMLElement {
    if (!(el instanceof HTMLElement) || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
}

export function isClickable(el: HTMLElement): boolean {
    return getComputedStyle(el).pointerEvents !== "none";
}

export function isStopControl(el: Element): boolean {
    const label = el.getAttribute("aria-label") ?? "";
    const text = el.textContent ?? "";
    return /stop|停止/i.test(label) || /\bstop\b/i.test(text) || text.includes("停止");
}

export function getActiveEditor(): HTMLElement | null {
    const list = Array.from(document.querySelectorAll<HTMLElement>(EDITOR_SEL));
    const usable = list.filter(el => isVisible(el) && isClickable(el));
    return usable.find(el => el.closest(".query-bar")) ?? usable[0] ?? null;
}

export function getComposerRoot(): Element | null {
    const editor = getActiveEditor();
    if (!editor) return null;
    return editor.closest("form")
        ?? editor.closest(".query-bar")
        ?? editor.closest("div.relative")
        ?? editor.parentElement
        ?? null;
}

export function collectStopButtons(root: ParentNode): HTMLElement[] {
    const candidates: HTMLElement[] = [];
    for (const sel of STOP_SELECTORS) {
        for (const node of root.querySelectorAll(sel)) {
            if (node instanceof HTMLElement) candidates.push(node);
        }
    }
    if (candidates.length === 0) {
        for (const btn of root.querySelectorAll("button")) {
            if (btn instanceof HTMLElement && isStopControl(btn)) candidates.push(btn);
        }
    }
    return candidates;
}

export function getStopButton(): HTMLElement | null {
    const root = getComposerRoot();
    if (!root) return null;
    return collectStopButtons(root).find(isVisible) ?? null;
}

export function isDisabledControl(el: HTMLElement): boolean {
    if (el instanceof HTMLButtonElement && el.disabled) return true;
    if (el.hasAttribute("disabled")) return true;
    if (el.getAttribute("aria-disabled") === "true") return true;
    if (el.getAttribute("data-disabled") === "true") return true;
    return el.classList.contains("opacity-50") || el.classList.contains("cursor-not-allowed");
}

export function getSubmitButton(): HTMLElement | null {
    const root = getComposerRoot();
    if (!root) return null;
    for (const sel of SEND_SELECTORS) {
        for (const node of root.querySelectorAll(sel)) {
            if (!(node instanceof HTMLElement) || isStopControl(node)) continue;
            if (isVisible(node) || isDisabledControl(node)) return node;
        }
    }
    return null;
}

export function submitIsGray(): boolean {
    const btn = getSubmitButton();
    return !!btn && isDisabledControl(btn);
}

export function isInputEmpty(): boolean {
    const editor = getActiveEditor();
    if (!editor) return true;
    if (editor.querySelector("p.is-empty.is-editor-empty")) return true;
    return (editor.textContent ?? "").replaceAll("\u200B", "").trim().length === 0;
}

export function conversationToken(): string {
    const params = new URLSearchParams(location.search);
    const paramId = params.get("conversationId")
        ?? params.get("conversation_id")
        ?? params.get("chatId")
        ?? params.get("chat_id")
        ?? params.get("cid")
        ?? params.get("id")
        ?? "";
    const lastSeg = location.pathname.split("/").filter(Boolean).slice(-1)[0] ?? "";
    const pathId = /^[a-z0-9_-]{8,}$/i.test(lastSeg) ? lastSeg : "";
    const dataId = document.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id") ?? "";
    return [dataId, paramId, pathId].filter(Boolean).join("|");
}

export function contextKeyFromUrl(token: string): string {
    const base = `${location.origin}${location.pathname}`;
    return token ? `${base}|${token}` : `${base}|draft`;
}
