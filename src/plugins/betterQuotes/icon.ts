/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatPageStore } from "@turbopack/common/stores";

import { onImaginePage, QUERY } from "./shared";

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

function pathData(svg: SVGElement): string {
    return [...svg.querySelectorAll("path")].map(p => (p.getAttribute("d") || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

function isCloseSvg(svg: SVGElement): boolean {
    const d = pathData(svg);
    if (!d) return false;
    return /(?:^|\s)[Mm]18\s+6\b|[Mm]6\s+6\b/.test(d) && /6\s+18|18\s+6|12\s+12/.test(d);
}

function isBars(svg: SVGElement): boolean {
    if (svg.getAttribute(MARK) === "1" || pathsMatch(svg as SVGSVGElement)) return false;
    const lines = [...svg.querySelectorAll("line")];
    if (lines.length >= 2 && lines.length <= 4) {
        const horiz = lines.filter(l => {
            const y1 = Number.parseFloat(l.getAttribute("y1") || "");
            const y2 = Number.parseFloat(l.getAttribute("y2") || "");
            return Number.isFinite(y1) && Number.isFinite(y2) && Math.abs(y1 - y2) < 0.8;
        });
        if (horiz.length >= 2) return true;
    }
    const paths = [...svg.querySelectorAll("path")].map(p => (p.getAttribute("d") || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const horiz = paths.filter(d => /^[Mm]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s*[Hh]/.test(d) && !/[VvAaCcQq]/.test(d) && d.length < 28);
    if (horiz.length >= 2) return true;
    const joined = paths.join(" ");
    const h = joined.match(/[Hh]\s*-?\d/g)?.length ?? 0;
    return h >= 3 && joined.length < 96 && !/[AaCcQq]/.test(joined);
}

function pathsMatch(svg: SVGSVGElement): boolean {
    if (svg.childElementCount !== PATHS.length) return false;
    return [...svg.children].every((el, i) => el.localName === "path" && el.getAttribute("d") === PATHS[i]);
}

function iconSvgs(row: HTMLElement): SVGSVGElement[] {
    const out: SVGSVGElement[] = [];
    for (const svg of row.querySelectorAll("svg")) {
        if (!(svg instanceof SVGSVGElement)) continue;
        if (svg.closest(".void-qs-chip") || svg.hasAttribute(SIBLING)) continue;
        const box = svg.getBoundingClientRect();
        if (box.width > 40 || box.height > 40 || box.width < 1 || box.height < 1) continue;
        out.push(svg);
    }
    out.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left || a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return out;
}

function glyphSvg(row: HTMLElement): SVGSVGElement | null {
    const svgs = iconSvgs(row);
    const ours = svgs.find(s => s.getAttribute(MARK) === "1" || pathsMatch(s));
    if (ours) return ours;
    const bars = svgs.find(isBars);
    if (bars) return bars;
    const left = svgs.find(s => !isCloseSvg(s));
    return left ?? null;
}

function chipRows(text: string): HTMLElement[] {
    const q = norm(text);
    const clip = q.slice(0, 12);
    if (clip.length < 2) return [];
    const out: HTMLElement[] = [];
    for (const bar of document.querySelectorAll(QUERY)) {
        if (!(bar instanceof HTMLElement)) continue;
        const found: HTMLElement[] = [];
        for (const n of bar.querySelectorAll("div, span, button")) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.closest(".tiptap, [contenteditable='true'], .void-qs-chip")) continue;
            if (n.querySelector("textarea, [contenteditable='true'], .tiptap")) continue;
            if (n.offsetHeight <= 0 || n.offsetHeight > 72) continue;
            const rowText = norm(n.textContent || "");
            if (!rowText.includes(clip) || rowText.length > q.length + 48) continue;
            if (!glyphSvg(n)) continue;
            found.push(n);
        }
        const bars = found.filter(el => {
            const g = glyphSvg(el);
            return !!g && (g.getAttribute(MARK) === "1" || pathsMatch(g) || isBars(g));
        });
        const pool = bars.length ? bars : found;
        const inner = pool.filter(el => !pool.some(other => other !== el && el.contains(other)));
        inner.sort((a, b) => (glyphSvg(a)?.getBoundingClientRect().left ?? 0) - (glyphSvg(b)?.getBoundingClientRect().left ?? 0));
        if (inner[0]) out.push(inner[0]);
    }
    return out;
}

function applyGlyph(svg: SVGSVGElement) {
    if (!pathsMatch(svg)) {
        if (!svg.hasAttribute(ORIG)) svg.setAttribute(ORIG, svg.innerHTML);
        const vb = svg.getAttribute("viewBox");
        if (vb !== "0 0 24 24" && !svg.hasAttribute(VB)) svg.setAttribute(VB, vb ?? "");
        const kids = [...svg.children];
        if (kids.length === PATHS.length && kids.every(el => el.localName === "path")) {
            kids.forEach((el, i) => {
                if (el.getAttribute("d") !== PATHS[i]) el.setAttribute("d", PATHS[i]);
            });
        } else {
            svg.replaceChildren(...PATHS.map(d => {
                const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute("d", d);
                return p;
            }));
        }
    }
    if (svg.getAttribute(MARK) !== "1") svg.setAttribute(MARK, "1");
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
        const svg = glyphSvg(row);
        if (!svg || isCloseSvg(svg)) continue;
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
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["d"],
    });
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
