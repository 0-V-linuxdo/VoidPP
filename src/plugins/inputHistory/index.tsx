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
let applyCaretMoved = false;
let applyTyped = false;
let ignoreInput = 0;
let suppressSelect = 0;

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
    return text.replaceAll(ZWSP, "").replace(/\r\n?/g, "\n");
}

function hasContent(text: string): boolean {
    return text.replace(/[\s\u00a0]/g, "") !== "";
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
    applyCaretMoved = false;
    applyTyped = false;
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

const TRAILING_BR = "ProseMirror-trailingBreak";

function blockText(block: Element): string {
    let out = "";
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent ?? "";
            return;
        }
        if (!(node instanceof Element)) return;
        if (node.tagName === "BR") {
            if (!node.classList.contains(TRAILING_BR)) out += "\n";
            return;
        }
        for (const child of node.childNodes) walk(child);
    };
    for (const child of block.childNodes) walk(child);
    return out;
}

function pmViewOf(el: HTMLElement) {
    try {
        return (el as unknown as { pmViewDesc?: { view?: {
            composing?: boolean;
            dispatch(tr: unknown): void;
            state: {
                doc: {
                    forEach(cb: (node: PmBlock) => void): void;
                    resolve?(pos: number): unknown;
                };
                schema: {
                    nodes: Record<string, { spec?: { linebreakReplacement?: boolean }; create(): PmInline }>;
                    text(text: string): PmInline;
                };
                selection: { from: number; constructor: { atStart(doc: unknown): unknown; atEnd(doc: unknown): unknown; near?(pos: unknown): unknown } };
                tr: {
                    deleteSelection(): PmTr;
                    insert(pos: number, node: PmInline): PmTr;
                    replaceSelectionWith(node: unknown): { scrollIntoView(): unknown };
                    setSelection(sel: unknown): { scrollIntoView(): unknown };
                    scrollIntoView(): unknown;
                };
            };
        } } }).pmViewDesc?.view ?? null;
    } catch {
        return null;
    }
}

type PmInline = { isText?: boolean; text?: string; type?: unknown; nodeSize: number; forEach(cb: (node: PmInline) => void): void };
type PmBlock = { forEach(cb: (node: PmInline) => void): void };
type PmTr = { insert(pos: number, node: PmInline): PmTr; scrollIntoView(): unknown; selection: { from: number } };

function serializePmDoc(doc: { forEach(cb: (node: PmBlock) => void): void }, brType: unknown): string {
    const blocks: string[] = [];
    doc.forEach(block => {
        let line = "";
        block.forEach(child => {
            if (child.isText) line += child.text ?? "";
            else if (brType && child.type === brType) line += "\n";
            else {
                child.forEach(grand => {
                    if (grand.isText) line += grand.text ?? "";
                    else if (brType && grand.type === brType) line += "\n";
                });
            }
        });
        blocks.push(line);
    });
    return blocks.join("\n");
}

function newlineCount(text: string): number {
    let n = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
}

function editorText(el: HTMLElement): string {
    try {
        const view = pmViewOf(el);
        if (view?.state?.doc) {
            const br = breakNodeType(view.state.schema.nodes);
            return normalize(serializePmDoc(view.state.doc, br));
        }
    } catch (err) {
        logger.debug("editorText pm failed:", err);
    }
    const blocks = el.querySelectorAll(":scope > *");
    const raw = blocks.length
        ? Array.from(blocks, blockText).join("\n")
        : (el.innerText ?? el.textContent ?? "");
    return normalize(raw);
}

function collapsedCaret(el: HTMLElement): Range | null {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    return el.contains(range.startContainer) ? range : null;
}

function directBlock(el: HTMLElement, node: Node): Element | null {
    let cur: Node | null = node;
    while (cur && cur.parentNode !== el) cur = cur.parentNode;
    return cur instanceof Element ? cur : null;
}

function sideText(el: HTMLElement, caret: Range, before: boolean): string {
    const range = caret.cloneRange();
    if (before) range.setStart(el, 0);
    else range.setEnd(el, el.childNodes.length);
    return range.toString();
}

function contentAround(el: HTMLElement, node: Node, before: boolean): boolean {
    const range = document.createRange();
    if (before) {
        range.setStart(el, 0);
        range.setEndBefore(node);
    } else {
        range.setStartAfter(node);
        range.setEnd(el, el.childNodes.length);
    }
    if (range.toString().replace(ZWSP, "").trim()) return true;
    return !!range.cloneContents().querySelector("br");
}

function brPast(el: HTMLElement, caret: Range, before: boolean): { hit: boolean; onlyTrailing: boolean } {
    let hit = false;
    let onlyTrailing = true;
    for (const br of el.querySelectorAll("br")) {
        const side = caret.comparePoint(br, 0);
        const onBreak = side === 0 && contentAround(el, br, before);
        const past = (before ? side < 0 : side > 0) || onBreak;
        if (!past) continue;
        hit = true;
        if (!br.classList.contains(TRAILING_BR)) onlyTrailing = false;
    }
    return { hit, onlyTrailing };
}

function breakBefore(el: HTMLElement, caret: Range): boolean {
    const blocks = el.children;
    const block = directBlock(el, caret.startContainer);
    if (blocks.length > 1 && block && block !== blocks[0]) return true;
    if (sideText(el, caret, true).includes("\n")) return true;
    const prior = brPast(el, caret, true);
    if (!prior.hit) return false;
    const first = !block || blocks.length === 0 || block === blocks[0];
    const nothingAfter = !brPast(el, caret, false).hit && !sideText(el, caret, false).replace(ZWSP, "").trim();
    if (prior.onlyTrailing && first && nothingAfter) return false;
    return true;
}

function breakAfter(el: HTMLElement, caret: Range): boolean {
    const blocks = el.children;
    const block = directBlock(el, caret.startContainer);
    if (blocks.length > 1 && block && block !== blocks[blocks.length - 1]) return true;
    if (sideText(el, caret, false).includes("\n")) return true;
    const later = brPast(el, caret, false);
    if (!later.hit || later.onlyTrailing) return false;
    return true;
}

function isPlaceholderEditor(el: HTMLElement): boolean {
    const text = (el.textContent ?? "").replaceAll(ZWSP, "").trim();
    if (text) return false;
    if (el.children.length > 1) return false;
    return el.querySelectorAll("br").length <= 1;
}

function syncPm(el: HTMLElement, range: Range) {
    try {
        const view = (el as unknown as { pmViewDesc?: { view?: {
            posAtDOM?(node: Node, offset: number): number;
            dispatch(tr: unknown): void;
            state: {
                doc: { resolve(pos: number): unknown };
                selection: { constructor: { near?(pos: unknown): unknown } };
                tr: { setSelection(sel: unknown): { scrollIntoView(): unknown } };
            };
        } } }).pmViewDesc?.view;
        if (!view?.posAtDOM) return;
        const pos = view.posAtDOM(range.startContainer, range.startOffset);
        if (typeof pos !== "number" || pos < 0) return;
        const near = view.state.selection.constructor.near;
        if (!near) return;
        const pmSel = near(view.state.doc.resolve(pos));
        if (!pmSel) return;
        view.dispatch(view.state.tr.setSelection(pmSel).scrollIntoView());
    } catch (err) {
        logger.debug("syncPm failed:", err);
    }
}

function applyRange(el: HTMLElement, range: Range) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    syncPm(el, range);
}

function stepLine(el: HTMLElement, older: boolean): boolean {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed || typeof sel.modify !== "function") return false;
    const before = sel.getRangeAt(0);
    const node = before.startContainer;
    const offset = before.startOffset;
    if (!el.contains(node)) return false;
    sel.modify("move", older ? "backward" : "forward", "line");
    if (!sel.rangeCount || !sel.isCollapsed) return true;
    const after = sel.getRangeAt(0);
    if (!el.contains(after.startContainer)) {
        const back = document.createRange();
        back.setStart(node, offset);
        back.collapse(true);
        applyRange(el, back);
        return false;
    }
    if (after.startContainer === node && after.startOffset === offset) return false;
    syncPm(el, after);
    return true;
}

function caretFromPoint(x: number, y: number): Range | null {
    const doc = document as Document & {
        caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?(x: number, y: number): Range | null;
    };
    try {
        const pos = doc.caretPositionFromPoint?.(x, y);
        if (pos?.offsetNode) {
            const range = document.createRange();
            const max = pos.offsetNode.nodeType === Node.TEXT_NODE
                ? (pos.offsetNode.textContent?.length ?? 0)
                : pos.offsetNode.childNodes.length;
            range.setStart(pos.offsetNode, Math.min(Math.max(pos.offset, 0), max));
            range.collapse(true);
            return range;
        }
    } catch { /* point missed the document */ }
    try {
        return doc.caretRangeFromPoint?.(x, y) ?? null;
    } catch {
        return null;
    }
}

function visualLineTops(el: HTMLElement): number[] {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops: number[] = [];
    for (const rect of range.getClientRects()) {
        if (rect.height < 1 && rect.width < 1) continue;
        if (!tops.some(top => Math.abs(top - rect.top) < 4)) tops.push(rect.top);
    }
    tops.sort((a, b) => a - b);
    return tops;
}

function stepSoftLine(el: HTMLElement, older: boolean): number {
    const caret = collapsedCaret(el);
    if (!caret) return 0;
    const caretRects = caret.getClientRects();
    const caretRect = caretRects[0] ?? caret.getBoundingClientRect();
    if (!caretRect.height && !caretRect.width) return 0;
    const lines = visualLineTops(el);
    if (lines.length < 2) return 0;
    let index = 0;
    let best = Infinity;
    lines.forEach((line, i) => {
        const dist = Math.abs(line - caretRect.top);
        if (dist < best) {
            best = dist;
            index = i;
        }
    });
    const next = older ? index - 1 : index + 1;
    if (next < 0 || next >= lines.length) return 0;
    const box = el.getBoundingClientRect();
    const x = Math.min(Math.max(caretRect.left + 1, box.left + 2), box.right - 2);
    const y = lines[next] + Math.max(4, caretRect.height * 0.4);
    const hit = caretFromPoint(x, y);
    if (hit && el.contains(hit.startContainer)) {
        hit.collapse(true);
        if (hit.startContainer !== caret.startContainer || hit.startOffset !== caret.startOffset) {
            applyRange(el, hit);
            return 1;
        }
    }
    return -1;
}

function nudgeCaret(el: HTMLElement, caret: Range, older: boolean): boolean {
    const blocks = Array.from(el.children);
    const block = directBlock(el, caret.startContainer);
    const range = document.createRange();
    if (block && blocks.length > 1) {
        const idx = blocks.indexOf(block);
        const dest = idx >= 0 ? blocks[older ? idx - 1 : idx + 1] : undefined;
        if (dest) {
            range.selectNodeContents(dest);
            range.collapse(!older);
            applyRange(el, range);
            return true;
        }
    }
    let target: Element | null = null;
    for (const br of el.querySelectorAll("br")) {
        if (br.classList.contains(TRAILING_BR)) continue;
        const side = caret.comparePoint(br, 0);
        if (older) {
            if (side <= 0) target = br;
        } else if (side > 0) {
            target = br;
            break;
        }
    }
    if (!target) return false;
    if (older) range.setStartBefore(target);
    else range.setStartAfter(target);
    range.collapse(true);
    if (!el.contains(range.startContainer)) return false;
    applyRange(el, range);
    return true;
}

function matchesRecall(el: HTMLElement): boolean {
    if (!recalling) return false;
    const list = getEntries();
    const expected = cursor < list.length ? list[cursor] : draft;
    const actual = editorText(el);
    if (newlineCount(actual) !== newlineCount(expected)) return false;
    if (actual === expected) return true;
    const inner = normalize(el.innerText ?? "");
    return newlineCount(inner) === newlineCount(expected) && inner === expected;
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
        const view = pmViewOf(el);
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
        const moved = applyCaretMoved;
        const typed = applyTyped;
        applyEl = null;
        applyCaretMoved = false;
        applyTyped = false;
        if (!el || composing) return;
        if (!recalling) return;
        if (typed || (!moved && !matchesRecall(el))) dropRecall(el);
        else if (!moved) placeCaret(el, applyAtStart);
    }, APPLY_QUIET_MS);
}

function breakNodeType(nodes: Record<string, { spec?: { linebreakReplacement?: boolean }; create(): unknown }>) {
    for (const name of ["hardBreak", "hard_break", "hardbreak"]) {
        if (nodes[name]) return nodes[name];
    }
    for (const type of Object.values(nodes)) {
        if (type.spec?.linebreakReplacement) return type;
    }
    return null;
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, ch => {
        if (ch === "&") return "&" + "amp;";
        if (ch === "<") return "&" + "lt;";
        if (ch === ">") return "&" + "gt;";
        return "&" + "quot;";
    });
}

function insertLinesPm(el: HTMLElement, text: string): boolean {
    const view = pmViewOf(el);
    if (!view) return false;
    const brType = breakNodeType(view.state.schema.nodes);
    if (!brType) return false;
    const lines = text.split("\n");
    const nodes: PmInline[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (i > 0) nodes.push(brType.create());
        if (lines[i]) nodes.push(view.state.schema.text(lines[i]));
    }
    if (text.endsWith("\n")) nodes.push(view.state.schema.text("\u200b"));
    try {
        let tr = view.state.tr.deleteSelection();
        let pos = tr.selection.from;
        for (const node of nodes) {
            tr = tr.insert(pos, node);
            pos += node.nodeSize;
        }
        view.dispatch(tr.scrollIntoView());
        return true;
    } catch (err) {
        logger.debug("insertLinesPm failed:", err);
        return false;
    }
}

function linesToHtml(text: string): string {
    const html = text.split("\n").map(escapeHtml).join("<br>");
    return text.endsWith("\n") ? html + "\u200b" : html;
}

function insertLinesHtml(text: string): boolean {
    try {
        return document.execCommand("insertHTML", false, linesToHtml(text));
    } catch (err) {
        logger.debug("insertLinesHtml failed:", err);
        return false;
    }
}

function insertLinesDom(text: string): boolean {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const lines = text.split("\n");
    const frag = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
        if (i) frag.appendChild(document.createElement("br"));
        if (lines[i]) frag.appendChild(document.createTextNode(lines[i]));
    }
    if (text.endsWith("\n")) frag.appendChild(document.createTextNode("\u200b"));
    range.deleteContents();
    range.insertNode(frag);
    return true;
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
    applyCaretMoved = false;
    applyTyped = false;
    const gen = ++applyGen;
    suppressSelect++;
    ignoreInput++;
    try {
        document.execCommand("delete");
        if (text && !insertLinesPm(el, text) && !insertLinesHtml(text)) insertLinesDom(text);
    } catch (err) {
        logger.debug("insertText failed:", err);
    } finally {
        ignoreInput = Math.max(0, ignoreInput - 1);
    }
    placeCaret(el, atStart);
    requestAnimationFrame(() => { suppressSelect = Math.max(0, suppressSelect - 1); });
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
    if (!value || !hasContent(value)) return;

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

function caretNav(e: KeyboardEvent): boolean {
    return e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End";
}

function atProgrammedEdge(el: HTMLElement, caret: Range, atStart: boolean): boolean {
    const probe = caret.cloneRange();
    if (atStart) probe.setStart(el, 0);
    else probe.setEnd(el, el.childNodes.length);
    if (probe.toString().replace(ZWSP, "").trim()) return false;
    for (const br of probe.cloneContents().querySelectorAll("br")) {
        if (!br.classList.contains(TRAILING_BR)) return false;
    }
    return true;
}

function onSelectionChange() {
    if (suppressSelect || !applying || applyCaretMoved) return;
    const el = applyEl;
    if (!el) return;
    const caret = collapsedCaret(el);
    if (!caret || !atProgrammedEdge(el, caret, applyAtStart)) applyCaretMoved = true;
}

function onKeyDown(e: KeyboardEvent) {
    if (imeEvent(e)) return;
    const el = chatEditor(e.target);
    if (!el) return;
    if (applying && caretNav(e) && (e.ctrlKey || e.metaKey || e.shiftKey || e.key === "Home" || e.key === "End" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        applyCaretMoved = true;
        return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        pushEntry(editorText(el));
        return;
    }
    if (e.ctrlKey || e.metaKey) return;

    const arrow = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (applying && !arrow) invalidateApply();

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

    if (!arrow || e.shiftKey) return;

    const older = e.key === "ArrowUp";
    if (!e.altKey) {
        const caret = collapsedCaret(el);
        if (!caret) {
            if (applying) applyCaretMoved = true;
            return;
        }
        if (!isPlaceholderEditor(el)) {
            if (stepLine(el, older)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (applying) applyCaretMoved = true;
                return;
            }
            const soft = stepSoftLine(el, older);
            if (soft !== 0) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (applying) applyCaretMoved = true;
                return;
            }
            const stayed = collapsedCaret(el);
            if (stayed && (older ? breakBefore(el, stayed) : breakAfter(el, stayed))) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (nudgeCaret(el, stayed, older) && applying) applyCaretMoved = true;
                return;
            }
        }
    }

    const list = getEntries();
    if (older && (!list.length || cursor <= 0)) return;
    if (!older && cursor >= list.length) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    cycle(older, el);
}

function onPointerDown(e: PointerEvent) {
    if (!recalling || !applying) return;
    if (!chatEditor(e.target)) return;
    applyCaretMoved = true;
}

function textInput(e: Event): boolean {
    if (!(e instanceof InputEvent)) return false;
    const kind = e.inputType;
    if (!kind) return false;
    return kind.startsWith("insert") || kind.startsWith("delete") || kind.startsWith("history") || kind.startsWith("format");
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
    if (ignoreInput) return;
    const el = chatEditor(e.target);
    if (!el) return;
    if (imeEvent(e)) {
        if (applying) invalidateApply();
        return;
    }
    if (applying) {
        if (textInput(e)) applyTyped = true;
        return;
    }
    if (recalling && textInput(e) && !matchesRecall(el)) dropRecall(el);
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
        document.addEventListener("selectionchange", onSelectionChange, { signal });
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
