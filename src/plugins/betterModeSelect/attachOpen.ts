/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getFiber, type Fiber } from "@utils/react";

export const ATTACH_SEL = '[data-testid="attach-button"]';
export const ATTACH_SLOP_PX = 8;
const MENU_SEL = '[role="menu"], [role="listbox"], [data-base-ui-popup], [data-radix-menu-content]';

let collapsedPlusAtPointerDown: HTMLElement | null = null;
let openGen = 0;

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
    return viaClosest instanceof HTMLElement ? viaClosest : null;
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

function bumpOpenGen() {
    openGen += 1;
}

export function openAttachIfClosed(btn: HTMLElement) {
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
    if (btn.getAttribute("aria-expanded") === "true") return;
    const open = attachMenuOpen(btn);
    if (!open) return;
    const gen = ++openGen;
    requestAnimationFrame(() => {
        if (gen !== openGen) return;
        if (!btn.isConnected || btn.getAttribute("aria-expanded") === "true") return;
        requestAnimationFrame(() => {
            if (gen !== openGen) return;
            if (!btn.isConnected || btn.getAttribute("aria-expanded") === "true") return;
            open(true);
        });
    });
}

function isInAttachMenu(t: EventTarget | null): boolean {
    return t instanceof Element && !!t.closest(MENU_SEL);
}

export function closeAttachIfOpen() {
    const nodes = document.querySelectorAll(ATTACH_SEL);
    for (const node of nodes) {
        if (!(node instanceof HTMLElement) || node.getAttribute("aria-expanded") !== "true") continue;
        const open = attachMenuOpen(node);
        if (!open) continue;
        bumpOpenGen();
        open(false);
    }
}

export function onAttachPointerDown(e: PointerEvent) {
    if (e.button !== 0) {
        collapsedPlusAtPointerDown = null;
        bumpOpenGen();
        return;
    }
    if (isInAttachMenu(e.target)) {
        collapsedPlusAtPointerDown = null;
        return;
    }
    const btn = attachButtonFromEvent(e);
    if (btn && btn.getAttribute("aria-expanded") !== "true") {
        collapsedPlusAtPointerDown = btn;
        return;
    }
    collapsedPlusAtPointerDown = null;
    bumpOpenGen();
    if (!btn) closeAttachIfOpen();
}

export function onAttachPointerUp(e: PointerEvent) {
    const btn = collapsedPlusAtPointerDown;
    collapsedPlusAtPointerDown = null;
    if (e.button !== 0 || !btn?.isConnected) return;
    if (attachButtonFromEvent(e) !== btn) return;
    openAttachIfClosed(btn);
}

export function onAttachPointerCancel() {
    collapsedPlusAtPointerDown = null;
    bumpOpenGen();
}

export function bindAttachOpen(signal: AbortSignal) {
    const opt = { capture: true, signal } as const;
    document.addEventListener("pointerdown", onAttachPointerDown, opt);
    document.addEventListener("pointerup", onAttachPointerUp, opt);
    document.addEventListener("pointercancel", onAttachPointerCancel, opt);
}
