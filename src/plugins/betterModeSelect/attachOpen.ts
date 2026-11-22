/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getFiber, type Fiber } from "@utils/react";

export const ATTACH_SEL = '[data-testid="attach-button"]';
export const ATTACH_SLOP_PX = 8;
export const ATTACH_WRAPPER_MAX_PX = 48;

let collapsedPlusAtPointerDown: HTMLElement | null = null;

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

export function isPointOnAttach(
    e: Pick<PointerEvent, "clientX" | "clientY">,
    btn: HTMLElement,
    slop = ATTACH_SLOP_PX,
): boolean {
    const r = btn.getBoundingClientRect();
    return e.clientX >= r.left - slop
        && e.clientX <= r.right + slop
        && e.clientY >= r.top - slop
        && e.clientY <= r.bottom + slop;
}

export function attachButtonFromEvent(e: Event): HTMLElement | null {
    const t = e.target;
    if (!(t instanceof Element)) return null;
    const viaClosest = t.closest(ATTACH_SEL);
    if (viaClosest instanceof HTMLElement) return viaClosest;
    // Tooltip <button> may wrap attach-button so closest misses. Only search
    // a small button host — never form/field/surface/page containers.
    if (!(t instanceof HTMLElement)) return null;
    if (t.matches("form, [data-composer], [data-composer-field], [data-composer-surface]")) return null;
    if (!t.matches("button, [role='button']")) return null;
    const r = t.getBoundingClientRect();
    if (r.width > ATTACH_WRAPPER_MAX_PX || r.height > ATTACH_WRAPPER_MAX_PX) return null;
    const viaChild = t.querySelector(ATTACH_SEL);
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

export function onAttachPointerDown(e: PointerEvent) {
    if (e.button !== 0) {
        collapsedPlusAtPointerDown = null;
        return;
    }
    const btn = attachButtonFromEvent(e);
    collapsedPlusAtPointerDown =
        btn && isPointOnAttach(e, btn) && btn.getAttribute("aria-expanded") !== "true"
            ? btn
            : null;
}

export function onAttachPointerUp(e: PointerEvent) {
    const btn = collapsedPlusAtPointerDown;
    collapsedPlusAtPointerDown = null;
    if (e.button !== 0 || !btn?.isConnected) return;
    if (!isPointOnAttach(e, btn)) return;
    openAttachIfClosed(btn);
}

export function onAttachPointerCancel() {
    collapsedPlusAtPointerDown = null;
}

export function bindAttachOpen(signal: AbortSignal) {
    const opt = { capture: true, signal } as const;
    document.addEventListener("pointerdown", onAttachPointerDown, opt);
    document.addEventListener("pointerup", onAttachPointerUp, opt);
    document.addEventListener("pointercancel", onAttachPointerCancel, opt);
}
