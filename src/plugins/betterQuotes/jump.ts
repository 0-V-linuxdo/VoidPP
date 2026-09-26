/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GrokResponse } from "@grok-types/stores/ResponseStore";
import { ChatPageStore, MessageStore, ResponseStore } from "@turbopack/common/stores";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { sleep } from "@utils/misc";
import { getFiber } from "@utils/react";

import { DISMISS, KEEP, onImaginePage, QUERY } from "./shared";

const logger = new Logger("QuoteJump");
const cl = classNameFactory("void-qj-");
const HL = "void-qj";
const EDITOR = ".tiptap, [contenteditable='true']";
const MSG = "[data-testid='user-message'], [data-testid='assistant-message']";
const PANE_SKIP = "[data-sidebar], [class*='pane-card']";
const THINK_SEL = "details, [data-testid*='think'], [class*='thinking'], [class*='Thought'], [aria-label*='Thought']";
const OVERFLOW_SEL = "[class*='overflow-y-auto'], [class*='overflow-auto'], [class*='overflow-y-scroll']";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const JUMP_BTN = "button[aria-label='Jump to quoted message']";
const SCROLLER = "[data-testid='chat-transcript-scroller']";
const FLASH_MS = 1800;
const WAIT_MS = 50;
const WAIT_N = 24;
const ALIGNED_PX = 8;
const MSG_OFFSET = 72;

let abort: AbortController | null = null;
let gen = 0;
let flashTimer = 0;
let flashing: HTMLElement | null = null;
let jumpArmed = false;
let backRaf = 0;
let backObserver: MutationObserver | null = null;
let painting = false;
let openSrc = "";
let menuCites: Cite[] = [];

interface Cite {
    id: string;
    quoted: string;
    live: boolean;
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
        if (/responseid|messageid|^id$/i.test(k)) {
            const id = bareUuid(v);
            if (id) out.push(id);
            else collectIds(v, out, depth + 1);
        } else collectIds(v, out, depth + 1);
    }
}

function bareUuid(value: unknown): string {
    if (typeof value !== "string") return "";
    const m = value.match(UUID);
    if (!m) return "";
    if (m[0] === value || value === `response-${m[0]}`) return m[0];
    return "";
}

function hostOf(el: Element | null): HTMLElement | null {
    return el?.closest<HTMLElement>("[id^='response-']") ?? null;
}

function hostUuid(el: Element | null): string {
    return bareUuid(hostOf(el)?.id);
}

function eventEl(t: EventTarget | null): Element | null {
    if (t instanceof Element) return t;
    if (t instanceof Node) return t.parentElement;
    return null;
}

function officialJumpButton(el: Element | null): HTMLElement | null {
    const btn = el?.closest(JUMP_BTN);
    return btn instanceof HTMLElement ? btn : null;
}

function sourceOfRow(row: GrokResponse | undefined): { parentId: string; quoted: string; ids: string[] } {
    if (!row) return { parentId: "", quoted: "", ids: [] };
    const meta = row.metadata;
    const src = meta && typeof meta.parentQuoteSource === "object" ? meta.parentQuoteSource as Record<string, unknown> : undefined;
    const ids = [...new Set([bareUuid(src?.sourceResponseId), bareUuid(row.parentResponseId)].filter(Boolean))];
    return {
        parentId: ids[0] || "",
        quoted: String(row.parentQuotedText || ""),
        ids,
    };
}

function sourceFromFiber(el: Element): { parentId: string; quoted: string; ids: string[] } {
    let cur = getFiber(el);
    let d = 0;
    let quoted = "";
    while (cur && d < 32) {
        const p = cur.memoizedProps;
        if (p) {
            const {response} = p;
            if (response && typeof response === "object") {
                const rec = response as Record<string, unknown>;
                const meta = rec.metadata && typeof rec.metadata === "object" ? rec.metadata as Record<string, unknown> : undefined;
                const src = meta?.parentQuoteSource && typeof meta.parentQuoteSource === "object"
                    ? meta.parentQuoteSource as Record<string, unknown>
                    : undefined;
                const ids = [...new Set([bareUuid(src?.sourceResponseId), bareUuid(rec.parentResponseId)].filter(Boolean))];
                const fromRow = typeof rec.parentQuotedText === "string" ? rec.parentQuotedText : "";
                if (ids.length || fromRow) return { parentId: ids[0] || "", quoted: fromRow || quoted, ids };
            }
            if (!quoted && typeof p.quotedText === "string" && p.quotedText) quoted = p.quotedText;
        }
        cur = cur.return;
        d++;
    }
    return { parentId: "", quoted, ids: [] };
}

function propsId(el: Element): string {
    let cur = getFiber(el);
    let d = 0;
    while (cur && d < 28) {
        const p = cur.memoizedProps;
        if (p) {
            for (const k of ["responseId", "parentResponseId", "messageId", "id"]) {
                const id = bareUuid(p[k]);
                if (id) return id;
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
        const attrId = bareUuid(attr);
        if (attrId) out.push(attrId);
        const fromFiber = propsId(el);
        if (fromFiber) out.push(fromFiber);
    }
    collectIds(extra, out);
    collectIds(quotePopup(), out);
    return [...new Set(out)];
}

function chatPane(): HTMLElement | null {
    const named = document.querySelector<HTMLElement>(SCROLLER);
    if (named && !named.closest(PANE_SKIP)) return named;
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
    const clips = clipsOf(needle);
    if (!clips.length) return null;
    const cid = conversationId();
    try {
        const nodes = cid ? MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes : undefined;
        if (nodes) {
            const list = Object.values(nodes);
            for (let i = list.length - 1; i >= 0; i--) {
                const node = list[i];
                if (!node?.id) continue;
                if (textHasClip(String(node.content?.message || ""), clips)) return { id: node.id, cid };
            }
        }
    } catch (e) {
        logger.debug("message search failed", e);
    }
    try {
        const r = ResponseStore.useResponseStore.getState();
        const rows = (cid ? r.byConversationId[cid] : null) ?? Object.values(r.byId);
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (!row?.responseId) continue;
            if (textHasClip(String(row.message || ""), clips)) return { id: row.responseId, cid };
        }
    } catch (e) {
        logger.debug("store search failed", e);
    }
    return null;
}

function prefixOf(text: string): string {
    return norm(text).replace(/[.…]+$/u, "");
}

function looseNorm(s: string): string {
    return norm(s.replaceAll(/(?:^|\s)(?:\d+[.)、]|[-*+•])\s+/g, " "));
}

function clipsOf(needle: string): string[] {
    const out: string[] = [];
    const add = (s: string) => {
        const t = prefixOf(s);
        const clip = t.slice(0, Math.min(t.length, 48));
        if (clip.length >= 8 && !out.includes(clip)) out.push(clip);
    };
    add(needle);
    for (const line of needle.split(/\r?\n/)) add(line.replace(/^\s*(?:\d+[.)、]|[-*+•])\s+/, ""));
    add(looseNorm(needle));
    if (!out.length) {
        const t = prefixOf(looseNorm(needle) || needle);
        if (t.length >= 2) out.push(t.slice(0, Math.min(t.length, 48)));
    }
    return out;
}

function textHasClip(text: string, clips: string[]): string {
    const n = norm(text);
    const loose = looseNorm(text);
    let hit = "";
    for (const clip of clips) {
        if ((n.includes(clip) || loose.includes(clip)) && clip.length > hit.length) hit = clip;
    }
    return hit;
}

function nodeHasNeedle(el: Element, needle: string): boolean {
    const clips = clipsOf(needle);
    if (!clips.length) return false;
    const body = el instanceof HTMLElement ? collectParts(el, false).blob : (el.textContent || "");
    if (textHasClip(body, clips)) return true;
    const compact = norm(el.textContent || "");
    return compact.length >= 8 && compact.length < 48 && clips.some(c => c.includes(compact));
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
    const jump = officialJumpButton(el);
    if (jump) return jump;
    const bq = el.closest("[data-testid='user-message'] blockquote");
    if (bq instanceof HTMLElement) return bq;
    const msg = el.closest("[data-testid='user-message']");
    if (!(msg instanceof HTMLElement) || isEditor(el)) return null;
    const row = storeById(propsId(msg) || hostUuid(msg) || idsFrom(msg)[0] || "");
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
    const clips = clipsOf(needle);
    if (!clips.length) return null;
    const ordered = [...clips].sort((a, b) => b.length - a.length);
    for (const allowThink of [false, true]) {
        const parts = collectParts(root, allowThink);
        for (const clip of ordered) {
            const hit = rangeFromParts(parts.parts, parts.blob, clip);
            if (hit) return hit;
        }
    }
    return null;
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

function scrollPane(el: HTMLElement): HTMLElement | null {
    const named = el.closest<HTMLElement>(SCROLLER);
    if (named && !named.closest(PANE_SKIP)) return named;
    const pane = paneOf(el) ?? chatPane();
    return pane && pane.contains(el) ? pane : null;
}

function scrollMessageTop(el: HTMLElement) {
    const host = el.closest<HTMLElement>("[id^='response-']") ?? el;
    const pane = scrollPane(host);
    if (!pane) return;
    const pr = pane.getBoundingClientRect();
    const er = host.getBoundingClientRect();
    pane.scrollTo({ top: pane.scrollTop + (er.top - pr.top) - MSG_OFFSET, behavior: "smooth" });
}

function scrollLineToScreenCenter(range: Range | null, el: HTMLElement) {
    if (!document.body.contains(el)) return;
    const box = lineBox(range);
    if (!box) {
        scrollMessageTop(el.closest<HTMLElement>(MSG) ?? el);
        return;
    }
    const pane = scrollPane(el);
    if (!pane) return;
    const mid = visibleMidY(pane);
    const delta = box.top + box.height / 2 - mid;
    if (Math.abs(delta) < ALIGNED_PX) return;
    pane.scrollTo({ top: pane.scrollTop + delta, behavior: "smooth" });
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
    const jump = origin ? officialJumpButton(origin) : null;
    if (jump) {
        const child = hostUuid(jump);
        const fiber = sourceFromFiber(jump);
        const row = sourceOfRow(child ? storeById(child) : undefined);
        const needle = row.quoted || fiber.quoted || prefixOf(jump.textContent || "");
        return { needle, ids: [...new Set([...fiber.ids, ...row.ids])] };
    }
    const live = quotedText();
    if (origin) {
        const msg = origin.closest<HTMLElement>(MSG);
        const id = msg ? propsId(msg) || hostUuid(msg) || idsFrom(msg)[0] : "";
        const row = id ? storeById(id) : undefined;
        const sent = String(row?.parentQuotedText || "");
        const parent = String(row?.parentResponseId || "");
        const text = sent || live || prefixOf(origin.textContent || "");
        const ids = [bareUuid(parent) || parent, ...idsFrom(origin, row)].filter(Boolean);
        return { needle: text, ids };
    }
    return { needle: live, ids: idsFrom(null) };
}

function insideHost(el: HTMLElement | null, host: HTMLElement | null): boolean {
    return !!el && !!host && (el === host || host.contains(el));
}

function pickMessage(ids: string[], needle: string, skip?: HTMLElement | null): HTMLElement | null {
    const n = prefixOf(needle);
    for (const id of ids) {
        const el = messageById(bareUuid(id) || id);
        if (!el || insideHost(el, skip ?? null)) continue;
        if (n && nodeHasNeedle(el, n)) return el;
    }
    if (!n) return null;
    const rows = messageEls();
    for (let i = rows.length - 1; i >= 0; i--) {
        if (insideHost(rows[i], skip ?? null)) continue;
        if (nodeHasNeedle(rows[i], n)) return rows[i];
    }
    return null;
}

async function jump(origin: HTMLElement | null) {
    const mine = ++gen;
    const { needle, ids } = resolveNeedle(origin);
    if (!prefixOf(needle)) return;
    const skip = officialJumpButton(origin) ? hostOf(origin) : null;
    let el = pickMessage(ids, needle, skip);
    if (!el) {
        const hit = storeNeedle(needle);
        if (hit?.id && hit.id !== hostUuid(skip)) {
            ids.unshift(hit.id);
            await hydrate(hit.cid || conversationId());
            if (mine !== gen) return;
            for (let i = 0; i < WAIT_N; i++) {
                el = pickMessage(ids, needle, skip);
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
        el = pickMessage(ids, needle, skip);
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

function quoteSource(rec: Record<string, unknown>, fallbackParent = ""): { source: string; quoted: string } {
    const quoted = typeof rec.parentQuotedText === "string" ? rec.parentQuotedText : "";
    if (norm(quoted).length < 2) return { source: "", quoted: "" };
    const meta = rec.metadata && typeof rec.metadata === "object" ? rec.metadata as Record<string, unknown> : undefined;
    const src = meta?.parentQuoteSource && typeof meta.parentQuoteSource === "object"
        ? meta.parentQuoteSource as Record<string, unknown>
        : undefined;
    const source = bareUuid(src?.sourceResponseId) || bareUuid(rec.parentResponseId) || bareUuid(fallbackParent);
    return source ? { source, quoted } : { source: "", quoted: "" };
}

function pushCite(map: Map<string, Cite[]>, source: string, cite: Cite) {
    if (!source) return;
    const list = map.get(source) ?? [];
    const quoted = norm(cite.quoted);
    if (list.some(row => row.live === cite.live && row.id === cite.id && norm(row.quoted) === quoted)) {
        map.set(source, list);
        return;
    }
    list.push(cite);
    map.set(source, list);
}

function citesBySource(): Map<string, Cite[]> {
    const map = new Map<string, Cite[]>();
    const cid = conversationId();
    try {
        const nodes = MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes;
        if (nodes) {
            for (const node of Object.values(nodes)) {
                const {content} = node;
                if (!content) continue;
                const hit = quoteSource(content as unknown as Record<string, unknown>, node.parentId ?? "");
                if (!hit.source || hit.source === node.id) continue;
                pushCite(map, hit.source, { id: node.id || content.responseId, quoted: hit.quoted, live: false });
            }
        }
    } catch (e) {
        logger.debug("message nodes failed", e);
    }
    try {
        const store = ResponseStore.useResponseStore.getState();
        const rows = (cid ? store.byConversationId?.[cid] : null) ?? Object.values(store.byId ?? {});
        for (const row of rows) {
            if (!row?.responseId) continue;
            const hit = quoteSource(row as unknown as Record<string, unknown>);
            if (!hit.source || hit.source === row.responseId) continue;
            pushCite(map, hit.source, { id: row.responseId, quoted: hit.quoted, live: false });
        }
    } catch { /* project pages keep this store empty */ }
    for (const btn of document.querySelectorAll<HTMLElement>(JUMP_BTN)) {
        const fiber = sourceFromFiber(btn);
        const quoted = fiber.quoted || prefixOf(btn.textContent || "");
        if (!fiber.parentId || norm(quoted).length < 2) continue;
        pushCite(map, fiber.parentId, { id: hostUuid(btn), quoted, live: false });
    }
    const live = quotedText();
    if (norm(live).length >= 2) {
        const popup = quotePopup();
        const popupId = popup && typeof popup === "object"
            ? bareUuid((popup as Record<string, unknown>).responseId)
            : "";
        let source = popupId;
        if (!source) {
            const clip = norm(live).slice(0, 48);
            try {
                const nodes = MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes;
                if (nodes) {
                    for (const node of Object.values(nodes)) {
                        if (norm(String(node.content?.message || "")).includes(clip)) {
                            source = node.id;
                            break;
                        }
                    }
                }
            } catch { /* store not ready */ }
        }
        if (source) pushCite(map, source, { id: "", quoted: live, live: true });
    }
    return map;
}

function closeMenu() {
    openSrc = "";
    menuCites = [];
    document.querySelector(`.${cl("menu")}`)?.remove();
}

function placeMenu(anchor: HTMLElement) {
    const menu = document.querySelector<HTMLElement>(`.${cl("menu")}`);
    if (!menu) return;
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    const width = menu.offsetWidth || 220;
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)))}px`;
}

function openMenu(anchor: HTMLElement, cites: Cite[]) {
    closeMenu();
    openSrc = anchor.dataset.voidQjSrc || "";
    menuCites = cites;
    const menu = document.createElement("div");
    menu.className = cl("menu");
    cites.forEach((cite, i) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = cl("item");
        item.dataset.voidQjI = String(i);
        const where = cite.live ? "Composer" : "Quote";
        item.textContent = `${where}: ${norm(cite.quoted).slice(0, 72)}`;
        menu.append(item);
    });
    document.body.append(menu);
    placeMenu(anchor);
}

function clearBadges() {
    closeMenu();
    for (const n of document.querySelectorAll(`.${cl("back")}`)) n.remove();
}

function paintBacklinks() {
    if (!jumpArmed || onImaginePage()) {
        clearBadges();
        return;
    }
    const map = citesBySource();
    const seen = new Set<string>();
    for (const [source, cites] of map) {
        if (!cites.length) continue;
        const named = document.getElementById(`response-${source}`);
        const host = named instanceof HTMLElement ? named : messageById(source);
        if (!(host instanceof HTMLElement) || !host.isConnected) continue;
        const box = host.getBoundingClientRect();
        if (box.width < 40 || box.bottom < 24 || box.top > window.innerHeight - 8) continue;
        seen.add(source);
        let btn = document.querySelector<HTMLElement>(`.${cl("back")}[data-void-qj-src="${source}"]`);
        if (!btn) {
            btn = document.createElement("button");
            btn.type = "button";
            btn.className = cl("back");
            btn.dataset.voidQjSrc = source;
            document.body.append(btn);
        }
        const label = cites.length > 1 ? String(cites.length) : "↩";
        if (btn.textContent !== label) btn.textContent = label;
        const aria = cites.length > 1 ? `${cites.length} quotes of this passage` : "Jump to quote";
        if (btn.getAttribute("aria-label") !== aria) btn.setAttribute("aria-label", aria);
        btn.style.left = `${Math.round(Math.min(window.innerWidth - 36, box.right - 28))}px`;
        btn.style.top = `${Math.round(Math.max(8, box.top + 8))}px`;
        if (openSrc === source) placeMenu(btn);
    }
    for (const n of document.querySelectorAll<HTMLElement>(`.${cl("back")}`)) {
        const id = n.dataset.voidQjSrc || "";
        if (seen.has(id)) continue;
        if (openSrc === id) closeMenu();
        n.remove();
    }
    if (openSrc && !seen.has(openSrc)) closeMenu();
}

function scheduleBacklinks() {
    if (!jumpArmed || backRaf || painting) return;
    backRaf = requestAnimationFrame(() => {
        backRaf = 0;
        painting = true;
        try {
            paintBacklinks();
        } finally {
            painting = false;
        }
    });
}

async function jumpToCite(cite: Cite | undefined) {
    if (!cite) return;
    const mine = ++gen;
    if (cite.live) {
        const chip = document.querySelector<HTMLElement>(".void-qs-chip")
            ?? document.querySelector<HTMLElement>(`${QUERY} ${JUMP_BTN}`);
        if (!chip) return;
        highlightRange(null, chip);
        return;
    }
    let el = messageById(cite.id);
    const host = () => document.getElementById(`response-${cite.id}`);
    if (!el && !host()) {
        await hydrate(conversationId());
        if (mine !== gen) return;
        for (let i = 0; i < WAIT_N; i++) {
            el = messageById(cite.id);
            if (el || host()) break;
            await sleep(WAIT_MS);
            if (mine !== gen) return;
        }
    }
    if (mine !== gen) return;
    const root = host();
    const card = root?.querySelector<HTMLElement>(JUMP_BTN) ?? el;
    if (!card) {
        logger.debug("no citing message", cite.id);
        return;
    }
    openAncestors(card, cite.quoted);
    await afterLayout();
    if (mine !== gen || !card.isConnected) return;
    const range = findRange(card, cite.quoted);
    const hit = findHit(card, cite.quoted) ?? card;
    scrollLineToScreenCenter(range, hit);
    highlightRange(range, hit);
}

function onBackClick(t: Element): boolean {
    const badge = t.closest(`.${cl("back")}`);
    if (badge instanceof HTMLElement) {
        const src = badge.dataset.voidQjSrc || "";
        const cites = citesBySource().get(src) ?? [];
        if (cites.length <= 1) {
            closeMenu();
            void jumpToCite(cites[0]);
        } else if (openSrc === src) {
            closeMenu();
        } else {
            openMenu(badge, cites);
        }
        return true;
    }
    const item = t.closest(`.${cl("item")}`);
    if (item instanceof HTMLElement) {
        const cite = menuCites[Number(item.dataset.voidQjI)];
        closeMenu();
        void jumpToCite(cite);
        return true;
    }
    if (!t.closest(`.${cl("menu")}`)) closeMenu();
    return false;
}

function onClick(e: MouseEvent) {
    if (!e.isTrusted || e.button !== 0 || onImaginePage()) return;
    const t = eventEl(e.target);
    if (!t) return;
    if (t.closest(`.${cl("back")}, .${cl("menu")}`)) {
        e.preventDefault();
        e.stopPropagation();
        onBackClick(t);
        return;
    }
    if (isDismiss(t) || isEditor(t) || isBarAction(t)) return;
    const chip = composerChip(t);
    const sent = sentQuote(t);
    if (!chip && !sent) return;
    e.preventDefault();
    e.stopPropagation();
    void jump(sent ?? chip);
}

export function startJump() {
    if (jumpArmed) return;
    jumpArmed = true;
    abort = new AbortController();
    document.addEventListener("click", onClick, { capture: true, signal: abort.signal });
    const poke = () => scheduleBacklinks();
    window.addEventListener("scroll", poke, { capture: true, passive: true, signal: abort.signal });
    window.addEventListener("resize", poke, { passive: true, signal: abort.signal });
    backObserver = new MutationObserver(poke);
    backObserver.observe(document.documentElement, { childList: true, subtree: true });
    scheduleBacklinks();
}

export function stopJump() {
    if (!jumpArmed && !abort) return;
    jumpArmed = false;
    abort?.abort();
    abort = null;
    backObserver?.disconnect();
    backObserver = null;
    if (backRaf) cancelAnimationFrame(backRaf);
    backRaf = 0;
    gen++;
    clearHighlight();
    clearBadges();
}
