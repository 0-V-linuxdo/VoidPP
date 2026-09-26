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
const QUOTE_PATHS = [
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    "M8 12a2 2 0 0 0 2-2V8H8",
    "M14 12a2 2 0 0 0 2-2V8h-2",
];
const WAIT_MS = 50;
const WAIT_N = 24;
const CLUSTER_GAP = 240;
const COMFORT_PAD = 72;

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

function sourceOfRow(row: GrokResponse | undefined): { parentId: string; quoted: string; ids: string[]; hard: string; parent: string } {
    if (!row) return { parentId: "", quoted: "", ids: [], hard: "", parent: "" };
    const meta = row.metadata;
    const src = meta && typeof meta.parentQuoteSource === "object" ? meta.parentQuoteSource as Record<string, unknown> : undefined;
    const hard = bareUuid(src?.sourceResponseId);
    const parent = bareUuid(row.parentResponseId);
    const ids = [...new Set([hard, parent].filter(Boolean))];
    return {
        parentId: hard || parent || "",
        quoted: String(row.parentQuotedText || ""),
        ids,
        hard,
        parent,
    };
}

function sourceFromFiber(el: Element): { parentId: string; quoted: string; ids: string[]; hard: string; parent: string } {
    const child = hostUuid(el);
    const empty = { parentId: "", quoted: "", ids: [] as string[], hard: "", parent: "" };
    let cur = getFiber(el);
    let d = 0;
    let quoted = "";
    while (cur && d < 32) {
        const p = cur.memoizedProps;
        if (p) {
            const direct = propSourceId(p, child);
            const {response} = p;
            if (response && typeof response === "object") {
                const rec = response as Record<string, unknown>;
                const meta = rec.metadata && typeof rec.metadata === "object" ? rec.metadata as Record<string, unknown> : undefined;
                const src = meta?.parentQuoteSource && typeof meta.parentQuoteSource === "object"
                    ? meta.parentQuoteSource as Record<string, unknown>
                    : undefined;
                const hard = [direct, bareUuid(src?.sourceResponseId)].find(id => id && id !== child) || "";
                const parentRaw = bareUuid(rec.parentResponseId);
                const parent = parentRaw && parentRaw !== child ? parentRaw : "";
                const ids = [...new Set([hard, parent].filter(Boolean))];
                const fromRow = typeof rec.parentQuotedText === "string" ? rec.parentQuotedText : "";
                if (ids.length || fromRow) return { parentId: hard || parent, quoted: fromRow || quoted, ids, hard, parent };
            }
            if (direct) return { parentId: direct, quoted, ids: [direct], hard: direct, parent: "" };
            if (!quoted && typeof p.quotedText === "string" && p.quotedText) quoted = p.quotedText;
        }
        cur = cur.return;
        d++;
    }
    return { ...empty, quoted };
}

function propSourceId(p: Record<string, unknown>, child: string): string {
    const take = (value: unknown): string => {
        if (!value || typeof value !== "object") return "";
        const rec = value as Record<string, unknown>;
        const id = bareUuid(rec.sourceResponseId);
        if (id && id !== child) return id;
        const nested = rec.parentQuoteSource;
        if (nested && typeof nested === "object") {
            const inner = bareUuid((nested as Record<string, unknown>).sourceResponseId);
            if (inner && inner !== child) return inner;
        }
        return "";
    };
    const own = bareUuid(p.sourceResponseId);
    if (own && own !== child) return own;
    for (const value of Object.values(p)) {
        const id = take(value);
        if (id) return id;
    }
    return "";
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
    const hosts = [...root.querySelectorAll<HTMLElement>("[id^='response-']")];
    if (hosts.length) return hosts;
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

function hostClip(needle: string): string {
    const raw = prefixOf(needle).slice(0, 48);
    const loose = prefixOf(looseNorm(needle)).slice(0, 48);
    if (raw.length >= 8) return raw;
    return loose;
}

function hostScore(text: string, needle: string): number {
    const clip = hostClip(needle);
    if (clip.length < 8) return 0;
    const n = norm(text);
    const loose = looseNorm(text);
    if (!n.includes(clip) && !loose.includes(clip)) return 0;
    return clip.length / Math.max(n.length, 1);
}

function coverScore(text: string, needle: string): number {
    const direct = hostScore(text, needle);
    if (direct > 0) return direct;
    const hit = textHasClip(text, clipsOf(needle));
    if (!hit) return 0;
    return hit.length / Math.max(norm(text).length, 1);
}

function nodeText(node: { id?: string; content?: { message?: string; query?: string } } | undefined, id = ""): string {
    const rec = node?.content;
    let mapped = "";
    try {
        if (node) mapped = String(MessageStore.nodeToResponse?.(conversationId(), node as never)?.message || "");
    } catch { /* mapper missing */ }
    return String(rec?.message || rec?.query || mapped || storeById(id || node?.id || "")?.message || "");
}

function blobScore(el: HTMLElement, needle: string): number {
    const vis = coverScore(collectParts(el, false).blob, needle);
    if (vis > 0) return vis;
    return coverScore(collectParts(el, true).blob, needle);
}

function quotedField(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const rec = value as Record<string, unknown>;
    if (typeof rec.parentQuotedText === "string") return rec.parentQuotedText;
    const content = rec.content;
    if (content && typeof content === "object") {
        const inner = (content as Record<string, unknown>).parentQuotedText;
        if (typeof inner === "string") return inner;
    }
    return "";
}

function passageId(needle: string, skipId = "", ban = ""): { id: string; cid: string } | null {
    if (hostClip(needle).length < 8 && !clipsOf(needle).length) return null;
    const cid = conversationId();
    const skip = new Set([bareUuid(skipId), bareUuid(ban)].filter(Boolean));
    let childAt = 0;
    try {
        const nodes = cid ? MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes : undefined;
        childAt = Number(nodes?.[bareUuid(skipId)]?.createdAt) || 0;
    } catch { /* store not ready */ }
    let best: { id: string; score: number; at: number } | null = null;
    const consider = (id: string, text: string, quoted: string, at: number) => {
        if (!id || skip.has(id)) return;
        if (childAt && at && at > childAt) return;
        if (coverScore(quoted, needle) > 0) return;
        const score = coverScore(text, needle);
        if (score <= 0) return;
        if (!best || score > best.score || (score === best.score && at < best.at)) best = { id, score, at };
    };
    try {
        const nodes = cid ? MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes : undefined;
        if (nodes) {
            for (const node of Object.values(nodes)) {
                if (!node?.id) continue;
                consider(node.id, nodeText(node, node.id), quotedField(node), Number(node.createdAt) || 0);
            }
        }
    } catch (e) {
        logger.debug("passage search failed", e);
    }
    try {
        const r = ResponseStore.useResponseStore.getState();
        const rows = (cid ? r.byConversationId[cid] : null) ?? Object.values(r.byId);
        for (const row of rows) {
            if (!row?.responseId) continue;
            consider(row.responseId, String(row.message || row.query || ""), quotedField(row), Number(row.createTime) || 0);
        }
    } catch (e) {
        logger.debug("passage rows failed", e);
    }
    return best ? { id: best.id, cid } : null;
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

function hostQuote(id: string, host: HTMLElement | null): { quoted: string; ids: string[]; hard: string; parent: string } {
    const row = sourceOfRow(id ? storeById(id) : undefined);
    if (row.quoted || row.ids.length) return row;
    if (host) {
        const fiber = sourceFromFiber(host);
        if (fiber.quoted || fiber.ids.length) return fiber;
    }
    try {
        const cid = conversationId();
        const node = cid && id ? MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes?.[id] : undefined;
        const mapped = node ? MessageStore.nodeToResponse?.(cid, node) : undefined;
        const fromNode = sourceOfRow(mapped);
        if (fromNode.quoted || fromNode.ids.length) return fromNode;
    } catch { /* store not ready */ }
    return row;
}

function looksLikeQuote(n: HTMLElement): boolean {
    const cls = typeof n.className === "string" ? n.className : "";
    const h = n.offsetHeight;
    if (h <= 0 || h > 160) return false;
    if (/whitespace-pre-wrap/.test(cls) && /text-secondary|text-fg-secondary|bg-surface/.test(cls)) return true;
    return h <= 96 && !!n.querySelector("svg") && /flex/.test(cls) && /items-start|gap-1/.test(cls);
}

function textIsQuote(text: string, quote: string): boolean {
    if (text.length < 8 || text.length >= 800 || quote.length < 8) return false;
    return quote.startsWith(text.slice(0, 24)) || text.includes(quote.slice(0, 24)) || quote.includes(text.slice(0, 48));
}

function quotePreview(el: Element): HTMLElement | null {
    if (isEditor(el) || el.closest("a, button, [role='button']")) return null;
    const host = hostOf(el);
    if (!host) return null;
    const quote = norm(hostQuote(hostUuid(host), host).quoted);
    let n: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement;
    while (n && n !== host) {
        if (looksLikeQuote(n) && textIsQuote(norm(n.textContent || ""), quote)) return n;
        n = n.parentElement;
    }
    return null;
}

function sentQuote(el: Element): HTMLElement | null {
    const jump = officialJumpButton(el);
    if (jump) return jump;
    const preview = quotePreview(el);
    if (preview) return preview;
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
    if (el.closest("button, svg, [role='toolbar'], [data-void-qj-preview]")) return true;
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

function rangeCovering(
    parts: { node: Text; raw: string; start: number }[],
    from: number,
    to: number,
): Range | null {
    const at = (index: number) => {
        for (const part of parts) {
            const compact = norm(part.raw);
            if (!compact) continue;
            if (index >= part.start && index < part.start + compact.length) return part;
        }
        return null;
    };
    let startIdx = from;
    let endIdx = to - 1;
    while (startIdx < to && !at(startIdx)) startIdx++;
    while (endIdx >= startIdx && !at(endIdx)) endIdx--;
    const a = at(startIdx);
    const b = at(endIdx);
    if (!a || !b) return null;
    try {
        const range = document.createRange();
        range.setStart(a.node, Math.min(rawIndexForNorm(a.raw, startIdx - a.start), a.node.length));
        range.setEnd(b.node, Math.min(rawIndexForNorm(b.raw, endIdx - b.start + 1), b.node.length));
        return range.collapsed ? null : range;
    } catch {
        return null;
    }
}

function findLoose(blob: string, clip: string, from: number): { at: number; len: number } | null {
    if (from > blob.length) return null;
    const direct = blob.indexOf(clip, from);
    if (direct >= 0) return { at: direct, len: clip.length };
    const want = looseNorm(clip);
    if (want.length < 2) return null;
    const mark = /(?:\d+[.)、]|[-*+•]) /y;
    let loose = "";
    const map: number[] = [];
    for (let i = from; i < blob.length;) {
        mark.lastIndex = i;
        const hit = mark.exec(blob);
        if (hit && hit.index === i) {
            i += hit[0].length;
            continue;
        }
        map.push(i);
        loose += blob[i];
        i++;
    }
    const at = loose.indexOf(want);
    if (at < 0) return null;
    const start = map[at];
    const end = map[at + want.length - 1];
    if (start == null || end == null) return null;
    return { at: start, len: end - start + 1 };
}

function paintLines(needle: string): string[] {
    const lines = needle.split(/\r?\n/)
        .map(line => prefixOf(line.replace(/^\s*(?:\d+[.)、]|[-*+•])\s+/, "")))
        .filter(line => line.length >= 2);
    if (lines.length > 1) return lines;
    const whole = prefixOf(needle);
    return whole.length >= 2 ? [whole] : lines;
}

function flex(s: string): string {
    return looseNorm(s).replaceAll(/[`"'“”‘’]/g, "").replaceAll(/\s+/g, "");
}

function blockFits(text: string, want: string, lines: string[]): boolean {
    if (text.length < 4) return false;
    let shardOf = 0;
    for (const line of lines) {
        if (line.length > text.length && line.includes(text) && line.length > shardOf) shardOf = line.length;
    }
    if (shardOf && (text.length < 8 || text.length * 10 < shardOf * 6)) return false;
    for (const line of lines) {
        if (text === line) return true;
        if (line.length >= 8 && text.includes(line) && text.length <= line.length + 12) return true;
    }
    return want.length >= 8 && text.length >= 8 && want.includes(text) && !shardOf;
}

function blockRanges(root: HTMLElement, needle: string, allowThink: boolean): Range[] {
    const want = flex(needle);
    const lines = paintLines(needle).map(flex).filter(line => line.length >= 4);
    if (want.length < 4 && !lines.length) return [];
    const ranges: Range[] = [];
    for (const el of root.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, span")) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.closest("button, svg, [role='toolbar'], td, th")) continue;
        if (el.querySelector("p, li")) continue;
        if (hiddenHost(el, allowThink)) continue;
        const text = flex(el.textContent || "");
        if (!blockFits(text, want, lines)) continue;
        try {
            const range = document.createRange();
            range.selectNodeContents(el);
            if (!range.collapsed) ranges.push(range);
        } catch { /* detached */ }
    }
    return ranges;
}

function clipRanges(root: HTMLElement, needle: string): Range[] {
    const wants = paintLines(needle).filter(line => line.length >= 4);
    const whole = prefixOf(needle);
    if (whole.length >= 4 && !wants.includes(whole)) wants.unshift(whole);
    if (!wants.length) return [];
    const nodes: { node: Text; start: number }[] = [];
    let blob = "";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let cur: Node | null;
    while ((cur = walker.nextNode())) {
        const raw = cur.nodeValue || "";
        if (!raw) continue;
        const el = cur.parentElement;
        if (!el || hiddenHost(el, true) || el.closest("td, th")) continue;
        nodes.push({ node: cur as Text, start: blob.length });
        blob += raw;
    }
    const locate = (at: number) => {
        let hit: { node: Text; start: number } | null = null;
        for (const part of nodes) {
            if (part.start > at) break;
            hit = part;
        }
        return hit;
    };
    const ranges: Range[] = [];
    for (const want of wants) {
        const at = blob.indexOf(want);
        if (at < 0) continue;
        const end = at + want.length - 1;
        const a = locate(at);
        const b = locate(end);
        if (!a || !b) continue;
        try {
            const range = document.createRange();
            range.setStart(a.node, at - a.start);
            range.setEnd(b.node, end - b.start + 1);
            if (!range.collapsed) ranges.push(range);
        } catch { /* detached */ }
    }
    return ranges;
}

function findRanges(root: HTMLElement, needle: string): Range[] {
    const lines = paintLines(needle);
    if (!lines.length) return [];
    const clips = clipRanges(root, needle);
    if (clips.length) return clips;
    for (const allowThink of [false, true]) {
        const blocks = blockRanges(root, needle, allowThink);
        if (blocks.length) return blocks;
        const { parts, blob } = collectParts(root, allowThink);
        const whole = prefixOf(needle);
        if (whole.length >= 8) {
            const hit = findLoose(blob, whole, 0);
            if (hit) {
                const span = rangeCovering(parts, hit.at, hit.at + hit.len);
                if (span) return [span];
            }
        }
        const ranges: Range[] = [];
        let cursor = 0;
        let first = -1;
        let last = -1;
        for (const line of lines) {
            const hit = findLoose(blob, line, cursor) ?? (cursor ? findLoose(blob, line, 0) : null);
            if (!hit) continue;
            if (first < 0) first = hit.at;
            last = hit.at + hit.len;
            cursor = Math.max(cursor, last);
        }
        if (first >= 0 && last > first) {
            const span = rangeCovering(parts, first, last);
            if (span) ranges.push(span);
        }
        if (ranges.length) return ranges;
    }
    return [];
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

function highlightRange(range: Range | readonly Range[] | null, el: HTMLElement, flashHost = false) {
    clearHighlight();
    const list = (Array.isArray(range) ? range : range ? [range] : []).filter(item => !item.collapsed);
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const { highlights } = (CSS as { highlights?: { set(k: string, v: unknown): void } });
    if (list.length && highlights && HighlightCtor) {
        highlights.set(HL, new HighlightCtor(...list));
    } else if (list.length || flashHost || !el.closest("[id^='response-']")) {
        flashing = el;
        el.classList.add(cl("hit"));
    }
    flashTimer = window.setTimeout(clearHighlight, FLASH_MS);
}

function comfortBand(pane: HTMLElement): { top: number; bottom: number } {
    const rect = pane.getBoundingClientRect();
    const bar = document.querySelector(QUERY);
    const barTop = bar instanceof HTMLElement ? bar.getBoundingClientRect().top : 0;
    const floor = barTop > rect.top + 80 ? barTop : rect.bottom;
    const room = Math.max(0, floor - rect.top);
    const pad = Math.min(COMFORT_PAD, Math.max(8, room / 6));
    return { top: rect.top + pad, bottom: floor - pad };
}

function aimBox(range: Range | null, el: HTMLElement): DOMRect | null {
    const line = range && lineBox(range);
    if (line && line.height > 0) return line;
    const box = el.getBoundingClientRect();
    if (box.height < 1) return null;
    return new DOMRect(box.x, box.y, box.width, Math.min(96, box.height));
}

function ensureDelta(box: DOMRect, pane: HTMLElement): number {
    const { top, bottom } = comfortBand(pane);
    const room = bottom - top;
    if (room < 40) return box.top - top;
    if (box.height >= room) return box.top - top;
    if (box.top >= top && box.bottom <= bottom) return 0;
    if (box.bottom > bottom) return box.bottom - bottom;
    return box.top - top;
}

function ensureVisible(range: Range | null, el: HTMLElement, behavior: ScrollBehavior = "smooth") {
    if (!el.isConnected) return;
    const box = aimBox(range, el);
    if (!box) return;
    const pane = scrollPane(el);
    if (!pane) return;
    const delta = ensureDelta(box, pane);
    if (Math.abs(delta) < 1) return;
    pane.scrollTo({ top: pane.scrollTop + delta, behavior });
}

function lineBox(range: Range | null): DOMRect | null {
    if (!range || !range.startContainer.isConnected) return null;
    for (const line of range.getClientRects()) {
        if (line.height > 0 || line.width > 0) return line;
    }
    const box = range.getBoundingClientRect();
    return box.height > 0 || box.width > 0 ? box : null;
}

function hitOf(range: Range | null): HTMLElement | null {
    if (!range) return null;
    const node = range.startContainer;
    const el = node instanceof HTMLElement ? node : node.parentElement;
    return el?.closest("p, h1, h2, h3, h4, h5, h6, li, pre, blockquote") ?? el;
}

function scrollAnchor(ranges: readonly Range[]): Range | null {
    const kept: Range[] = [];
    for (const range of ranges) {
        if (range.collapsed || !range.startContainer.isConnected) continue;
        const node = range.startContainer;
        const el = node instanceof Element ? node : node.parentElement;
        if (el?.closest("td, th, button")) continue;
        if (flex(range.toString()).length < 8) continue;
        kept.push(range);
    }
    const pool = kept.length ? kept : ranges.filter(range => !range.collapsed);
    if (!pool.length) return null;
    const ordered = pool.toSorted((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
    let best: Range[] = [];
    let bestScore = -1;
    let cur: Range[] = [];
    let prev = Number.NEGATIVE_INFINITY;
    const flush = () => {
        if (!cur.length) return;
        const score = cur.reduce((sum, range) => sum + flex(range.toString()).length, 0);
        if (score > bestScore) {
            bestScore = score;
            best = cur;
        }
        cur = [];
    };
    for (const range of ordered) {
        const top = lineBox(range)?.top;
        if (cur.length && top != null && Number.isFinite(prev) && top - prev > CLUSTER_GAP) flush();
        cur.push(range);
        if (top != null) prev = top;
    }
    flush();
    return best[0] ?? ordered[0] ?? null;
}

function scrollPane(el: HTMLElement): HTMLElement | null {
    const named = el.closest<HTMLElement>(SCROLLER);
    if (named && !named.closest(PANE_SKIP)) return named;
    const pane = paneOf(el) ?? chatPane();
    return pane && pane.contains(el) ? pane : null;
}

function afterLayout(): Promise<void> {
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

async function hydrate(cid: string) {
    if (!cid) return;
    try {
        await ResponseStore.useResponseStore.getState().loadResponses?.(cid);
    } catch (e) {
        logger.debug("loadResponses failed", e);
        try {
            await ResponseStore.useResponseStore.getState().loadMoreResponses?.(cid);
        } catch (err) {
            logger.debug("loadMoreResponses failed", err);
        }
    }
    try {
        const gw = MessageStore.useMessageStore.getState().conversations?.[cid];
        if (gw?.defaultLeafId && gw.history?.hasMore) {
            MessageStore.useMessageStore.getState().loadOlderHistory?.({ convId: cid, leafId: gw.defaultLeafId });
        }
    } catch (e) {
        logger.debug("loadOlderHistory failed", e);
    }
}

function resolveNeedle(origin: HTMLElement | null): { needle: string; hard: string; parent: string } {
    const jump = origin ? officialJumpButton(origin) : null;
    if (jump) {
        const child = hostUuid(jump);
        const fiber = sourceFromFiber(jump);
        const row = sourceOfRow(child ? storeById(child) : undefined);
        const shown = prefixOf(jump.textContent || "");
        const needle = (shown.length >= 8 ? shown : "") || row.quoted || fiber.quoted || shown;
        return { needle, hard: fiber.hard || row.hard, parent: fiber.parent || row.parent };
    }
    const live = quotedText();
    if (origin) {
        const shown = prefixOf(origin.textContent || "");
        const msg = origin.closest<HTMLElement>(MSG) ?? hostOf(origin);
        const id = msg ? propsId(msg) || hostUuid(msg) || idsFrom(msg)[0] : "";
        const from = hostQuote(id, msg);
        const needle = (shown.length >= 8 ? shown : "") || from.quoted || shown;
        return { needle, hard: from.hard, parent: from.parent };
    }
    return { needle: live, hard: "", parent: "" };
}

function insideHost(el: HTMLElement | null, host: HTMLElement | null): boolean {
    return !!el && !!host && (el === host || host.contains(el));
}

function pickMessage(ids: string[], needle: string, skip?: HTMLElement | null): HTMLElement | null {
    if (hostClip(needle).length < 8) return null;
    const rows = messageEls();
    const childI = skip ? rows.findIndex(el => insideHost(el, skip)) : -1;
    const scored: { el: HTMLElement; i: number; id: string; score: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
        const el = rows[i];
        if (!el || insideHost(el, skip ?? null)) continue;
        if (childI >= 0 && i > childI) continue;
        const score = blobScore(el, needle);
        if (score <= 0) continue;
        scored.push({ el, i, id: hostUuid(el) || propsId(el), score });
    }
    for (const id of ids) {
        const want = bareUuid(id) || id;
        const hit = scored.find(x => x.id === want);
        if (!hit) continue;
        if (hit.score < 0.08 && scored.some(x => x !== hit && x.score >= 0.08 && x.score > hit.score * 2)) continue;
        return hit.el;
    }
    scored.sort((a, b) => b.score - a.score || a.i - b.i);
    return scored[0]?.el ?? null;
}

function liveSource(id: string, skip: HTMLElement | null): HTMLElement | null {
    const el = messageById(id);
    if (!el || insideHost(el, skip)) return null;
    return el;
}

function nodeIndex(id: string): { at: number; n: number } | null {
    const cid = conversationId();
    try {
        const nodes = cid ? MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes : undefined;
        if (!nodes) return null;
        const rows = Object.values(nodes)
            .filter(node => node?.id)
            .map(node => ({ id: String(node.id), at: Number(node.createdAt) || 0 }));
        if (!rows.some(row => row.id === id)) return null;
        rows.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
        return { at: rows.findIndex(row => row.id === id), n: rows.length };
    } catch {
        return null;
    }
}

async function revealSource(id: string, skip: HTMLElement | null, mine: number): Promise<HTMLElement | null> {
    const ready = liveSource(id, skip);
    if (ready) return ready;
    const pane = chatPane();
    if (!pane) return null;
    const order = nodeIndex(id);
    const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
    const guess = order ? (order.at / Math.max(order.n - 1, 1)) * max : Math.max(0, pane.scrollTop - pane.clientHeight);
    const seen = new Set<number>();
    const hop = async (top: number): Promise<HTMLElement | null> => {
        if (mine !== gen) return null;
        const next = Math.max(0, Math.min(max, top));
        const key = Math.round(next);
        if (seen.has(key)) return liveSource(id, skip);
        seen.add(key);
        pane.scrollTo({ top: next, behavior: "auto" });
        await afterLayout();
        await sleep(WAIT_MS);
        return liveSource(id, skip);
    };
    let found = await hop(guess);
    if (found || mine !== gen) return found;
    const step = Math.max(pane.clientHeight * 0.85, 480);
    for (const dir of [-1, 1]) {
        let top = guess;
        for (let i = 0; i < 16; i++) {
            top += dir * step;
            if (top < 0 || top > max) break;
            found = await hop(top);
            if (found || mine !== gen) return found;
        }
    }
    return liveSource(id, skip);
}

function settleScroll(pane: HTMLElement, mine: number, place: () => { anchor: Range | null; target: HTMLElement }): Promise<void> {
    return new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            pane.removeEventListener("scrollend", finish);
            if (mine !== gen) {
                resolve();
                return;
            }
            const { anchor, target } = place();
            if (target.isConnected) ensureVisible(anchor, target, "auto");
            resolve();
        };
        pane.addEventListener("scrollend", finish, { once: true });
        window.setTimeout(finish, 700);
    });
}

async function land(el: HTMLElement, needle: string, mine: number, pin = "") {
    openAncestors(el, needle);
    await afterLayout();
    if (mine !== gen) return;
    if (!el.isConnected && pin) {
        const fresh = messageById(pin);
        if (fresh?.isConnected) el = fresh;
    }
    if (!el.isConnected) return;
    let ranges = clipRanges(el, needle);
    highlightRange(ranges, el, false);
    const place = () => {
        if (!el.isConnected && pin) {
            const fresh = messageById(pin);
            if (fresh?.isConnected) el = fresh;
        }
        if (el.isConnected && !ranges.some(range => range.startContainer.isConnected)) {
            ranges = clipRanges(el, needle);
            highlightRange(ranges, el, false);
        }
        const anchor = scrollAnchor(ranges);
        const painted = anchor ? hitOf(anchor) : null;
        const target = painted?.isConnected ? painted : el;
        return { anchor, target };
    };
    const first = place();
    const pane = scrollPane(first.target) ?? scrollPane(el);
    ensureVisible(first.anchor, first.target);
    if (pane) await settleScroll(pane, mine, place);
}

async function paintAfter(needle: string, hard: string) {
    const mine = ++gen;
    const pane = chatPane();
    let ran = false;
    const done = () => {
        if (ran || mine !== gen) return;
        ran = true;
        const el = messageById(hard);
        if (el) void land(el, needle, mine, hard);
    };
    if (pane) {
        pane.addEventListener("scrollend", done, { once: true });
        window.setTimeout(done, 700);
    } else window.setTimeout(done, 80);
}

async function jump(origin: HTMLElement | null) {
    const mine = ++gen;
    const { needle, hard } = resolveNeedle(origin);
    const skip = hostOf(origin);
    if (!prefixOf(needle) && !hard) return;
    let el: HTMLElement | null = null;
    let pinned = "";
    if (hard) {
        el = liveSource(hard, skip);
        if (!el) {
            await hydrate(conversationId());
            if (mine !== gen) return;
            el = await revealSource(hard, skip, mine);
        }
        if (el) pinned = hard;
    }
    if (!el && prefixOf(needle)) el = pickMessage([], needle, skip);
    if (mine !== gen || !el) {
        if (!el) logger.debug("no source message");
        return;
    }
    await land(el, needle, mine, pinned);
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
    for (const n of document.querySelectorAll("[data-void-qj-preview]")) n.removeAttribute("data-void-qj-preview");
}

function quoteSvg(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const d of QUOTE_PATHS) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        svg.append(path);
    }
    return svg;
}

function ensureGlyph(btn: HTMLElement) {
    if (!btn.querySelector(`.${cl("mark")}`)) {
        const mark = document.createElement("span");
        mark.className = cl("mark");
        mark.setAttribute("aria-hidden", "true");
        mark.append(quoteSvg());
        btn.prepend(mark);
    }
    for (const node of [...btn.childNodes]) {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
    }
}

function paintCount(btn: HTMLElement, n: number) {
    const cur = btn.querySelector<HTMLElement>(`.${cl("count")}`);
    if (n <= 1) {
        cur?.remove();
        return;
    }
    const text = String(n);
    let el = cur;
    if (!el) {
        el = document.createElement("span");
        el.className = cl("count");
        el.setAttribute("aria-hidden", "true");
        btn.append(el);
    }
    if (el.textContent !== text) el.textContent = text;
}

function stampPreviews() {
    const keep = new Set<HTMLElement>();
    const root = chatPane() ?? document.querySelector("main") ?? document.body;
    for (const host of root.querySelectorAll<HTMLElement>("[id^='response-']")) {
        if (host.closest(PANE_SKIP)) continue;
        const quote = norm(hostQuote(hostUuid(host), host).quoted);
        if (quote.length < 8) continue;
        for (const n of host.querySelectorAll<HTMLElement>("[class*='whitespace-pre-wrap'], [class*='items-start']")) {
            if (n.closest("a, button, [role='button']")) continue;
            if (!looksLikeQuote(n) || !textIsQuote(norm(n.textContent || ""), quote)) continue;
            let covered = false;
            for (const outer of keep) {
                if (outer.contains(n)) {
                    covered = true;
                    break;
                }
                if (n.contains(outer)) keep.delete(outer);
            }
            if (!covered) keep.add(n);
        }
    }
    for (const n of document.querySelectorAll<HTMLElement>("[data-void-qj-preview]")) {
        if (!keep.has(n)) n.removeAttribute("data-void-qj-preview");
    }
    for (const n of keep) {
        if (!n.hasAttribute("data-void-qj-preview")) n.setAttribute("data-void-qj-preview", "");
    }
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
        ensureGlyph(btn);
        paintCount(btn, cites.length);
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
    stampPreviews();
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
    const ranges = findRanges(card, cite.quoted);
    const anchor = scrollAnchor(ranges);
    const hit = hitOf(anchor) ?? card;
    ensureVisible(anchor, hit);
    highlightRange(ranges, hit);
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
    try {
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
        const origin = sent ?? chip;
        if (!origin) return;
        if (officialJumpButton(origin)) {
            const { needle, hard } = resolveNeedle(origin);
            if (hard && liveSource(hard, hostOf(origin))) {
                void paintAfter(needle, hard);
                return;
            }
        }
        e.preventDefault();
        e.stopPropagation();
        void jump(origin);
    } catch (err) {
        logger.debug("click", err);
    }
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
