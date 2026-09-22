/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { TextSearchIcon } from "@components/icons";
import type { GrokResponse } from "@grok-types/stores/ResponseStore";
import { ChatPageStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { sleep } from "@utils/misc";
import { getFiber } from "@utils/react";
import definePlugin, { StartAt } from "@utils/types";

const logger = new Logger("QuoteJump");
const cl = classNameFactory("void-qj-");
const HL = "void-qj";
const QUERY = ".query-bar";
const EDITOR = ".tiptap, [contenteditable='true']";
const MSG = "[data-testid='user-message'], [data-testid='assistant-message']";
const PANE_SKIP = "[data-sidebar], [class*='pane-card']";
const THINK_SEL = "details, [data-testid*='think'], [class*='thinking'], [class*='Thought'], [aria-label*='Thought']";
const OVERFLOW_SEL = "[class*='overflow-y-auto'], [class*='overflow-auto'], [class*='overflow-y-scroll']";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
const KEEP = /submit|send|attach|dictat|mode|file|stop|abort|cancel|暂停|停止/i;
const FLASH_MS = 1800;
const WAIT_MS = 50;
const WAIT_N = 24;
const ALIGNED_PX = 8;
const MSG_OFFSET = 72;

let abort: AbortController | null = null;
let gen = 0;
let flashTimer = 0;
let flashing: HTMLElement | null = null;

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

function quotePopup(): unknown {
    try {
        return ChatPageStore.useChatPageStore.getState().quotePopupData;
    } catch {
        return undefined;
    }
}

function conversationId(): string {
    try {
        const s = ChatPageStore.useChatPageStore.getState();
        return String(s.conversationId || s.optimisticConversationId || "");
    } catch {
        return "";
    }
}

function collectIds(value: unknown, out: string[], depth = 0) {
    if (depth > 5 || out.length > 8 || value == null) return;
    if (typeof value === "string") {
        const m = value.match(UUID);
        if (m) out.push(m[0]);
        return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value)) {
        for (const item of value.slice(0, 24)) collectIds(item, out, depth + 1);
        return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (/responseid|messageid|^id$/i.test(k) && typeof v === "string" && UUID.test(v)) out.push(v);
        else collectIds(v, out, depth + 1);
    }
}

function propsId(el: Element): string {
    let cur = getFiber(el);
    let d = 0;
    while (cur && d < 28) {
        const p = cur.memoizedProps;
        if (p) {
            for (const k of ["responseId", "parentResponseId", "messageId", "id"]) {
                const v = p[k];
                if (typeof v === "string" && UUID.test(v)) return v;
            }
        }
        cur = cur.return;
        d++;
    }
    return "";
}

function idsFrom(el: Element | null, extra?: unknown): string[] {
    const out: string[] = [];
    if (el) {
        const host = el.closest("[id^='response-']");
        if (host) {
            const m = host.id.match(UUID);
            if (m) out.push(m[0]);
        }
        const attr = el.closest("[data-response-id]")?.getAttribute("data-response-id");
        if (attr && UUID.test(attr)) out.push(attr);
        const fromFiber = propsId(el);
        if (fromFiber) out.push(fromFiber);
    }
    collectIds(extra, out);
    collectIds(quotePopup(), out);
    return [...new Set(out)];
}

function chatPane(): HTMLElement | null {
    const main = document.querySelector("main");
    if (!main) return null;
    const skip = (n: HTMLElement) => !!n.closest(PANE_SKIP);
    const msg = main.querySelector<HTMLElement>(MSG);
    if (msg) {
        const col = msg.closest<HTMLElement>(OVERFLOW_SEL);
        if (col && !skip(col)) return col;
    }
    let best: HTMLElement | null = null;
    let bestScore = 0;
    for (const n of main.querySelectorAll<HTMLElement>(OVERFLOW_SEL)) {
        if (skip(n)) continue;
        const r = n.getBoundingClientRect();
        if (r.width < 240 || r.height < 120) continue;
        const score = r.width * r.height;
        if (score > bestScore) {
            best = n;
            bestScore = score;
        }
    }
    return best;
}

function paneOf(el: HTMLElement): HTMLElement | null {
    const pane = chatPane();
    if (pane && pane.contains(el)) return pane;
    for (let n: HTMLElement | null = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        if (n.closest(PANE_SKIP)) continue;
        if (n.closest("pre, code, table, details") && !n.querySelector(MSG)) continue;
        if (n.matches(OVERFLOW_SEL)) return n;
    }
    return null;
}

function messageEls(): HTMLElement[] {
    const root = chatPane() ?? document.querySelector("main") ?? document.body;
    return [...root.querySelectorAll<HTMLElement>(MSG)];
}

function messageById(id: string): HTMLElement | null {
    if (!id) return null;
    const named = document.getElementById(`response-${id}`);
    if (named instanceof HTMLElement) return named.closest<HTMLElement>(MSG) ?? named;
    for (const el of messageEls()) {
        if (el.id === `response-${id}` || el.getAttribute("data-response-id") === id) return el;
        if (propsId(el) === id) return el;
    }
    return null;
}

function storeById(id: string): GrokResponse | undefined {
    try {
        return ResponseStore.useResponseStore.getState().byId[id];
    } catch {
        return undefined;
    }
}

function storeNeedle(needle: string): { id: string; cid: string } | null {
    const n = norm(needle);
    if (n.length < 2) return null;
    try {
        const cid = conversationId();
        const r = ResponseStore.useResponseStore.getState();
        const rows = (cid ? r.byConversationId[cid] : null) ?? Object.values(r.byId);
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (!row?.responseId) continue;
            if (norm(String(row.message || "")).includes(n)) return { id: row.responseId, cid };
        }
    } catch (e) {
        logger.debug("store search failed", e);
    }
    return null;
}

function prefixOf(text: string): string {
    return norm(text).replace(/[.…]+$/u, "");
}

function nodeHasNeedle(el: Element, needle: string): boolean {
    const n = prefixOf(needle);
    if (n.length < 2) return false;
    const text = norm(el.textContent || "");
    const clip = n.slice(0, Math.min(n.length, 48));
    return text.includes(clip) || (clip.includes(text) && text.length >= 8);
}

function isEditor(el: Element): boolean {
    return !!el.closest(EDITOR);
}

function chipRow(btn: HTMLElement): HTMLElement | null {
    const bar = btn.closest(QUERY);
    let n: HTMLElement | null = btn.parentElement;
    while (n && n !== bar) {
        if (n.offsetHeight > 0 && n.offsetHeight <= 72) return n;
        n = n.parentElement;
    }
    return null;
}

function isBarAction(el: Element): boolean {
    const btn = el.closest(`${QUERY} button, ${QUERY} [role='button']`);
    if (!(btn instanceof HTMLElement)) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    return KEEP.test(label);
}

function isDismiss(el: Element): boolean {
    const btn = el.closest(`${QUERY} button, ${QUERY} [role='button']`);
    if (!(btn instanceof HTMLElement)) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    if (KEEP.test(label)) return false;
    if (DISMISS.test(label)) return true;
    const q = quotedText();
    if (!q || norm(btn.textContent || "") || !btn.querySelector("svg")) return false;
    const row = chipRow(btn);
    return !!(row && nodeHasNeedle(row, q));
}

function composerChip(el: Element): HTMLElement | null {
    const sticky = el.closest(".void-qs-chip");
    if (sticky instanceof HTMLElement && !el.closest(".void-qs-x")) return sticky;
    const bar = el.closest(QUERY);
    if (!(bar instanceof HTMLElement) || isEditor(el) || isDismiss(el) || isBarAction(el)) return null;
    const needle = quotedText();
    if (!needle) return null;
    let n: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement;
    while (n && n !== bar) {
        if (n.matches(EDITOR) || n.closest(EDITOR) === n) return null;
        if (n.querySelector("textarea, [contenteditable='true'], .tiptap")) return null;
        if (n.offsetHeight > 0 && n.offsetHeight <= 72 && nodeHasNeedle(n, needle)) {
            const action = n.querySelector("button, [role='button']");
            if (action && isBarAction(action) && !n.contains(el.closest("button, [role='button']") ?? el)) return null;
            return n;
        }
        n = n.parentElement;
    }
    return null;
}

function sentQuote(el: Element): HTMLElement | null {
    const bq = el.closest("[data-testid='user-message'] blockquote");
    if (bq instanceof HTMLElement) return bq;
    const msg = el.closest("[data-testid='user-message']");
    if (!(msg instanceof HTMLElement) || isEditor(el)) return null;
    const row = storeById(propsId(msg) || idsFrom(msg)[0] || "");
    const snippet = String(row?.parentQuotedText || "");
    if (snippet && nodeHasNeedle(el instanceof HTMLElement ? el : msg, snippet)) return el instanceof HTMLElement ? el : msg;
    return null;
}

function hiddenHost(el: Element, allowThink: boolean): boolean {
    if (el.closest("button, svg, [role='toolbar']")) return true;
    if (!allowThink && el.closest(THINK_SEL) && !el.closest("summary")) return true;
    const d = el.closest("details");
    if (d instanceof HTMLDetailsElement && !d.open && !el.closest("summary")) return true;
    try {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return true;
    } catch { /* detached */ }
    return false;
}

function rawIndexForNorm(raw: string, normIdx: number): number {
    let i = 0;
    let n = 0;
    const compact = raw.replaceAll(/\s+/g, " ").trim();
    while (i < raw.length && /^\s/.test(raw[i]!)) i++;
    while (i < raw.length && n < normIdx && n < compact.length) {
        if (/\s/.test(raw[i]!)) {
            while (i < raw.length && /\s/.test(raw[i]!)) i++;
            if (n < compact.length && compact[n] === " ") n++;
            continue;
        }
        i++;
        n++;
    }
    return i;
}

function rangeFromParts(
    parts: { node: Text; raw: string; start: number }[],
    blob: string,
    clip: string,
): Range | null {
    const at = blob.indexOf(clip);
    if (at < 0) return null;
    for (const part of parts) {
        const compact = norm(part.raw);
        if (!compact) continue;
        const end = part.start + compact.length;
        if (at >= end) continue;
        const local = Math.max(0, at - part.start);
        const rawIdx = rawIndexForNorm(part.raw, local);
        const take = Math.min(Math.max(2, clip.length), part.raw.length - rawIdx);
        if (rawIdx < 0 || take < 2) continue;
        const range = document.createRange();
        range.setStart(part.node, rawIdx);
        range.setEnd(part.node, rawIdx + take);
        return range;
    }
    return null;
}

function collectParts(root: HTMLElement, allowThink: boolean) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const parts: { node: Text; raw: string; start: number }[] = [];
    let blob = "";
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const raw = node.nodeValue || "";
        if (!raw.trim()) continue;
        const el = node.parentElement;
        if (!el || hiddenHost(el, allowThink)) continue;
        if (blob) blob += " ";
        parts.push({ node: node as Text, raw, start: blob.length });
        blob += norm(raw);
    }
    return { parts, blob };
}

function findRange(root: HTMLElement, needle: string): Range | null {
    const n = prefixOf(needle);
    if (n.length < 2) return null;
    const clip = n.slice(0, Math.min(n.length, 48));
    const visible = collectParts(root, false);
    const hit = rangeFromParts(visible.parts, visible.blob, clip);
    if (hit) return hit;
    const all = collectParts(root, true);
    return rangeFromParts(all.parts, all.blob, clip);
}

function findHit(root: HTMLElement, needle: string): HTMLElement | null {
    const range = findRange(root, needle);
    if (!range) return null;
    const node = range.startContainer;
    const el = node instanceof HTMLElement ? node : node.parentElement;
    return el?.closest("p, h1, h2, h3, h4, h5, h6, li, td, th, pre, blockquote, span") ?? el;
}

function openAncestors(el: HTMLElement, needle?: string) {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        if (n instanceof HTMLDetailsElement && !n.open) n.open = true;
    }
    if (!needle) return;
    for (const d of el.querySelectorAll("details")) {
        if (!(d instanceof HTMLDetailsElement) || d.open) continue;
        if (nodeHasNeedle(d, needle)) d.open = true;
    }
}

function clearHighlight() {
    if (flashTimer) window.clearTimeout(flashTimer);
    flashTimer = 0;
    flashing?.classList.remove(cl("hit"));
    flashing = null;
    const { highlights } = (CSS as { highlights?: Map<string, unknown> });
    highlights?.delete(HL);
}

function highlightRange(range: Range | null, el: HTMLElement) {
    clearHighlight();
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const { highlights } = (CSS as { highlights?: { set(k: string, v: unknown): void } });
    if (range && highlights && HighlightCtor) {
        highlights.set(HL, new HighlightCtor(range));
    } else {
        flashing = el;
        el.classList.add(cl("hit"));
    }
    flashTimer = window.setTimeout(clearHighlight, FLASH_MS);
}

function visibleMidY(pane: HTMLElement | null): number {
    const top = pane?.getBoundingClientRect().top ?? 0;
    const bar = document.querySelector(QUERY);
    const barTop = bar instanceof HTMLElement ? bar.getBoundingClientRect().top : 0;
    const bottom = barTop > top ? barTop : (pane?.getBoundingClientRect().bottom ?? window.innerHeight);
    return (top + bottom) / 2;
}

function lineBox(range: Range | null): DOMRect | null {
    if (!range || !range.startContainer.isConnected) return null;
    for (const line of range.getClientRects()) {
        if (line.height > 0 || line.width > 0) return line;
    }
    const box = range.getBoundingClientRect();
    return box.height > 0 || box.width > 0 ? box : null;
}

function scrollMessageTop(el: HTMLElement) {
    el.style.scrollMarginTop = `${MSG_OFFSET}px`;
    const pane = paneOf(el) ?? chatPane();
    if (pane && pane.contains(el)) {
        const pr = pane.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        pane.scrollTo({ top: pane.scrollTop + (er.top - pr.top) - MSG_OFFSET, behavior: "smooth" });
        return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
}

function scrollLineToScreenCenter(range: Range | null, el: HTMLElement) {
    if (!document.body.contains(el)) return;
    const box = lineBox(range);
    if (!box) {
        scrollMessageTop(el.closest(MSG) ?? el);
        return;
    }
    const pane = paneOf(el) ?? chatPane();
    const mid = visibleMidY(pane && pane.contains(el) ? pane : null);
    const delta = box.top + box.height / 2 - mid;
    if (Math.abs(delta) < ALIGNED_PX) return;
    if (pane && pane.contains(el)) {
        pane.scrollTo({ top: pane.scrollTop + delta, behavior: "smooth" });
        return;
    }
    const node = range?.startContainer;
    const hit = (node instanceof HTMLElement ? node : node?.parentElement) ?? el;
    if (hit.closest(MSG) !== hit) {
        hit.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        return;
    }
    scrollMessageTop(el);
}

function afterLayout(): Promise<void> {
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

async function hydrate(cid: string) {
    if (!cid) return;
    try {
        await ResponseStore.useResponseStore.getState().loadResponses?.(cid);
        return;
    } catch (e) {
        logger.debug("loadResponses failed", e);
    }
    try {
        await ResponseStore.useResponseStore.getState().loadMoreResponses?.(cid);
    } catch (e) {
        logger.debug("loadMoreResponses failed", e);
    }
}

function resolveNeedle(origin: HTMLElement | null): { needle: string; ids: string[] } {
    const live = quotedText();
    if (origin) {
        const msg = origin.closest<HTMLElement>(MSG);
        const id = msg ? propsId(msg) || idsFrom(msg)[0] : "";
        const row = id ? storeById(id) : undefined;
        const sent = String(row?.parentQuotedText || "");
        const parent = String(row?.parentResponseId || "");
        const text = sent || live || prefixOf(origin.textContent || "");
        const ids = [parent, ...idsFrom(origin, row)].filter(Boolean);
        return { needle: text, ids };
    }
    return { needle: live, ids: idsFrom(null) };
}

function pickMessage(ids: string[], needle: string): HTMLElement | null {
    for (const id of ids) {
        const el = messageById(id);
        if (el) return el;
    }
    const n = prefixOf(needle);
    if (!n) return null;
    const rows = messageEls();
    for (let i = rows.length - 1; i >= 0; i--) {
        if (nodeHasNeedle(rows[i], n)) return rows[i];
    }
    return null;
}

async function jump(origin: HTMLElement | null) {
    const mine = ++gen;
    const { needle, ids } = resolveNeedle(origin);
    if (!prefixOf(needle)) return;
    let el = pickMessage(ids, needle);
    if (!el || (!findHit(el, needle) && !nodeHasNeedle(el, needle))) {
        const hit = storeNeedle(needle);
        if (hit) {
            if (hit.id) ids.unshift(hit.id);
            await hydrate(hit.cid || conversationId());
            if (mine !== gen) return;
            for (let i = 0; i < WAIT_N; i++) {
                el = pickMessage(ids, needle);
                if (el) break;
                await sleep(WAIT_MS);
                if (mine !== gen) return;
            }
        }
    }
    if (mine !== gen) return;
    if (!el) {
        logger.debug("no source message");
        return;
    }
    openAncestors(el, needle);
    await afterLayout();
    if (mine !== gen) return;
    if (!el.isConnected) {
        el = pickMessage(ids, needle);
        if (!el) return;
        openAncestors(el, needle);
        await afterLayout();
        if (mine !== gen || !el.isConnected) return;
    }
    const range = findRange(el, needle);
    const hit = findHit(el, needle) ?? el;
    scrollLineToScreenCenter(range, hit);
    highlightRange(range, hit);
}

function onClick(e: MouseEvent) {
    if (!e.isTrusted || e.button !== 0 || onImaginePage()) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (isDismiss(t) || isEditor(t) || isBarAction(t)) return;
    const chip = composerChip(t);
    const sent = sentQuote(t);
    if (!chip && !sent) return;
    e.preventDefault();
    e.stopPropagation();
    void jump(sent ?? chip);
}

export default definePlugin({
    name: "QuoteJump",
    icon: TextSearchIcon,
    description: "Click a composer quote chip to scroll to the exact quoted passage, not just the message.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.TurbopackReady,

    start() {
        abort = new AbortController();
        document.addEventListener("click", onClick, { capture: true, signal: abort.signal });
    },

    stop() {
        abort?.abort();
        abort = null;
        gen++;
        clearHighlight();
    },
});
