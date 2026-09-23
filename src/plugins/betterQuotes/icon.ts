/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatPageStore } from "@turbopack/common/stores";

import { DISMISS, KEEP, onImaginePage, QUERY } from "./shared";

const MARK = "data-void-bq-glyph";
const ORIG = "data-void-bq-orig";
const VB = "data-void-bq-vb";
const SIBLING = "data-void-bq-icon";

const PATHS = [
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    "M8 12a2 2 0 0 0 2-2V8H8",
    "M14 12a2 2 0 0 0 2-2V8h-2",
];

export const QUOTE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[0]}"/><path d="${PATHS[1]}"/><path d="${PATHS[2]}"/></svg>`;

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
    if (svg.querySelectorAll("line").length >= 2) return true;
    const d = [...svg.querySelectorAll("path")].map(p => (p.getAttribute("d") || "").replace(/\s+/g, " ")).join(" ");
    if (!d) return false;
    return /(?:^|\s)[Mm]18\s+6\b|[Mm]6\s+6\b/.test(d) && /6\s+18|18\s+6|12\s+12/.test(d);
}

function isDismissSvg(svg: SVGElement, row: HTMLElement): boolean {
    if (svg.hasAttribute(SIBLING)) return true;
    const btn = svg.closest("button, [role='button']");
    if (btn instanceof HTMLElement && row.contains(btn) && isDismissButton(btn)) return true;
    if (isCloseSvg(svg)) return true;
    const all = [...row.querySelectorAll("svg")].filter(s => !s.hasAttribute(SIBLING));
    if (all.length >= 2 && all[all.length - 1] === svg) {
        const box = svg.getBoundingClientRect();
        if (box.width <= 28 && box.height <= 28) return true;
    }
    return false;
}

function pathsMatch(svg: SVGSVGElement): boolean {
    if (svg.childElementCount !== PATHS.length) return false;
    return [...svg.children].every((el, i) => el.localName === "path" && el.getAttribute("d") === PATHS[i]);
}

function chipRows(text: string): HTMLElement[] {
    const q = norm(text);
    const clip = q.slice(0, 12);
    if (clip.length < 2) return [];
    const byBar = new Map<HTMLElement, HTMLElement[]>();
    for (const bar of document.querySelectorAll(QUERY)) {
        if (!(bar instanceof HTMLElement)) continue;
        const found: HTMLElement[] = [];
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
        if (found.length) byBar.set(bar, found);
    }
    const out: HTMLElement[] = [];
    for (const list of byBar.values()) {
        const outer = list.filter(el => !list.some(other => other !== el && other.contains(el)));
        const withX = outer.filter(el => [...el.querySelectorAll("svg")].some(svg => svg instanceof SVGElement && isDismissSvg(svg, el)));
        const pool = withX.length ? withX : outer;
        pool.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
        if (pool[0]) out.push(pool[0]);
    }
    return out;
}

function leadingSvg(row: HTMLElement): SVGSVGElement | null {
    for (const svg of row.querySelectorAll("svg")) {
        if (!(svg instanceof SVGSVGElement)) continue;
        if (svg.closest(".void-qs-chip")) continue;
        if (isDismissSvg(svg, row)) continue;
        const box = svg.getBoundingClientRect();
        if (box.width > 32 || box.height > 32) continue;
        return svg;
    }
    return null;
}

function applyGlyph(svg: SVGSVGElement) {
    if (!pathsMatch(svg)) {
        if (!svg.hasAttribute(ORIG)) svg.setAttribute(ORIG, svg.innerHTML);
        const vb = svg.getAttribute("viewBox");
        if (vb !== "0 0 24 24" && !svg.hasAttribute(VB)) svg.setAttribute(VB, vb ?? "");
        svg.replaceChildren(...PATHS.map(d => {
            const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
            p.setAttribute("d", d);
            return p;
        }));
    }
    svg.setAttribute(MARK, "1");
    if (svg.getAttribute("fill") !== "none") svg.setAttribute("fill", "none");
    if (svg.getAttribute("stroke") !== "currentColor") svg.setAttribute("stroke", "currentColor");
    if (svg.getAttribute("stroke-width") !== "2") svg.setAttribute("stroke-width", "2");
    if (svg.getAttribute("stroke-linecap") !== "round") svg.setAttribute("stroke-linecap", "round");
    if (svg.getAttribute("stroke-linejoin") !== "round") svg.setAttribute("stroke-linejoin", "round");
    if (svg.getAttribute("viewBox") !== "0 0 24 24") svg.setAttribute("viewBox", "0 0 24 24");
}

function restoreSvg(svg: SVGSVGElement) {
    const orig = svg.getAttribute(ORIG);
    if (orig != null) svg.innerHTML = orig;
    const vb = svg.getAttribute(VB);
    if (vb != null) {
        if (vb) svg.setAttribute("viewBox", vb);
        else svg.removeAttribute("viewBox");
    }
    svg.removeAttribute(ORIG);
    svg.removeAttribute(VB);
    svg.removeAttribute(MARK);
    svg.removeAttribute("data-void-bq-native");
    svg.classList.remove("void-bq-native");
}

export function mountQuoteMark(host: HTMLElement) {
    if (host.querySelector("svg")) return;
    const holder = document.createElement("div");
    holder.innerHTML = QUOTE_ICON_SVG;
    const svg = holder.firstElementChild;
    if (svg) host.replaceChildren(svg);
}

function clearPaint() {
    for (const n of document.querySelectorAll(`[${MARK}]`)) {
        if (n instanceof SVGSVGElement) restoreSvg(n);
    }
    for (const n of document.querySelectorAll("[data-void-bq-native]")) {
        n.removeAttribute("data-void-bq-native");
        n.classList.remove("void-bq-native");
    }
    for (const n of document.querySelectorAll(`[${SIBLING}]`)) n.remove();
}

function paint() {
    if (!armed) return;
    if (onImaginePage() || !quotedText()) {
        clearPaint();
        return;
    }
    const rows = chipRows(quotedText());
    const keep = new Set<SVGSVGElement>();
    for (const row of rows) {
        const svg = leadingSvg(row);
        if (!svg) continue;
        applyGlyph(svg);
        keep.add(svg);
    }
    for (const n of document.querySelectorAll(`[${MARK}]`)) {
        if (n instanceof SVGSVGElement && !keep.has(n)) restoreSvg(n);
    }
    for (const n of document.querySelectorAll(`[${SIBLING}]`)) n.remove();
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
    armed = false;
    observer?.disconnect();
    observer = null;
    unsub?.();
    unsub = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearPaint();
}
