/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatPageStore } from "@turbopack/common/stores";

import { DISMISS, KEEP, onImaginePage, QUERY } from "./shared";

const NATIVE = "data-void-bq-native";
const MARK = "data-void-bq-icon";

export const QUOTE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 12a2 2 0 0 0 2-2V8H8"/><path d="M14 12a2 2 0 0 0 2-2V8h-2"/></svg>';

let armed = false;
let observer: MutationObserver | null = null;
let unsub: (() => void) | null = null;
let raf = 0;

function norm(s: string): string {
    return s.replaceAll(/\s+/g, " ").trim();
}

function quotedText(): string {
    try {
        return String(ChatPageStore.useChatPageStore.getState().quotedText || "");
    } catch {
        return "";
    }
}

function isDismissButton(btn: HTMLElement): boolean {
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    if (KEEP.test(label)) return false;
    if (DISMISS.test(label)) return true;
    return !(btn.textContent || "").replace(/\s+/g, "") && !!btn.querySelector("svg");
}

function isCloseSvg(svg: SVGElement): boolean {
    const d = [...svg.querySelectorAll("path")].map(p => p.getAttribute("d") || "").join(" ");
    return /M18\s*6|6\s*18|l12\s*12/.test(d);
}

function leftSvgs(row: HTMLElement): SVGSVGElement[] {
    const out: SVGSVGElement[] = [];
    for (const svg of row.querySelectorAll("svg")) {
        if (!(svg instanceof SVGSVGElement)) continue;
        if (svg.hasAttribute(MARK) || svg.closest(`[${MARK}]`)) continue;
        if (isCloseSvg(svg)) continue;
        const btn = svg.closest("button, [role='button']");
        if (btn instanceof HTMLElement && row.contains(btn) && isDismissButton(btn)) continue;
        out.push(svg);
    }
    return out;
}

function chipRows(text: string): HTMLElement[] {
    const q = norm(text);
    const clip = q.slice(0, 12);
    if (clip.length < 2) return [];
    const found: HTMLElement[] = [];
    for (const bar of document.querySelectorAll(QUERY)) {
        if (!(bar instanceof HTMLElement)) continue;
        for (const n of bar.querySelectorAll("div, span")) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.closest(".tiptap, [contenteditable='true'], .void-qs-chip")) continue;
            if (n.querySelector("textarea, [contenteditable='true'], .tiptap")) continue;
            if (n.offsetHeight <= 0 || n.offsetHeight > 72) continue;
            const rowText = norm(n.textContent || "");
            if (!rowText.includes(clip) || rowText.length > q.length + 48) continue;
            if (!n.querySelector("svg")) continue;
            found.push(n);
        }
    }
    return found.filter(el => !found.some(other => other !== el && el.contains(other)));
}

function makeIcon(): SVGSVGElement | null {
    const host = document.createElement("div");
    host.innerHTML = QUOTE_ICON_SVG;
    const svg = host.firstElementChild;
    if (!(svg instanceof SVGSVGElement)) return null;
    svg.setAttribute(MARK, "");
    svg.classList.add("void-bq-icon");
    return svg;
}

export function mountQuoteMark(host: HTMLElement) {
    if (host.querySelector("svg")) return;
    const holder = document.createElement("div");
    holder.innerHTML = QUOTE_ICON_SVG;
    const svg = holder.firstElementChild;
    if (svg) host.replaceChildren(svg);
}

function clearOfficial() {
    for (const n of document.querySelectorAll(`[${NATIVE}]`)) {
        n.removeAttribute(NATIVE);
        n.classList.remove("void-bq-native");
    }
    for (const n of document.querySelectorAll(`[${MARK}]`)) n.remove();
}

function paintRow(row: HTMLElement) {
    const natives = leftSvgs(row);
    for (const svg of natives) {
        if (!svg.hasAttribute(NATIVE)) {
            svg.setAttribute(NATIVE, "");
            svg.classList.add("void-bq-native");
        }
    }
    const icons = [...row.querySelectorAll(`[${MARK}]`)];
    if (natives.length && icons.length === 0) {
        const icon = makeIcon();
        if (icon) natives[0].before(icon);
    } else {
        for (const extra of icons.slice(1)) extra.remove();
    }
}

function paint() {
    if (!armed) return;
    if (onImaginePage() || !quotedText()) {
        clearOfficial();
        return;
    }
    const rows = chipRows(quotedText());
    if (!rows.length) {
        clearOfficial();
        return;
    }
    const keep = new Set<Element>();
    for (const row of rows) {
        paintRow(row);
        for (const n of row.querySelectorAll(`[${MARK}], [${NATIVE}]`)) keep.add(n);
    }
    for (const n of document.querySelectorAll(`[${MARK}], [${NATIVE}]`)) {
        if (keep.has(n)) continue;
        if (n.hasAttribute(NATIVE)) {
            n.removeAttribute(NATIVE);
            n.classList.remove("void-bq-native");
        } else {
            n.remove();
        }
    }
}

function schedule() {
    if (!armed || raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (armed) paint();
    });
}

export function startIcons() {
    if (armed) return;
    armed = true;
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    try {
        let seen = quotedText();
        unsub = ChatPageStore.useChatPageStore.subscribe(() => {
            const next = quotedText();
            if (next === seen) return;
            seen = next;
            schedule();
        });
    } catch { /* store not ready */ }
    schedule();
}

export function stopIcons() {
    if (!armed && !observer && !unsub) {
        clearOfficial();
        return;
    }
    armed = false;
    observer?.disconnect();
    observer = null;
    unsub?.();
    unsub = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearOfficial();
}
