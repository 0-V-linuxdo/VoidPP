/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { UserRoundPenIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const FOOTER = '[data-sidebar="footer"]';
const MENU = '[role="menu"]';
const PFP = 'img[alt="pfp"]';
const NAME_CLASS = "void-csi-name";
const HIDE_CLASS = "void-csi-hide";
const MARK = "data-void-csi";
const ORIG = "data-void-csi-orig";

const settings = definePluginSettings({
    displayName: {
        type: OptionType.STRING,
        description: "Display name next to the sidebar avatar. Empty keeps the official name.",
        default: "",
        placeholder: "Shown next to the sidebar avatar",
    },
    avatarUrl: {
        type: OptionType.STRING,
        description: "Image URL or data:image…. Empty keeps the official avatar.",
        default: "",
        placeholder: "https://… or data:image/…",
    },
    applyToMenu: {
        type: OptionType.BOOLEAN,
        description: "Also replace the avatar and name at the top of the account dropdown.",
        default: true,
    },
});

const failed = new Set<string>();
let treeObs: MutationObserver | null = null;
let raf = 0;
let painting = false;
let started = false;

function trimName(): string {
    return String(settings.store.displayName ?? "").trim();
}

function avatarSrc(): string | null {
    const raw = String(settings.store.avatarUrl ?? "").trim();
    if (!raw || failed.has(raw)) return null;
    if (raw.startsWith("data:image/")) return raw;
    try {
        const { protocol } = new URL(raw);
        if (protocol === "https:" || protocol === "http:") return raw;
    } catch {
        return null;
    }
    return null;
}

function footerBtn(footer: Element): HTMLElement | null {
    return footer.querySelector('button[data-slot="button"], button[data-state]');
}

function restoreImg(img: HTMLImageElement) {
    const orig = img.getAttribute(ORIG);
    img.removeEventListener("error", onImgError);
    img.removeAttribute(MARK);
    if (orig == null) return;
    img.src = orig;
    img.removeAttribute(ORIG);
}

function onImgError(e: Event) {
    const img = e.currentTarget;
    if (!(img instanceof HTMLImageElement)) return;
    const url = img.getAttribute("src") ?? "";
    if (url) failed.add(url);
    restoreImg(img);
}

function paintImg(img: HTMLImageElement, url: string | null) {
    if (!url) {
        restoreImg(img);
        return;
    }
    const current = img.getAttribute("src") ?? "";
    if (img.getAttribute(MARK) === "1") {
        if (current === url) return;
        if (current) img.setAttribute(ORIG, current);
    } else if (!img.hasAttribute(ORIG)) {
        img.setAttribute(ORIG, current);
    }
    img.setAttribute(MARK, "1");
    if (img.getAttribute("srcset")) img.removeAttribute("srcset");
    img.referrerPolicy = "no-referrer";
    img.removeEventListener("error", onImgError);
    img.addEventListener("error", onImgError);
    if (current !== url) img.src = url;
}

function pfps(scope: ParentNode, fallbackRoot?: Element | null): HTMLImageElement[] {
    const tagged = [...scope.querySelectorAll<HTMLImageElement>(PFP)];
    if (tagged.length) return tagged;
    const img = fallbackRoot?.querySelector("img");
    return img instanceof HTMLImageElement ? [img] : [];
}

function ensureName(host: Element, text: string): HTMLElement {
    let el = host.querySelector<HTMLElement>(`:scope > .${NAME_CLASS}`);
    if (!el) {
        el = document.createElement("span");
        el.className = NAME_CLASS;
        host.appendChild(el);
    }
    if (el.textContent !== text) el.textContent = text;
    return el;
}

function dropNames(scope: ParentNode) {
    for (const el of scope.querySelectorAll(`.${NAME_CLASS}`)) el.remove();
}

function unhide(scope: ParentNode) {
    for (const el of scope.querySelectorAll(`.${HIDE_CLASS}`)) el.classList.remove(HIDE_CLASS);
}

function hideOfficial(host: Element, keep: Element) {
    for (const node of host.querySelectorAll("span, p")) {
        if (node === keep || keep.contains(node) || node.contains(keep) || node.classList.contains(NAME_CLASS)) continue;
        if (!node.textContent?.trim()) continue;
        node.classList.add(HIDE_CLASS);
    }
}

function syncName(host: Element | null, text: string, scope: Element) {
    if (!host || !text) {
        dropNames(scope);
        unhide(scope);
        return;
    }
    const el = ensureName(host, text);
    for (const node of scope.querySelectorAll(`.${NAME_CLASS}`)) {
        if (node !== el) node.remove();
    }
}

function nameHost(footer: Element): Element | null {
    const card = footer.querySelector(".void-sidebar-card");
    if (card) return card;
    const btn = footerBtn(footer);
    if (!btn?.querySelector(".min-w-0")) return null;
    return btn;
}

function paintFooter() {
    const footer = document.querySelector(FOOTER);
    if (!footer) return;
    const url = avatarSrc();
    for (const img of pfps(footer, footerBtn(footer))) paintImg(img, url);
    syncName(nameHost(footer), trimName(), footer);
}

function isAccountMenu(menu: Element): boolean {
    return !!menu.querySelector(PFP) || !!menu.querySelector('[class*="max-w-[400px]"].truncate');
}

function paintMenu() {
    const url = avatarSrc();
    const name = trimName();
    for (const menu of document.querySelectorAll(MENU)) {
        if (!isAccountMenu(menu)) continue;
        if (!settings.store.applyToMenu) {
            dropNames(menu);
            unhide(menu);
            for (const img of menu.querySelectorAll<HTMLImageElement>(`img[${MARK}]`)) restoreImg(img);
            continue;
        }
        for (const img of pfps(menu, menu)) paintImg(img, url);
        if (!name) {
            dropNames(menu);
            unhide(menu);
            continue;
        }
        const img = menu.querySelector(PFP) ?? menu.querySelector("img");
        const host = img?.parentElement?.parentElement ?? img?.parentElement ?? menu;
        const el = ensureName(host, name);
        hideOfficial(host, el);
        for (const node of menu.querySelectorAll(`.${NAME_CLASS}`)) {
            if (node !== el) node.remove();
        }
    }
}

function restoreAll() {
    for (const img of document.querySelectorAll<HTMLImageElement>(`img[${MARK}]`)) restoreImg(img);
    dropNames(document);
    unhide(document);
}

function apply() {
    if (!started || painting) return;
    painting = true;
    try {
        paintFooter();
        paintMenu();
    } finally {
        painting = false;
    }
}

function schedule() {
    if (!started || raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
    });
}

function onMut(muts: MutationRecord[]) {
    if (painting || !started) return;
    for (const m of muts) {
        if (m.type !== "attributes") {
            schedule();
            return;
        }
        const el = m.target;
        if (!(el instanceof HTMLImageElement)) continue;
        if (el.closest(FOOTER) || (settings.store.applyToMenu && el.closest(MENU))) {
            schedule();
            return;
        }
    }
}

function bind() {
    treeObs?.disconnect();
    treeObs = new MutationObserver(onMut);
    treeObs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "srcset"],
    });
}

export default definePlugin({
    name: "CustomSidebarIdentity",
    icon: UserRoundPenIcon,
    description: "Replace the sidebar avatar and display name. Empty fields keep the official values.",
    authors: [Devs.p],
    tags: ["ui"],
    enabledByDefault: false,
    settings,
    managedStyle: "customSidebarIdentity",
    cleanupSelectors: [`.${NAME_CLASS}`],

    start() {
        started = true;
        failed.clear();
        bind();
        apply();
    },

    onSettingsChange() {
        failed.clear();
        apply();
    },

    stop() {
        started = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        treeObs?.disconnect();
        treeObs = null;
        restoreAll();
        failed.clear();
    },
});
