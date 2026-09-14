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
const HIDE_CLASS = "void-bn-hidetip";
const SUMMARY_MAX = 60;
const FLASH_MS = 2000;
const THRESHOLD = 0.4;
const OFFSET_PX = 72;
const SLOT_CLASS = "void-bn-rail";
const ZH = /^zh\b/i;

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
let host: HTMLElement | null = null;
let rail: HTMLElement | null = null;
let frameTouched: HTMLElement | null = null;
let framePrevPos = "";
let paintedKey = "";
let lastNav: NavItem[] = [];
let flashTimer = 0;
let flashing: HTMLElement | null = null;
let raf = 0;

function isVisible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function scrolls(el: HTMLElement): boolean {
    const oy = getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll";
}

function nativeTicks(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>(TICK_SEL)].filter(isVisible);
}

function nativeSlot(): HTMLElement | null {
    const tick = document.querySelector<HTMLElement>(TICK_SEL);
    const prev = document.querySelector<HTMLElement>(PREV_SEL);
    const start = tick ?? prev;
    return start?.closest<HTMLElement>(".absolute") ?? null;
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

function roleLabel(role: Role): string {
    const zh = ZH.test(document.documentElement.lang) || ZH.test(navigator.language);
    if (role === "user") return zh ? "你" : "You";
    return "Grok";
}

function summarize(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("button, svg, nav, time, .void-timestamp").forEach(n => n.remove());
    const text = (clone.textContent ?? "").replaceAll(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
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

function jump(item: NavItem, index: number, ticks: HTMLButtonElement[]) {
    const tick = settings.store.showAssistant && ticks.length === lastNav.length ? ticks[index] : undefined;
    if (tick) {
        tick.click();
        window.setTimeout(() => flash(item.el), 180);
        return;
    }
    item.el.style.scrollMarginTop = `${OFFSET_PX}px`;
    item.el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => flash(item.el), 180);
}

function setActive(list: HTMLElement, nav: NavItem[]) {
    const cutoff = window.innerHeight * THRESHOLD;
    let active = 0;
    for (let i = 0; i < nav.length; i++) {
        const { el } = nav[i];
        if (!document.body.contains(el)) continue;
        if (el.getBoundingClientRect().top < cutoff) active = i;
        else break;
    }
    list.querySelectorAll("[data-void-bn-i]").forEach((node, i) => {
        node.classList.toggle("void-bn-active", i === active);
    });
    host?.querySelectorAll(".void-bn-tick").forEach((node, i) => {
        node.classList.toggle("void-bn-current", i === active);
    });
}

function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        const list = host?.querySelector(".void-bn-list");
        if (list instanceof HTMLElement && lastNav.length) setActive(list, lastNav);
    });
}

function menuEl(nav: NavItem[], ticks: HTMLButtonElement[]): HTMLElement {
    const menu = document.createElement("div");
    menu.className = cl("menu");
    const ul = document.createElement("ul");
    ul.className = cl("list");
    nav.forEach((item, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = cl("item");
        btn.dataset.voidBnI = String(i);
        const role = document.createElement("span");
        role.className = cl("role");
        role.textContent = roleLabel(item.role);
        const label = document.createElement("span");
        label.className = cl("label");
        label.textContent = item.text;
        btn.append(role, label);
        btn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i, ticks);
        });
        li.appendChild(btn);
        ul.appendChild(li);
    });
    menu.appendChild(ul);
    return menu;
}

function tickRail(nav: NavItem[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = cl("ticks");
    nav.forEach((item, i) => {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = `${cl("tick")} ${item.role === "user" ? cl("tick-user") : cl("tick-asst")}`;
        tick.dataset.voidBnI = String(i);
        tick.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i, []);
        });
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
    rail?.classList.remove(SLOT_CLASS);
    host?.remove();
    host = null;
    rail = null;
    paintedKey = "";
    restoreFrame();
}

function syncHideTip() {
    document.documentElement.classList.toggle(HIDE_CLASS, !!settings.store.hideNativeHover);
}

function paint() {
    const nav = collect();
    if (!nav.length) {
        lastNav = [];
        unmount();
        return;
    }

    const ticks = nativeTicks();
    const slot = nativeSlot();
    const mode = ticks.length ? "native" : (slot ? "fill" : "self");
    const nextKey = `${mode}:${nav.length}:${nav.map(n => `${n.role}:${n.text}`).join("|")}`;
    if (nextKey === paintedKey && host?.isConnected) {
        lastNav = nav;
        const list = host.querySelector(".void-bn-list");
        if (list instanceof HTMLElement) setActive(list, nav);
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

    const list = box.querySelector(".void-bn-list");
    if (list instanceof HTMLElement) setActive(list, nav);
    host = box;
    lastNav = nav;
    paintedKey = nextKey;
}

const debouncedPaint = debounce(paint, 160);

function start() {
    if (ac) return;
    ac = new AbortController();
    const { signal } = ac;
    syncHideTip();
    paint();
    mo = new MutationObserver(debouncedPaint);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true, signal });
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
