/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getFiber, type Fiber } from "@utils/react";

export const ATTACH_SEL = '[data-testid="attach-button"]';

export function isAttachMenuProps(p: Record<string, unknown> | null | undefined): boolean {
    if (!p || typeof p.onOpenChange !== "function" || !("open" in p)) return false;
    if (
        "delayDuration" in p
        || "disableHoverableContent" in p
        || "disableHoverablePopup" in p
        || "actionsRef" in p
    ) return false;
    return true;
}

export function attachButtonFromEvent(e: Event): HTMLElement | null {
    const t = e.target;
    if (!(t instanceof Element)) return null;
    const viaClosest = t.closest(ATTACH_SEL);
    if (viaClosest instanceof HTMLElement) return viaClosest;
    const viaChild = t instanceof HTMLElement ? t.querySelector(ATTACH_SEL) : null;
    return viaChild instanceof HTMLElement ? viaChild : null;
}

export function attachMenuOpen(el: Element): ((open: boolean) => void) | null {
    let fiber: Fiber | null = getFiber(el);
    for (let i = 0; i < 40 && fiber; i++) {
        const p = fiber.memoizedProps;
        if (isAttachMenuProps(p)) return p!.onOpenChange as (open: boolean) => void;
        fiber = fiber.return;
    }
    return null;
}

export function openAttachIfClosed(btn: HTMLElement) {
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
    if (btn.getAttribute("aria-expanded") === "true") return;
    const open = attachMenuOpen(btn);
    if (!open) return;
    requestAnimationFrame(() => {
        if (!btn.isConnected || btn.getAttribute("aria-expanded") === "true") return;
        requestAnimationFrame(() => {
            if (!btn.isConnected || btn.getAttribute("aria-expanded") === "true") return;
            open(true);
        });
    });
}

export function onAttachPointerUp(e: PointerEvent) {
    if (e.button !== 0) return;
    const btn = attachButtonFromEvent(e);
    if (!btn) return;
    openAttachIfClosed(btn);
}

export function bindAttachOpen(signal: AbortSignal) {
    document.addEventListener("pointerup", onAttachPointerUp, { capture: true, signal });
}
