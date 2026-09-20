/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { VoidPPEventMap } from "@api/Events";
import { definePluginSettings } from "@api/Settings";
import { ScrollTextIcon } from "@components/icons";
import type { ChatPageStoreState, GrokResponse, ResponseStoreState } from "@grok-types";
import { ChatPageStore, ResponseStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { debounce } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const logger = new Logger("BetterNavigator");
const cl = classNameFactory("void-bn-");
const MSG_SEL = "[data-testid='user-message'], [data-testid='assistant-message']";
const ASST_SEL = "[data-testid='assistant-message']";
const TICK_SEL = "button[aria-label^='Go to response ']";
const PREV_SEL = "button[aria-label='Navigate to previous message']";
const NEXT_SEL = "button[aria-label='Navigate to next message']";
const PANE_SKIP = "[data-sidebar], [class*='pane-card']";
const STRIP_SEL = [
    "button", "svg", "nav", "time", ".void-timestamp", "[class*='timestamp']",
    "details", "[data-testid*='think']", "[class*='thinking']", "[class*='Thought']",
    "[aria-label*='Thought']", "[role='toolbar']",
].join(",");
const THINK_SEL = "details, [data-testid*='think'], [class*='thinking'], [class*='Thought'], [aria-label*='Thought']";
const STOP_SEL = 'button[aria-label="Stop model response"], button[aria-label*="Stop"], button[aria-label*="停止"]';
const MEDIA_SEL = "img, picture, video, canvas";
const FILE_SEL = "a[download], [data-testid*='file'], [class*='attachment']";
const DECORATIVE_SRC = /shields\.io|iconify\.design|badgen\.net|favicon|api\.iconify/i;
const GROK_ASSET = /assets\.grok\.com/i;
const NOISE_TEXT = /^(copy|share|retry|edit|more|thinking|analyzing|searching|thoughts?)$/i;
const USER_INTERRUPT = /interrupted by the user|user[- ]interrupt|aborted by the user|cancelled by the user|canceled by the user|请求被用户中断|被用户打断/i;
const LIVE = new Set(["streaming", "optimistic", "reconnecting", "in_progress", "in-progress"]);
const DEAD = new Set(["closed", "error", "done", "completed", "complete", "cancelled", "canceled", "aborted", "idle", "success", "worked", "failed", "interrupted", "stopped", "stream-error", "send-error"]);
const HIDE_CLASS = "void-bn-hidetip";
const LIVE_LABEL = "正在输出…";
const SUMMARY_MAX = 60;
const FLASH_MS = 2000;
const FLASH_REDUCED_MS = 1000;
const THRESHOLD = 0.4;
const OFFSET_PX = 72;
const LOCK_MS = 1000;
const LOCK_FAST_MS = 280;
const FAR_VIEWPORTS = 2.5;
const DENSE_N = 16;
const SLOT_CLASS = "void-bn-rail";

const settings = definePluginSettings({
    showAssistant: {
        type: OptionType.BOOLEAN,
        description: "List assistant replies in the navigator, not only your messages.",
        default: true,
    },
    hideNativeHover: {
        type: OptionType.BOOLEAN,
        description: "Hide Grok's single-message hover preview on the native ticks.",
        default: true,
    },
    jumpEffect: {
        type: OptionType.SELECT,
        description: "Highlight the message after jumping to it.",
        options: [
            { label: "Highlight border", value: "border", default: true },
            { label: "None", value: "none" },
        ],
    },
});

type Role = "user" | "assistant";

interface NavItem {
    el: HTMLElement;
    role: Role;
    text: string;
    live?: boolean;
}

let ac: AbortController | null = null;
let paneMo: MutationObserver | null = null;
let mainMo: MutationObserver | null = null;
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;
let host: HTMLElement | null = null;
let rail: HTMLElement | null = null;
let frameTouched: HTMLElement | null = null;
let framePrevPos = "";
let paintedKey = "";
let lastPath = "";
let lastNav: NavItem[] = [];
let flashTimer = 0;
let flashing: HTMLElement | null = null;
let raf = 0;
let activeIdx = 0;
let lockIdx = -1;
let lockUntil = 0;
let overMenu = false;
let observedPane: HTMLElement | null = null;

function isVisible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function scrolls(el: HTMLElement): boolean {
    const oy = getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll";
}

function reduceMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    if (t.closest(".query-bar, [contenteditable='true']")) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function chatPath(): string {
    return `${location.pathname}${location.search}`;
}

function nativeTicks(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>(TICK_SEL)].filter(isVisible);
}

function nativeSlot(): HTMLElement | null {
    const tick = document.querySelector<HTMLElement>(TICK_SEL);
    const prev = document.querySelector<HTMLElement>(PREV_SEL);
    const next = document.querySelector<HTMLElement>(NEXT_SEL);
    const start = tick ?? prev ?? next;
    const slot = start?.closest<HTMLElement>(".absolute") ?? null;
    if (!slot || !isVisible(slot)) return null;
    return slot;
}

function chatPane(): HTMLElement | null {
    const main = document.querySelector("main");
    if (!main) return null;
    const skip = (n: HTMLElement) => !!n.closest(PANE_SKIP);
    const msg = main.querySelector<HTMLElement>(MSG_SEL);
    if (msg) {
        const col = msg.closest<HTMLElement>("[class*='overflow-y-auto'], [class*='overflow-auto']");
        if (col && !skip(col)) return col;
    }
    let best: HTMLElement | null = null;
    let bestScore = 0;
    for (const n of main.querySelectorAll<HTMLElement>("[class*='overflow-y-auto'], [class*='overflow-auto']")) {
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

function chatColumn(): HTMLElement | null {
    const slot = nativeSlot();
    const slotParent = slot?.parentElement;
    if (slotParent && !scrolls(slotParent)) return slotParent;

    const pane = chatPane();
    if (!pane) return null;
    for (let n: HTMLElement | null = pane; n && n !== document.body; n = n.parentElement) {
        if (n.className.includes("@container/chat")) return n;
    }
    for (let n: HTMLElement | null = pane.parentElement; n && n !== document.body; n = n.parentElement) {
        if (scrolls(n)) continue;
        const r = n.getBoundingClientRect();
        if (r.height >= 240 && r.width >= 240) return n;
    }
    return pane.parentElement;
}

function composerTop(): number {
    const bar = document.querySelector(".query-bar");
    if (!(bar instanceof HTMLElement) || !isVisible(bar)) return window.innerHeight;
    return bar.getBoundingClientRect().top;
}

function isDecorativeMedia(node: Element): boolean {
    if (node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement) return false;
    const img = node instanceof HTMLImageElement ? node : node.querySelector("img");
    if (!img) return true;
    const src = img.getAttribute("src") || img.getAttribute("srcset") || "";
    if (GROK_ASSET.test(src) || img.closest(FILE_SEL)) return false;
    if (DECORATIVE_SRC.test(src)) return true;
    const w = Number(img.getAttribute("width")) || 0;
    const h = Number(img.getAttribute("height")) || 0;
    return (w > 0 && w <= 48) || (h > 0 && h <= 48);
}

function hasMedia(root: HTMLElement): "image" | "file" | "" {
    if (root.querySelector(FILE_SEL)) return "file";
    for (const node of root.querySelectorAll(MEDIA_SEL)) {
        if (isDecorativeMedia(node)) continue;
        return "image";
    }
    return "";
}

function summarize(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(STRIP_SEL).forEach(n => n.remove());
    const media = hasMedia(clone);
    clone.querySelectorAll(MEDIA_SEL).forEach(n => n.remove());
    const text = (clone.textContent ?? "").replaceAll(/\s+/g, " ").trim();
    if (NOISE_TEXT.test(text)) return "";
    if (!text) {
        if (media === "image") return "图片";
        if (media === "file") return "附件";
        return "";
    }
    return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

function errorBlob(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);
    const rec = value as Record<string, any>;
    return [rec.message, rec.code, rec.type, rec.name].filter(Boolean).map(String).join(" ");
}

function isUserInterrupt(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    const state = (r.state ?? "").trim().toLowerCase();
    if (state === "interrupted" || state === "stopped") return true;
    return USER_INTERRUPT.test(errorBlob(r.error)) || USER_INTERRUPT.test(String(r.message ?? ""));
}

function isDeadResponse(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    if (isUserInterrupt(r)) return true;
    const state = (r.state ?? "").trim().toLowerCase();
    return DEAD.has(state) || (r.error != null && !LIVE.has(state));
}

function storeLive(): boolean | null {
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        if (!page.streamedMessageId && !page.showStreamingIndicator) return false;
        const streamed = ResponseStore.useResponseStore.getState().byId[page.streamedMessageId ?? ""];
        if (isDeadResponse(streamed)) return false;
        return true;
    } catch (e) {
        logger.debug("stream stores unavailable:", e);
        return null;
    }
}

function stopVisible(): boolean {
    for (const el of document.querySelectorAll<HTMLElement>(STOP_SEL)) {
        if (isVisible(el)) return true;
    }
    return false;
}

function liveAssistantEl(): HTMLElement | null {
    const root = chatPane() ?? document;
    const last = [...root.querySelectorAll<HTMLElement>(ASST_SEL)].findLast(el => document.body.contains(el));
    if (!last) return null;
    if (USER_INTERRUPT.test(last.textContent ?? "")) return null;
    const live = storeLive();
    if (live) return last;
    if (live == null && (stopVisible() || last.querySelector(THINK_SEL))) return last;
    return null;
}

function collect(): NavItem[] {
    const root = chatPane() ?? document;
    const showAsst = settings.store.showAssistant;
    const liveEl = showAsst ? liveAssistantEl() : null;
    const out: NavItem[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(MSG_SEL)) {
        if (!document.body.contains(el)) continue;
        const role: Role = el.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
        if (!showAsst && role === "assistant") continue;
        const live = el === liveEl;
        const text = summarize(el) || (live ? LIVE_LABEL : "");
        if (!text) continue;
        out.push({ el, role, text, live });
    }
    return out;
}

function structKey(mode: string, nav: NavItem[]): string {
    return `${chatPath()}:${mode}:${nav.length}:${nav.map(n => n.role).join("")}`;
}

function sameEls(nav: NavItem[]): boolean {
    return nav.length === lastNav.length && nav.every((n, i) => n.el === lastNav[i]?.el && n.role === lastNav[i]?.role);
}

function responseIdxs(): number[] {
    const out: number[] = [];
    for (let i = 0; i < lastNav.length; i++) {
        if (lastNav[i].role === "assistant") out.push(i);
    }
    return out;
}

function responseOrdinal(index: number): number {
    let k = 0;
    for (let i = 0; i <= index && i < lastNav.length; i++) {
        if (lastNav[i].role === "assistant") k++;
    }
    return k;
}

function labelOrdinal(btn: HTMLButtonElement): number | null {
    const m = btn.getAttribute("aria-label")?.match(/Go to response (\d+)/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function metaLabel(index: number): string {
    const n = lastNav.length;
    const pos = `${Math.min(Math.max(index, 0) + 1, Math.max(n, 1))} / ${n}`;
    if (!settings.store.showAssistant || !n) return pos;
    const asstN = responseIdxs().length;
    if (!asstN || asstN === n) return pos;
    const item = lastNav[index];
    if (item?.role !== "assistant") return pos;
    let k = 0;
    for (let i = 0; i <= index; i++) if (lastNav[i].role === "assistant") k++;
    return `${pos} · ${k} / ${asstN}`;
}

function clearFlash() {
    if (flashTimer) window.clearTimeout(flashTimer);
    flashTimer = 0;
    flashing?.classList.remove("void-bn-flash");
    flashing = null;
}

function flash(el: HTMLElement) {
    clearFlash();
    if (settings.store.jumpEffect !== "border") return;
    flashing = el;
    el.classList.add("void-bn-flash");
    flashTimer = window.setTimeout(clearFlash, reduceMotion() ? FLASH_REDUCED_MS : FLASH_MS);
}

function nativeTickFor(item: NavItem, index: number, ticks?: HTMLButtonElement[]): HTMLButtonElement | undefined {
    if (item.role !== "assistant") return;
    const list = ticks?.length ? ticks : nativeTicks();
    if (!list.length) return;
    const k = responseOrdinal(index);
    const hit = list.find(t => labelOrdinal(t) === k);
    return hit ?? list[k - 1];
}

function navIndexFromTick(tick: HTMLButtonElement, tickIndex: number): number {
    const n = labelOrdinal(tick);
    if (n != null) {
        let seen = 0;
        for (let i = 0; i < lastNav.length; i++) {
            if (lastNav[i].role !== "assistant") continue;
            seen++;
            if (seen === n) return i;
        }
    }
    let seen = 0;
    for (let i = 0; i < lastNav.length; i++) {
        if (lastNav[i].role !== "assistant") continue;
        if (seen === tickIndex) return i;
        seen++;
    }
    return Math.min(tickIndex, Math.max(0, lastNav.length - 1));
}

function isFar(el: HTMLElement): boolean {
    const pane = chatPane();
    const vh = pane?.clientHeight ?? window.innerHeight;
    const top = pane?.getBoundingClientRect().top ?? 0;
    return Math.abs(el.getBoundingClientRect().top - top) > vh * FAR_VIEWPORTS;
}

function scrollToItem(el: HTMLElement, behavior: ScrollBehavior) {
    el.style.scrollMarginTop = `${OFFSET_PX}px`;
    const pane = chatPane();
    if (pane && pane.contains(el)) {
        const pr = pane.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        pane.scrollTo({ top: pane.scrollTop + (er.top - pr.top) - OFFSET_PX, behavior });
        return;
    }
    el.scrollIntoView({ behavior, block: "start" });
}

function jump(item: NavItem, index: number) {
    const instant = isFar(item.el) || reduceMotion();
    lockIdx = index;
    lockUntil = performance.now() + (instant ? LOCK_FAST_MS : LOCK_MS);
    applyActive(index);
    scrollToItem(item.el, instant ? "auto" : "smooth");
    window.setTimeout(() => flash(item.el), 180);
}

function stepItem(dir: -1 | 1): boolean {
    const next = activeIdx + dir;
    if (next < 0 || next >= lastNav.length) return false;
    jump(lastNav[next], next);
    alignMenu(next);
    return true;
}

function markAim(index: number) {
    host?.querySelectorAll(".void-bn-item").forEach(node => {
        node.classList.toggle("void-bn-aim", Number((node as HTMLElement).dataset.voidBnI) === index);
    });
}

function applyActive(index: number) {
    activeIdx = index;
    host?.querySelectorAll(".void-bn-item").forEach(node => {
        node.classList.toggle("void-bn-active", Number((node as HTMLElement).dataset.voidBnI) === index);
    });
    host?.querySelectorAll(".void-bn-tick").forEach(node => {
        node.classList.toggle("void-bn-current", Number((node as HTMLElement).dataset.voidBnI) === index);
    });
    const meta = host?.querySelector(".void-bn-meta");
    if (meta) meta.textContent = metaLabel(index);
    const tick = host?.querySelectorAll<HTMLElement>(".void-bn-tick")[index];
    tick?.scrollIntoView({ block: "nearest" });
    if (!overMenu) {
        const row = host?.querySelector<HTMLElement>(`.void-bn-item[data-void-bn-i="${index}"]`);
        row?.scrollIntoView({ block: "nearest" });
    }
}

function setActive(nav: NavItem[]) {
    if (performance.now() < lockUntil && lockIdx >= 0) {
        applyActive(lockIdx);
        return;
    }
    const pane = chatPane();
    const top = pane?.getBoundingClientRect().top ?? 0;
    const cutoff = top + (pane?.clientHeight ?? window.innerHeight) * THRESHOLD;
    let active = 0;
    for (let i = 0; i < nav.length; i++) {
        const { el } = nav[i];
        if (!document.body.contains(el)) continue;
        if (el.getBoundingClientRect().top < cutoff) active = i;
        else break;
    }
    applyActive(active);
}

function alignMenu(index: number) {
    const menu = host?.querySelector<HTMLElement>(".void-bn-menu");
    if (!menu || !host) return;
    const origin = rail ?? host;
    const selfTick = host.querySelectorAll<HTMLElement>(".void-bn-tick")[index];
    const ticks = nativeTicks();
    const native = lastNav[index] ? nativeTickFor(lastNav[index], index, ticks) : undefined;
    const tick = selfTick ?? native;
    const row = menu.querySelector<HTMLElement>(`.void-bn-item[data-void-bn-i="${index}"]`);
    row?.scrollIntoView({ block: "nearest" });
    markAim(index);
    const originRect = origin.getBoundingClientRect();
    const tickRect = tick?.getBoundingClientRect();
    const cap = Math.max(120, composerTop() - 16);
    menu.style.maxHeight = `${Math.min(cap, window.innerHeight * 0.7)}px`;
    const mh = menu.offsetHeight;
    const viewTop = 8;
    const viewBottom = Math.min(window.innerHeight - 8, composerTop() - 8);
    let abs = (tickRect?.top ?? originRect.top) - 6;
    if (abs + mh > viewBottom) abs = viewBottom - mh;
    if (abs < viewTop) abs = viewTop;
    menu.style.top = `${abs - originRect.top}px`;
}

function requestActive() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (lastNav.length) setActive(lastNav);
    });
}

function bindIO(nav: NavItem[]) {
    io?.disconnect();
    const root = chatPane();
    io = new IntersectionObserver(requestActive, {
        root,
        threshold: [0, 0.15, 0.35, 0.5, 0.75, 1],
    });
    for (const item of nav) io.observe(item.el);
}

function patchLabels(nav: NavItem[]) {
    host?.querySelectorAll<HTMLElement>(".void-bn-item .void-bn-label").forEach((node, i) => {
        if (nav[i] && node.textContent !== nav[i].text) node.textContent = nav[i].text;
    });
}

function patchLive(nav: NavItem[]) {
    host?.querySelectorAll<HTMLElement>(".void-bn-tick").forEach((node, i) => {
        node.classList.toggle("void-bn-tick-live", !!nav[i]?.live);
    });
    patchLabels(nav);
}

function menuEl(nav: NavItem[]): HTMLElement {
    const menu = document.createElement("div");
    menu.className = cl("menu");
    menu.addEventListener("pointerenter", () => { overMenu = true; });
    menu.addEventListener("pointerleave", () => { overMenu = false; });
    const meta = document.createElement("div");
    meta.className = cl("meta");
    meta.textContent = metaLabel(0);
    const ul = document.createElement("ul");
    ul.className = cl("list");
    nav.forEach((item, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = cl("item");
        btn.dataset.voidBnI = String(i);
        const emoji = document.createElement("span");
        emoji.className = cl("emoji");
        emoji.textContent = item.role === "user" ? "❓" : "🤖";
        const label = document.createElement("span");
        label.className = cl("label");
        label.textContent = item.text;
        btn.append(emoji, label);
        btn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i);
        });
        li.appendChild(btn);
        ul.appendChild(li);
    });
    menu.append(meta, ul);
    return menu;
}

function tickRail(nav: NavItem[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = cl("ticks", { dense: nav.length > DENSE_N });
    nav.forEach((item, i) => {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = cl("tick", item.role === "user" ? "tick-user" : "tick-asst", { "tick-live": item.live });
        tick.dataset.voidBnI = String(i);
        tick.setAttribute("aria-label", `Go to message ${i + 1} of ${nav.length}`);
        tick.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i);
        });
        tick.addEventListener("pointerenter", () => alignMenu(i));
        wrap.appendChild(tick);
    });
    return wrap;
}

function restoreFrame() {
    if (!frameTouched) return;
    frameTouched.style.position = framePrevPos;
    frameTouched = null;
    framePrevPos = "";
}

function pinFrame(frame: HTMLElement) {
    if (scrolls(frame)) return;
    if (getComputedStyle(frame).position !== "static") return;
    frameTouched = frame;
    framePrevPos = frame.style.position;
    frame.style.position = "relative";
}

function unmount() {
    rail?.classList.remove(SLOT_CLASS, "void-bn-open");
    host?.remove();
    host = null;
    rail = null;
    paintedKey = "";
    overMenu = false;
    restoreFrame();
}

function syncHideTip() {
    document.documentElement.classList.toggle(HIDE_CLASS, !!settings.store.hideNativeHover);
}

function setOpen(on: boolean) {
    host?.classList.toggle("void-bn-open", on);
    rail?.classList.toggle("void-bn-open", on);
    if (!on) markAim(-1);
}

function onPointerOver(e: Event) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const native = t.closest<HTMLButtonElement>(TICK_SEL);
    if (native) {
        const idx = nativeTicks().indexOf(native);
        if (idx >= 0) alignMenu(navIndexFromTick(native, idx));
        return;
    }
    const self = t.closest<HTMLElement>(".void-bn-tick");
    if (self?.dataset.voidBnI != null) alignMenu(Number(self.dataset.voidBnI));
}

function onKeyDown(e: KeyboardEvent) {
    if (!lastNav.length || !host?.isConnected) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
    if (e.key === "Escape") {
        if (host.classList.contains("void-bn-open") || rail?.classList.contains("void-bn-open")) {
            e.preventDefault();
            setOpen(false);
        }
        return;
    }
    const homeEnd = e.key === "Home" || e.key === "End";
    const arrow = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (!homeEnd && !arrow) return;
    if (homeEnd) {
        e.preventDefault();
        const idx = e.key === "Home" ? 0 : lastNav.length - 1;
        jump(lastNav[idx], idx);
        alignMenu(idx);
        return;
    }
    if (!stepItem(e.key === "ArrowUp" ? -1 : 1)) return;
    e.preventDefault();
}

function onPointerDown(e: PointerEvent) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (host?.contains(t) || rail?.contains(t)) return;
    setOpen(false);
}

function bindWatchers() {
    const col = chatColumn();
    const pane = chatPane();
    const main = document.querySelector("main");
    const target = col ?? pane ?? (main instanceof HTMLElement ? main : document.body);

    if (target !== observedPane) {
        paneMo?.disconnect();
        paneMo = new MutationObserver(debouncedPaint);
        paneMo.observe(target, { childList: true, subtree: true });
        observedPane = target;
    }

    if (main && !mainMo) {
        mainMo = new MutationObserver(() => {
            bindWatchers();
            debouncedPaint();
        });
        mainMo.observe(main, { childList: true, subtree: false });
    }
}

function paint() {
    bindWatchers();
    const path = chatPath();
    if (path !== lastPath) {
        lastPath = path;
        paintedKey = "";
        if (host) unmount();
    }

    const nav = collect();
    if (!nav.length) {
        lastNav = [];
        unmount();
        io?.disconnect();
        io = null;
        return;
    }

    const ticks = nativeTicks();
    const slot = nativeSlot();
    const mode = ticks.length ? "native" : (slot ? "fill" : "self");
    const nextKey = structKey(mode, nav);
    if (nextKey === paintedKey && host?.isConnected && sameEls(nav)) {
        lastNav = nav;
        patchLive(nav);
        setActive(nav);
        return;
    }

    unmount();
    const box = document.createElement("div");
    box.className = cl("host", mode);

    if (mode === "native" && slot) {
        slot.classList.add(SLOT_CLASS);
        box.appendChild(menuEl(nav));
        slot.appendChild(box);
        rail = slot;
    } else if (mode === "fill" && slot) {
        slot.classList.add(SLOT_CLASS);
        box.append(tickRail(nav), menuEl(nav));
        slot.appendChild(box);
        rail = slot;
    } else {
        const frame = chatColumn();
        if (!frame) return;
        pinFrame(frame);
        box.classList.add(SLOT_CLASS);
        box.append(tickRail(nav), menuEl(nav));
        frame.appendChild(box);
    }

    host = box;
    lastNav = nav;
    paintedKey = nextKey;
    bindIO(nav);
    setActive(nav);
}

const debouncedPaint = debounce(paint, 160);

function pageKey(s: ChatPageStoreState): string {
    return `${s.streamedMessageId ?? ""}|${s.showStreamingIndicator ? 1 : 0}`;
}

function responseKey(s: ResponseStoreState): string {
    try {
        const id = ChatPageStore.useChatPageStore.getState().streamedMessageId ?? "";
        const r = s.byId[id];
        return `${id}:${r?.state ?? ""}:${r?.partial ? 1 : 0}`;
    } catch {
        return "";
    }
}

function onStreamEnd(_data: VoidPPEventMap["streamEnd"]) {
    paint();
}

function start() {
    if (ac) return;
    ac = new AbortController();
    const { signal } = ac;
    lastPath = chatPath();
    syncHideTip();
    paint();
    bindWatchers();
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
    document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true, signal });
    window.addEventListener("popstate", debouncedPaint, { signal });
    const main = document.querySelector("main");
    if (main) {
        ro = new ResizeObserver(debouncedPaint);
        ro.observe(main);
    }
}

function stop() {
    ac?.abort();
    ac = null;
    paneMo?.disconnect();
    paneMo = null;
    mainMo?.disconnect();
    mainMo = null;
    observedPane = null;
    ro?.disconnect();
    ro = null;
    io?.disconnect();
    io = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    unmount();
    clearFlash();
    lastNav = [];
    lastPath = "";
    document.documentElement.classList.remove(HIDE_CLASS);
}

export default definePlugin({
    name: "BetterNavigator",
    icon: ScrollTextIcon,
    description: "Upgrade Grok's message rail into a Notion-style outline of the whole chat.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.DOMContentLoaded,
    settings,
    managedStyle: "betterNavigator",
    cleanupSelectors: [".void-bn-host"],
    start,
    stop,
    onSettingsChange() {
        syncHideTip();
        paintedKey = "";
        paint();
    },
    events: {
        streamEnd: onStreamEnd,
    },
    zustand: {
        ChatPageStore: {
            selector: pageKey,
            handler: paint,
        },
        ResponseStore: {
            selector: responseKey,
            handler: paint,
        },
    },
});
