/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RoutingStore } from "@turbopack/common/stores";

export const QUERY = ".query-bar";
export const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
export const KEEP = /submit|send|attach|dictat|mode|file|stop|abort|cancel|暂停|停止/i;

export function onImaginePage(): boolean {
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

/** Grok's selection toolbar ("Add to chat"), not the composer chip or a jump button. */
export function nativeQuoteButton(el: EventTarget | null): HTMLElement | null {
    const node = el instanceof Element ? el : el instanceof Node ? el.parentElement : null;
    const btn = node?.closest("button");
    if (!(btn instanceof HTMLElement)) return null;
    const host = btn.parentElement;
    if (!(host instanceof HTMLElement)) return null;
    const cls = typeof host.className === "string" ? host.className : "";
    if (!cls.includes("absolute") || !cls.includes("z-50") || !cls.includes("rounded-full")) return null;
    return btn;
}

/** Selection toolbar payload `{ range, responseId }`. Not the composer quote card. */
export function isToolbarPopup(popup: unknown): popup is { range: Range; responseId?: string } {
    if (!popup || typeof popup !== "object") return false;
    const range = (popup as { range?: unknown }).range;
    return !!range && typeof (range as Range).cloneRange === "function";
}

export function cloneToolbarPopup<T>(popup: T): T {
    if (!isToolbarPopup(popup)) return popup;
    try {
        return { ...popup, range: popup.range.cloneRange() };
    } catch {
        return popup;
    }
}
