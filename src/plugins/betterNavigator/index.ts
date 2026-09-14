/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { ScrollTextIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { debounce } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const cl = classNameFactory("void-bn-");
const MSG_SEL = "[data-testid='user-message'], [data-testid='assistant-message']";
const TICK_SEL = "button[aria-label^='Go to response ']";
const PREV_SEL = "button[aria-label='Navigate to previous message']";
const PANE_SKIP = "[data-sidebar], [class*='pane-card']";
const STRIP_SEL = [
    "button", "svg", "nav", "time", ".void-timestamp", "[class*='timestamp']",
    "details", "[data-testid*='think']", "[class*='thinking']", "[class*='Thought']",
    "[aria-label*='Thought']", "[role='toolbar']",
].join(",");
const NOISE_TEXT = /^(copy|share|retry|edit|more|thinking|analyzing|searching|thoughts?)$/i;
const HIDE_CLASS = "void-bn-hidetip";
const SUMMARY_MAX = 60;
const FLASH_MS = 2000;
const THRESHOLD = 0.4;
const OFFSET_PX = 72;
const LOCK_MS = 800;
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
}

let ac: AbortController | null = null;
let mo: MutationObserver | null = null;
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;
let host: HTMLElement | null = null;
let rail: HTMLElement | null = null;
let frameTouched: HTMLElement | null = null;
let framePrevPos = "";
let paintedKey = "";
let lastNav: NavItem[] = [];
let flashTimer = 0;
let flashing: HTMLElement | null = null;
let raf = 0;
let activeIdx = 0;
let lockIdx = -1;
let lockUntil = 0;
let overMenu = false;

function isVisible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function scrolls(el: HTMLElement): boolean {
    const oy = getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll";
}

function isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    if (t.closest(".query-bar, [contenteditable='true']")) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function nativeTicks(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>(TICK_SEL)].filter(isVisible);
}

function nativeSlot(): HTMLElement | null {
    const tick = document.querySelector<HTMLElement>(TICK_SEL);
    const prev = document.querySelector<HTMLElement>(PREV_SEL);
    const start = tick ?? prev;
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

function hasMedia(el: HTMLElement): "image" | "file" | "" {
    if (el.querySelector("img, video, canvas")) return "image";
    if (el.querySelector("a[download], [data-testid*='file'], [class*='attachment']")) return "file";
    return "";
}

function summarize(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(STRIP_SEL).forEach(n => n.remove());
    const text = (clone.textContent ?? "").replaceAll(/\s+/g, " ").trim();
    if (NOISE_TEXT.test(text)) return "";
    const media = hasMedia(el);
    if (!text) {
        if (media === "image") return "🖼";
        if (media === "file") return "📎";
        return "";
    }
    const clipped = text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
    if (media === "image") return `🖼 ${clipped}`;
    if (media === "file") return `📎 ${clipped}`;
    return clipped;
}

function collect(): NavItem[] {
    const root = chatPane() ?? document;
    const showAsst = settings.store.showAssistant;
    const out: NavItem[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(MSG_SEL)) {
        if (!document.body.contains(el)) continue;
        const role: Role = el.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
        if (!showAsst && role === "assistant") continue;
        const text = summarize(el);
        if (!text) continue;
        out.push({ el, role, text });
    }
    return out;
}

function structKey(mode: string, nav: NavItem[]): string {
    return `${mode}:${nav.length}:${nav.map(n => n.role).join("")}`;
}

function sameEls(nav: NavItem[]): boolean {
    return nav.length === lastNav.length && nav.every((n, i) => n.el === lastNav[i]?.el && n.role === lastNav[i]?.role);
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
    flashTimer = window.setTimeout(clearFlash, FLASH_MS);
}

function nativeTickFor(item: NavItem, index: number, ticks: HTMLButtonElement[]): HTMLButtonElement | undefined {
    if (!ticks.length) return;
    if (ticks.length === lastNav.length) return ticks[index];
    if (item.role !== "assistant") return;
    let seen = -1;
    for (let i = 0; i <= index; i++) {
        if (lastNav[i]?.role === "assistant") seen++;
    }
    return ticks[seen];
}

function navIndexFromTick(tickIndex: number): number {
    if (nativeTicks().length === lastNav.length) return tickIndex;
    let seen = 0;
    for (let i = 0; i < lastNav.length; i++) {
        if (lastNav[i].role !== "assistant") continue;
        if (seen === tickIndex) return i;
        seen++;
    }
    return Math.min(tickIndex, Math.max(0, lastNav.length - 1));
}

function jump(item: NavItem, index: number, ticks: HTMLButtonElement[]) {
    lockIdx = index;
    lockUntil = performance.now() + LOCK_MS;
    applyActive(index);
    const tick = nativeTickFor(item, index, ticks);
    if (tick) {
        tick.click();
        window.setTimeout(() => flash(item.el), 180);
        return;
    }
    item.el.style.scrollMarginTop = `${OFFSET_PX}px`;
    item.el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => flash(item.el), 180);
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
    if (meta) meta.textContent = `${index + 1} / ${lastNav.length}`;
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
    const native = ticks.length === lastNav.length ? ticks[index] : nativeTickFor(lastNav[index], index, ticks);
    const tick = selfTick ?? native;
    const row = menu.querySelector<HTMLElement>(`.void-bn-item[data-void-bn-i="${index}"]`);
    row?.scrollIntoView({ block: "nearest" });
    markAim(index);
    if (!tick) return;
    const top = tick.getBoundingClientRect().top - origin.getBoundingClientRect().top;
    const mh = menu.offsetHeight;
    const max = mh > 0 ? Math.max(0, origin.clientHeight - mh) : 0;
    menu.style.top = `${Math.min(Math.max(0, top - 6), max)}px`;
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

function menuEl(nav: NavItem[], ticks: HTMLButtonElement[]): HTMLElement {
    const menu = document.createElement("div");
    menu.className = cl("menu");
    menu.addEventListener("pointerenter", () => { overMenu = true; });
    menu.addEventListener("pointerleave", () => { overMenu = false; });
    const meta = document.createElement("div");
    meta.className = cl("meta");
    meta.textContent = `1 / ${nav.length}`;
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
            jump(item, i, ticks);
        });
        li.appendChild(btn);
        ul.appendChild(li);
    });
    menu.append(meta, ul);
    return menu;
}

function tickRail(nav: NavItem[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = `${cl("ticks")}${nav.length > DENSE_N ? ` ${cl("dense")}` : ""}`;
    nav.forEach((item, i) => {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = `${cl("tick")} ${item.role === "user" ? cl("tick-user") : cl("tick-asst")}`;
        tick.dataset.voidBnI = String(i);
        tick.setAttribute("aria-label", `Go to message ${i + 1} of ${nav.length}`);
        tick.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i, []);
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
        if (idx >= 0) alignMenu(navIndexFromTick(idx));
        return;
    }
    const self = t.closest<HTMLElement>(".void-bn-tick");
    if (self?.dataset.voidBnI != null) alignMenu(Number(self.dataset.voidBnI));
}

function onKeyDown(e: KeyboardEvent) {
    if (!lastNav.length || !host?.isConnected) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === "Escape") {
        if (host.classList.contains("void-bn-open") || rail?.classList.contains("void-bn-open")) {
            e.preventDefault();
            setOpen(false);
        }
        return;
    }
    const arrow = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (!arrow) return;
    const hovered = host.matches(":hover") || !!rail?.matches(":hover") || host.classList.contains("void-bn-open");
    if (!e.altKey && !hovered) return;
    e.preventDefault();
    const dir = e.key === "ArrowUp" ? -1 : 1;
    const next = Math.min(lastNav.length - 1, Math.max(0, activeIdx + dir));
    setOpen(true);
    jump(lastNav[next], next, nativeTicks());
    alignMenu(next);
}

function onPointerDown(e: PointerEvent) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (host?.contains(t) || rail?.contains(t)) return;
    setOpen(false);
}

function paint() {
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
        patchLabels(nav);
        setActive(nav);
        return;
    }

    unmount();
    const box = document.createElement("div");
    box.className = `${cl("host")} ${cl(mode)}`;

    if (mode === "native" && slot) {
        slot.classList.add(SLOT_CLASS);
        box.appendChild(menuEl(nav, ticks));
        slot.appendChild(box);
        rail = slot;
    } else if (mode === "fill" && slot) {
        slot.classList.add(SLOT_CLASS);
        box.append(tickRail(nav), menuEl(nav, []));
        slot.appendChild(box);
        rail = slot;
    } else {
        const frame = chatColumn();
        if (!frame) return;
        pinFrame(frame);
        box.classList.add(SLOT_CLASS);
        box.append(tickRail(nav), menuEl(nav, []));
        frame.appendChild(box);
    }

    host = box;
    lastNav = nav;
    paintedKey = nextKey;
    bindIO(nav);
    setActive(nav);
}

const debouncedPaint = debounce(paint, 160);

function start() {
    if (ac) return;
    ac = new AbortController();
    const { signal } = ac;
    syncHideTip();
    paint();
    mo = new MutationObserver(debouncedPaint);
    const root = document.querySelector("main") ?? document.body;
    mo.observe(root, { childList: true, subtree: true });
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
    document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true, signal });
    const main = document.querySelector("main");
    if (main) {
        ro = new ResizeObserver(debouncedPaint);
        ro.observe(main);
    }
}

function stop() {
    ac?.abort();
    ac = null;
    mo?.disconnect();
    mo = null;
    ro?.disconnect();
    ro = null;
    io?.disconnect();
    io = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    unmount();
    clearFlash();
    lastNav = [];
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
});
