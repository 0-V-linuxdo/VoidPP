/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Button, ButtonWithTooltip, ConfirmDialog, Flex, Input, Paragraph } from "@components";
import { CopyIcon, HistoryIcon, Trash2Icon } from "@components/icons";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { React, useState } from "@turbopack/common/react";
import { RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { clamp, copyToClipboard } from "@utils/misc";
import { pluralize } from "@utils/text";
import definePlugin, { OptionType } from "@utils/types";

const logger = new Logger("InputHistory");
const cl = classNameFactory("void-ih-");

const EDITOR_SEL = ".query-bar .tiptap.ProseMirror[contenteditable=\"true\"]";
const ZWSP = /\u200B/g;
const MAX_MIN = 10;
const MAX_MAX = 500;
const MAX_DEFAULT = 100;
const HUD_GAP_PX = 8;
const APPLY_QUIET_MS = 120;
const CAPTURE_DEDUPE_MS = 2000;

interface PrivateSettings {
    entries: string[];
    imagineEntries: string[];
}

const settings = definePluginSettings({
    maxEntries: {
        type: OptionType.SLIDER,
        description: "Maximum stored prompts.",
        min: MAX_MIN,
        max: MAX_MAX,
        default: MAX_DEFAULT,
    },
    separateImagine: {
        type: OptionType.BOOLEAN,
        description: "Store Imagine prompts in a separate history from chat.",
        default: false,
    },
    history: {
        type: OptionType.COMPONENT,
        component: HistoryPanel,
    },
}).withPrivateSettings<PrivateSettings>();

const recentAt = new Map<string, number>();

let cursor = 0;
let draft = "";
let recalling = false;
let applying = false;
let composing = false;
let applyGen = 0;
let keys: AbortController | null = null;
let applyTimer: ReturnType<typeof setTimeout> | undefined;
let applyEl: HTMLElement | null = null;
let applyAtStart = true;

function isImaginePage(): boolean {
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

function useImagineBucket(): boolean {
    return !!settings.store.separateImagine && isImaginePage();
}

function listOf(raw: unknown): string[] {
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

function getEntries(): string[] {
    return listOf(useImagineBucket() ? settings.plain.imagineEntries : settings.plain.entries);
}

function cap(entries: string[]): string[] {
    const max = clamp(settings.store.maxEntries ?? MAX_DEFAULT, MAX_MIN, MAX_MAX);
    return entries.length > max ? entries.slice(entries.length - max) : entries;
}

function setEntries(entries: string[]) {
    if (useImagineBucket()) settings.store.imagineEntries = entries;
    else settings.store.entries = entries;
}

function normalize(text: string): string {
    return text.replaceAll(ZWSP, "").replace(/\n$/, "").trim();
}

function imeEvent(e: Event): boolean {
    if (composing) return true;
    if (e instanceof InputEvent && e.isComposing) return true;
    if (e instanceof KeyboardEvent && (e.isComposing || e.keyCode === 229)) return true;
    return false;
}

function invalidateApply() {
    applyGen++;
    applying = false;
    applyEl = null;
    clearTimeout(applyTimer);
    applyTimer = undefined;
}

function resetBrowse(length: number) {
    invalidateApply();
    cursor = length;
    draft = "";
    recalling = false;
    hideHud();
}

function chatEditor(t: EventTarget | null): HTMLElement | null {
    if (t instanceof Text) return t.parentElement?.closest<HTMLElement>(EDITOR_SEL) ?? null;
    if (t instanceof Element) return t.closest<HTMLElement>(EDITOR_SEL) ?? null;
    return null;
}

function editorText(el: HTMLElement): string {
    const blocks = el.querySelectorAll(":scope > *");
    const raw = blocks.length
        ? Array.from(blocks, b => b.textContent ?? "").join("\n")
        : (el.innerText ?? el.textContent ?? "");
    return normalize(raw);
}

const EDGE_SLOP_MIN_PX = 4;

interface LineBox {
    top: number;
    bottom: number;
}

interface PmCoords {
    top: number;
    bottom: number;
}

interface PmNode {
    nodeSize: number;
    type?: { name?: string; spec?: { linebreakReplacement?: boolean } };
}

interface PmView {
    composing?: boolean;
    coordsAtPos(pos: number, side?: number): PmCoords;
    endOfTextblock?(dir: "up" | "down" | "left" | "right"): boolean;
    state: {
        doc: { childCount: number; content: { size: number } };
        selection: {
            from: number;
            empty: boolean;
            $from: {
                index(depth: number): number;
                parentOffset: number;
                parent?: { childCount: number; child(i: number): PmNode };
            };
            constructor: {
                atStart(doc: unknown): { from: number };
                atEnd(doc: unknown): { from: number };
            };
        };
    };
}

const TRAILING_BR = "ProseMirror-trailingBreak";
const BREAK_NAMES = new Set(["hardBreak", "hard_break", "hard-break"]);

function isBreakNode(node: PmNode | null | undefined): boolean {
    const name = node?.type?.name ?? "";
    return BREAK_NAMES.has(name) || !!node?.type?.spec?.linebreakReplacement;
}

// Shift+Enter in the Grok composer is a hard break inside one paragraph.
// coordsAtPos(-1) at the start of that next line still paints the previous
// line, so a top comparison calls it "first". A break before the caret
// means this is not the first visual line of the textblock.
function parentBreaks(view: PmView, before: boolean): boolean {
    try {
        const $from = view.state.selection.$from;
        const parent = $from.parent;
        if (!parent?.childCount) return false;
        const target = $from.parentOffset;
        let offset = 0;
        for (let i = 0; i < parent.childCount; i++) {
            const child = parent.child(i);
            const size = child.nodeSize ?? 1;
            if (before) {
                if (offset + size > target) break;
                if (isBreakNode(child)) return true;
            } else if (offset >= target && isBreakNode(child)) {
                return true;
            }
            offset += size;
        }
    } catch {
        /* schema probe only */
    }
    return false;
}

function domBreakBeside(el: HTMLElement, caret: Range): { before: boolean; after: boolean } {
    let before = false;
    let after = false;
    for (const br of el.querySelectorAll("br")) {
        if (br.classList.contains(TRAILING_BR)) continue;
        try {
            const side = caret.comparePoint(br, 0);
            if (side < 0) before = true;
            else if (side > 0) after = true;
        } catch {
            /* br is not in this tree */
        }
    }
    return { before, after };
}

function editorView(el: HTMLElement): PmView | null {
    try {
        const view = (el as unknown as { pmViewDesc?: { view?: PmView } }).pmViewDesc?.view;
        if (!view?.coordsAtPos || !view.state?.selection) return null;
        return view;
    } catch {
        return null;
    }
}

function lineSlop(el: HTMLElement): number {
    const { lineHeight, fontSize } = getComputedStyle(el);
    const lh = parseFloat(lineHeight);
    const fs = parseFloat(fontSize) || 16;
    // "normal" is NaN. A unitless "1.5" is not a pixel height.
    const px = Number.isFinite(lh) && lh > 8 ? lh : fs * 1.5;
    return Math.max(EDGE_SLOP_MIN_PX, px / 2);
}

function sameLine(a: number, b: number, slop: number): boolean {
    return Math.abs(a - b) <= slop;
}

function finiteBox(top: number, bottom: number): LineBox | null {
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom - top <= 0) return null;
    return { top, bottom };
}

function rangeBox(range: Range): LineBox | null {
    const rects = range.getClientRects();
    let top = Infinity;
    let bottom = -Infinity;
    for (const r of rects) {
        if (r.height <= 0) continue;
        if (r.top < top) top = r.top;
        if (r.bottom > bottom) bottom = r.bottom;
    }
    if (top !== Infinity) return { top, bottom };
    const bounds = range.getBoundingClientRect();
    return bounds.height > 0 ? { top: bounds.top, bottom: bounds.bottom } : null;
}

function textCharBox(node: Node, offset: number, bias: -1 | 1): LineBox | null {
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const len = node.textContent?.length ?? 0;
    const range = document.createRange();
    try {
        if (bias > 0 && offset < len) {
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
        } else if (bias < 0 && offset > 0) {
            range.setStart(node, offset - 1);
            range.setEnd(node, offset);
        } else {
            return null;
        }
        return rangeBox(range);
    } catch {
        return null;
    }
}

function blockOf(el: HTMLElement, node: Node): Element | null {
    let cur: Node | null = node;
    while (cur && cur.parentNode !== el) cur = cur.parentNode;
    return cur instanceof Element ? cur : null;
}

function domCaretBox(range: Range, slop: number): { box: LineBox; ambiguous: boolean } | null {
    const before = textCharBox(range.startContainer, range.startOffset, -1);
    const after = textCharBox(range.startContainer, range.startOffset, 1);
    if (before && after && !sameLine(before.top, after.top, slop)) {
        const collapsed = rangeBox(range);
        if (collapsed) {
            const pick = Math.abs(collapsed.top - before.top) <= Math.abs(collapsed.top - after.top) ? before : after;
            return { box: pick, ambiguous: false };
        }
        // Soft-wrap boundary and no painted caret. Do not call this the first line.
        return { box: after, ambiguous: true };
    }
    const box = after ?? before ?? rangeBox(range);
    return box ? { box, ambiguous: false } : null;
}

function blockLineBox(block: Element, edge: "start" | "end"): LineBox | null {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    let node = walker.nextNode();
    while (node) {
        if ((node.textContent ?? "").replace(ZWSP, "").length) texts.push(node as Text);
        node = walker.nextNode();
    }
    const text = edge === "start" ? texts[0] : texts[texts.length - 1];
    if (text) {
        const raw = text.textContent ?? "";
        if (edge === "start") {
            const offset = raw.search(/[^\u200B]/);
            if (offset >= 0) {
                const box = textCharBox(text, offset, 1);
                if (box) return box;
            }
        } else {
            let offset = raw.length;
            while (offset > 0 && raw[offset - 1] === "\u200B") offset--;
            const box = textCharBox(text, offset, -1);
            if (box) return box;
        }
    }
    const brs = block.querySelectorAll("br");
    const br = edge === "start" ? brs[0] : brs[brs.length - 1];
    if (!br) return null;
    const range = document.createRange();
    range.selectNode(br);
    return rangeBox(range);
}

function domLineEdge(el: HTMLElement, caret: Range, slop: number): { first: boolean; last: boolean } {
    const blocks = Array.from(el.children);
    const block = blockOf(el, caret.startContainer);
    const inFirst = blocks.length === 0 || block == null || block === blocks[0];
    const inLast = blocks.length === 0 || block == null || block === blocks[blocks.length - 1];
    if (!inFirst && !inLast) return { first: false, last: false };

    const caretBox = domCaretBox(caret, slop);
    const start = blockLineBox((blocks[0] instanceof Element ? blocks[0] : el), "start");
    const end = blockLineBox((blocks[blocks.length - 1] instanceof Element ? blocks[blocks.length - 1] : el), "end");
    if (!caretBox || !start) return { first: false, last: false };

    return {
        first: inFirst && !caretBox.ambiguous && sameLine(caretBox.box.top, start.top, slop),
        last: inLast && !caretBox.ambiguous && !!end && sameLine(caretBox.box.bottom, end.bottom, slop),
    };
}

function coordSamples(view: PmView, pos: number): LineBox[] {
    const out: LineBox[] = [];
    for (const side of [-1, 1] as const) {
        try {
            const c = view.coordsAtPos(pos, side);
            const box = finiteBox(c?.top, c?.bottom);
            if (box) out.push(box);
        } catch {
            /* one side is out of range at the doc edge */
        }
    }
    if (out.length) return out;
    try {
        const c = view.coordsAtPos(pos);
        const box = finiteBox(c?.top, c?.bottom);
        return box ? [box] : [];
    } catch {
        return [];
    }
}

function pickSide(samples: LineBox[], domTop: number | null, slop: number): { box: LineBox; ambiguous: boolean } | null {
    if (!samples.length) return null;
    if (samples.length === 1 || sameLine(samples[0].top, samples[1].top, slop)) {
        return { box: samples[0], ambiguous: false };
    }
    if (domTop == null) return { box: samples[1], ambiguous: true };
    const pick = Math.abs(samples[0].top - domTop) <= Math.abs(samples[1].top - domTop) ? samples[0] : samples[1];
    return { box: pick, ambiguous: false };
}

// Whole-editor visual line. A later block is never the first line.
// Soft wraps compare both coordsAtPos sides to the caret. Do not measure
// the height of everything before the caret — that calls line 2's start "first".
function pmLineEdge(el: HTMLElement, caret: Range, slop: number): { first: boolean; last: boolean } | null {
    const view = editorView(el);
    if (!view || view.composing) return null;
    const sel = view.state.selection;
    if (!sel.empty) return { first: false, last: false };

    let index = 0;
    let childCount = 1;
    try {
        index = sel.$from.index(0);
        childCount = view.state.doc.childCount;
    } catch {
        return null;
    }
    if (childCount < 1) return { first: true, last: true };

    const inFirst = index === 0;
    const inLast = index === childCount - 1;
    if (!inFirst && !inLast) return { first: false, last: false };

    let startPos = 1;
    let endPos = Math.max(1, view.state.doc.content.size - 1);
    try {
        startPos = sel.constructor.atStart(view.state.doc).from;
        endPos = sel.constructor.atEnd(view.state.doc).from;
    } catch {
        /* a single paragraph still has the defaults */
    }

    const dom = domCaretBox(caret, slop);
    const caretSide = pickSide(coordSamples(view, sel.from), dom?.ambiguous ? null : (dom?.box.top ?? null), slop);
    const startSamples = coordSamples(view, startPos);
    const endSamples = coordSamples(view, endPos);
    const startTop = startSamples.length ? Math.min(...startSamples.map(box => box.top)) : null;
    const endBottom = endSamples.length ? Math.max(...endSamples.map(box => box.bottom)) : null;

    let upBlocked = false;
    let downBlocked = false;
    let hasTextblockApi = false;
    try {
        // Visual edge of this textblock only. Never enough on its own —
        // endOfTextblock also uses coordsAtPos(+1) and can stay true at a
        // hard-break line start. Break-before is the veto for that case.
        if (view.endOfTextblock) {
            hasTextblockApi = true;
            upBlocked = view.endOfTextblock("up");
            downBlocked = view.endOfTextblock("down");
        }
    } catch {
        /* coords still decide */
    }

    const coordsFirst = !!caretSide && startTop != null
        && !caretSide.ambiguous && sameLine(caretSide.box.top, startTop, slop);
    const coordsLast = !!caretSide && endBottom != null
        && !caretSide.ambiguous && sameLine(caretSide.box.bottom, endBottom, slop);
    const visualFirst = hasTextblockApi ? upBlocked : coordsFirst;
    const visualLast = hasTextblockApi ? downBlocked : coordsLast;

    return {
        first: inFirst && !parentBreaks(view, true) && visualFirst,
        last: inLast && !parentBreaks(view, false) && visualLast,
    };
}

function domVisualVeto(el: HTMLElement, caret: Range, slop: number): { notFirst: boolean; notLast: boolean } {
    const dom = domCaretBox(caret, slop);
    if (!dom || dom.ambiguous) return { notFirst: false, notLast: false };
    const blocks = Array.from(el.children);
    const start = blockLineBox((blocks[0] instanceof Element ? blocks[0] : el), "start");
    const end = blockLineBox((blocks[blocks.length - 1] instanceof Element ? blocks[blocks.length - 1] : el), "end");
    return {
        notFirst: !!start && dom.box.top > start.top + slop,
        notLast: !!end && dom.box.top + slop < end.top,
    };
}

function caretOnEdge(el: HTMLElement): { first: boolean; last: boolean } {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return { first: false, last: false };
    const caret = sel.getRangeAt(0);
    if (!el.contains(caret.startContainer)) return { first: false, last: false };
    if (!el.innerText?.trim()) return { first: true, last: true };

    const slop = lineSlop(el);
    const edge = pmLineEdge(el, caret, slop) ?? domLineEdge(el, caret, slop);
    const br = domBreakBeside(el, caret);
    const visual = domVisualVeto(el, caret, slop);
    return {
        first: edge.first && !br.before && !visual.notFirst,
        last: edge.last && !br.after && !visual.notLast,
    };
}

function matchesRecall(el: HTMLElement): boolean {
    if (!recalling) return false;
    const list = getEntries();
    const expected = cursor < list.length ? list[cursor] : draft;
    return editorText(el) === expected || normalize(el.innerText ?? "") === expected;
}

function dropRecall(el: HTMLElement) {
    invalidateApply();
    cursor = getEntries().length;
    draft = editorText(el);
    recalling = false;
    hideHud();
}

function placeCaret(el: HTMLElement, atStart: boolean) {
    if (composing) return;
    try {
        const view = (el as unknown as { pmViewDesc?: { view?: {
            composing?: boolean;
            state: {
                doc: unknown;
                selection: { constructor: { atStart(doc: unknown): unknown; atEnd(doc: unknown): unknown } };
                tr: { setSelection(sel: unknown): { scrollIntoView(): unknown } };
            };
            dispatch(tr: unknown): void;
        } } }).pmViewDesc?.view;
        if (view) {
            if (view.composing) return;
            const Sel = view.state.selection.constructor;
            const pmSel = atStart ? Sel.atStart(view.state.doc) : Sel.atEnd(view.state.doc);
            view.dispatch(view.state.tr.setSelection(pmSel).scrollIntoView());
            return;
        }
    } catch (err) {
        logger.debug("placeCaret pm failed:", err);
    }
    const native = window.getSelection();
    if (!native) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(atStart);
    native.removeAllRanges();
    native.addRange(range);
}

function scheduleApplyEnd(gen: number) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
        if (gen !== applyGen) return;
        applying = false;
        const el = applyEl;
        applyEl = null;
        if (!el || composing) return;
        if (!recalling) return;
        if (!matchesRecall(el)) dropRecall(el);
        else placeCaret(el, applyAtStart);
    }, APPLY_QUIET_MS);
}

function setEditorText(el: HTMLElement, text: string, atStart: boolean) {
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    applying = true;
    applyEl = el;
    applyAtStart = atStart;
    const gen = ++applyGen;
    try {
        if (!text) document.execCommand("delete");
        else document.execCommand("insertText", false, text);
    } catch (err) {
        logger.debug("insertText failed:", err);
    }
    placeCaret(el, atStart);
    scheduleApplyEnd(gen);
}

function hudEl(): HTMLElement {
    let el = document.querySelector<HTMLElement>(`.${cl("hud")}`);
    if (el) return el;
    el = document.createElement("div");
    el.className = cl("hud");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    return el;
}

function hideHud() {
    document.querySelector(`.${cl("hud")}`)?.classList.remove(cl("hud-on"));
}

function showHud(label: string, editor: HTMLElement) {
    const bar = editor.closest(".query-bar");
    if (!bar) return;
    const el = hudEl();
    el.textContent = label;
    requestAnimationFrame(() => {
        const r = bar.getBoundingClientRect();
        el.style.left = `${r.left + r.width / 2}px`;
        el.style.top = `${r.top - HUD_GAP_PX}px`;
        el.classList.add(cl("hud-on"));
    });
}

function pushEntry(text: string) {
    const value = normalize(text);
    if (!value) return;

    const now = Date.now();
    const prev = recentAt.get(value);
    if (prev != null && now - prev < CAPTURE_DEDUPE_MS) return;
    recentAt.set(value, now);

    const list = getEntries();
    if (list[list.length - 1] === value) {
        resetBrowse(list.length);
        return;
    }
    const next = cap([...list, value]);
    setEntries(next);
    resetBrowse(next.length);
}

function cycle(older: boolean, el: HTMLElement) {
    const list = getEntries();
    if (!list.length && older) return;
    if (cursor >= list.length) {
        draft = editorText(el);
        cursor = list.length;
    }
    const next = older ? cursor - 1 : cursor + 1;
    if (next < 0 || next > list.length) return;
    cursor = next;
    recalling = true;
    setEditorText(el, next === list.length ? draft : list[next], older);
    if (next < list.length) showHud(`${next + 1} / ${list.length}`, el);
    else hideHud();
}

function onKeyDown(e: KeyboardEvent) {
    if (imeEvent(e)) return;
    if (e.ctrlKey || e.metaKey) return;

    const el = chatEditor(e.target);
    if (!el) return;

    if (applying && e.key !== "ArrowUp" && e.key !== "ArrowDown") invalidateApply();

    if (e.key === "Escape" && recalling && !e.altKey && !e.shiftKey) {
        dropRecall(el);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
        pushEntry(editorText(el));
        return;
    }

    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (e.shiftKey) return;

    const older = e.key === "ArrowUp";
    const force = e.altKey;
    const list = getEntries();
    if (!force) {
        const edge = caretOnEdge(el);
        if ((older && !edge.first) || (!older && !edge.last)) return;
    }

    if (older && (!list.length || cursor <= 0)) return;
    if (!older && cursor >= list.length) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    cycle(older, el);
}

function onPointerDown(e: PointerEvent) {
    if (!recalling) return;
    const el = chatEditor(e.target);
    if (!el) return;
    dropRecall(el);
}

function onCompositionStart(e: Event) {
    if (!chatEditor(e.target)) return;
    composing = true;
    invalidateApply();
}

function onCompositionEnd(e: Event) {
    const el = chatEditor(e.target);
    if (!el) return;
    composing = false;
    if (recalling && !matchesRecall(el)) dropRecall(el);
}

function onInput(e: Event) {
    const el = chatEditor(e.target);
    if (!el) return;
    if (imeEvent(e)) {
        if (applying) invalidateApply();
        return;
    }
    const recalled = matchesRecall(el);
    if (applying && recalled) return;
    if (recalling && !recalled) dropRecall(el);
}

function onSubmit(e: Event) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const editor = form.querySelector(EDITOR_SEL);
    if (editor instanceof HTMLElement) pushEntry(editorText(editor));
}

function onClick(e: MouseEvent) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const ctrl = t.closest("button, [role='button']");
    if (!ctrl) return;
    const bar = ctrl.closest(".query-bar");
    if (!bar || ctrl.closest("[data-query-bar-mode-select]") || ctrl.closest("[role='radiogroup']")) return;
    const label = (ctrl.getAttribute("aria-label") ?? "").toLowerCase();
    const submit = ctrl instanceof HTMLButtonElement && ctrl.type === "submit";
    if (!submit && !label.includes("send") && !label.includes("submit")) return;
    const editor = bar.querySelector(EDITOR_SEL);
    if (editor instanceof HTMLElement) pushEntry(editorText(editor));
}

function removeEntry(index: number, imagine: boolean) {
    const list = listOf(imagine ? settings.plain.imagineEntries : settings.plain.entries);
    if (index < 0 || index >= list.length) return;
    const next = list.filter((_, i) => i !== index);
    if (imagine) settings.store.imagineEntries = next;
    else settings.store.entries = next;
    if (imagine === useImagineBucket()) resetBrowse(next.length);
}

function HistoryPanel() {
    const { entries, imagineEntries, separateImagine } = settings.use(["entries", "imagineEntries", "separateImagine"]);
    const [bucket, setBucket] = useState<"chat" | "imagine">("chat");
    const imagine = !!separateImagine && bucket === "imagine";
    const list = imagine ? (imagineEntries ?? []) : (entries ?? []);
    const [query, setQuery] = useState("");
    const [openId, setOpenId] = useState<number | null>(null);
    const [confirm, setConfirm] = useState(false);
    const needle = query.trim().toLowerCase();
    const visible = list
        .map((text, index) => ({ text, index }))
        .filter(row => !needle || row.text.toLowerCase().includes(needle))
        .toReversed();

    return (
        <Flex flexDirection="column" gap="0.5rem" className={cl("panel")}>
            <Flex flexDirection="column" gap="0.35rem" className={cl("toolbar")}>
                {!!separateImagine && (
                    <Flex alignItems="center" gap="0.5rem">
                        <Button variant={bucket === "chat" ? "primary" : "secondary"} size="sm" shape="pill" onClick={() => setBucket("chat")}>
                            Chat
                        </Button>
                        <Button variant={bucket === "imagine" ? "primary" : "secondary"} size="sm" shape="pill" onClick={() => setBucket("imagine")}>
                            Imagine
                        </Button>
                    </Flex>
                )}
                {list.length > 0 && (
                    <Input
                        type="text"
                        placeholder="Search prompts"
                        value={query}
                        onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
                        className={cl("search")}
                    />
                )}
                <Flex className={cl("meta")} alignItems="center" gap="0.5rem">
                    <Paragraph className={cl("count")}>
                        {needle
                            ? pluralize(visible.length, "match", "matches")
                            : pluralize(list.length, "stored prompt")}
                    </Paragraph>
                    <Button variant="secondary" size="sm" shape="rectangle" disabled={!list.length} onClick={() => setConfirm(true)}>
                        Clear history
                    </Button>
                </Flex>
            </Flex>
            {list.length === 0 && <Paragraph className={cl("empty")}>No stored prompts.</Paragraph>}
            {list.length > 0 && visible.length === 0 && <Paragraph className={cl("empty")}>No matches.</Paragraph>}
            {visible.length > 0 && (
                <div className={cl("list")}>
                    {visible.map(row => {
                        const expanded = openId === row.index;
                        return (
                            <div key={row.index} className={cl("item", expanded && "item-on")}>
                                <span className={cl("index")}>{row.index + 1}</span>
                                <div
                                    className={cl("main")}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setOpenId(expanded ? null : row.index)}
                                    onKeyDown={e => {
                                        if (e.key !== "Enter" && e.key !== " ") return;
                                        e.preventDefault();
                                        setOpenId(expanded ? null : row.index);
                                    }}
                                >
                                    <span className={cl("body", !expanded && "clamp")}>{row.text}</span>
                                </div>
                                <div className={cl("actions")}>
                                    <ButtonWithTooltip
                                        variant="tertiary"
                                        size="sm"
                                        shape="square"
                                        tooltipContent="Copy"
                                        aria-label="Copy"
                                        onClick={() => { copyToClipboard(row.text).catch(err => logger.error("copy failed:", err)); }}
                                    >
                                        <CopyIcon size={16} />
                                    </ButtonWithTooltip>
                                    <ButtonWithTooltip
                                        variant="tertiary"
                                        size="sm"
                                        shape="square"
                                        tooltipContent="Delete"
                                        aria-label="Delete"
                                        onClick={() => {
                                            if (openId === row.index) setOpenId(null);
                                            removeEntry(row.index, imagine);
                                        }}
                                    >
                                        <Trash2Icon size={16} />
                                    </ButtonWithTooltip>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <ConfirmDialog
                open={confirm}
                onOpenChange={setConfirm}
                title={imagine ? "Clear Imagine history" : "Clear input history"}
                description="Delete all stored prompts in this list? This cannot be undone."
                confirmText="Clear"
                danger
                onConfirm={() => {
                    if (imagine) settings.store.imagineEntries = [];
                    else settings.store.entries = [];
                    if (imagine === useImagineBucket()) resetBrowse(0);
                    setOpenId(null);
                    setQuery("");
                }}
            />
        </Flex>
    );
}

export default definePlugin({
    name: "InputHistory",
    icon: HistoryIcon,
    description: "Recall previous chat prompts with Arrow Up and Arrow Down, like a shell. Optional separate Imagine history.",
    authors: [Devs.p],
    tags: ["chat"],
    enabledByDefault: true,
    settings,
    managedStyle: "inputHistory",
    cleanupSelectors: [".void-ih-hud"],

    start() {
        if (keys) return;
        cursor = getEntries().length;
        recalling = false;
        composing = false;
        invalidateApply();
        keys = new AbortController();
        const { signal } = keys;
        document.addEventListener("keydown", onKeyDown, { capture: true, signal });
        document.addEventListener("input", onInput, { capture: true, signal });
        document.addEventListener("compositionstart", onCompositionStart, { capture: true, signal });
        document.addEventListener("compositionend", onCompositionEnd, { capture: true, signal });
        document.addEventListener("submit", onSubmit, { capture: true, signal });
        document.addEventListener("click", onClick, { capture: true, signal });
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
    },

    stop() {
        keys?.abort();
        keys = null;
        hideHud();
        recentAt.clear();
        composing = false;
        recalling = false;
        invalidateApply();
    },

    onSettingsChange() {
        const current = getEntries();
        const next = cap(current);
        if (next.length !== current.length) setEntries(next);
        if (cursor > next.length) cursor = next.length;
        const imagine = listOf(settings.plain.imagineEntries);
        const imagineNext = cap(imagine);
        if (imagineNext.length !== imagine.length) settings.store.imagineEntries = imagineNext;
    },

    zustand: {
        RoutingStore: {
            selector: (s: RoutingStoreState) => String(s.route?.page ?? ""),
            handler() {
                resetBrowse(getEntries().length);
            },
        },
    },
});
