/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { RotateCcwIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

const logger = new Logger("ErrorPageRetry");
const STORE = "void-epr";
const STALE_MS = 5 * 60 * 1000;
const TITLE = /^(something went wrong|出错了|出了点问题)$/i;
const RELOAD = /reload page|^reload$|重新加载页面|^重新加载$/i;

const settings = definePluginSettings({
    maxRetries: {
        type: OptionType.NUMBER,
        description: "Maximum reloads of the crash screen for this URL.",
        default: 5,
    },
    delay: {
        type: OptionType.NUMBER,
        description: "Seconds to wait before reloading.",
        default: 1,
    },
});

type Slot = { n: number; t: number };

let timer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let raf = 0;

function slotKey() {
    return `${STORE}:${location.pathname}${location.search}`;
}

function readSlot(): Slot {
    try {
        const raw = sessionStorage.getItem(slotKey());
        if (!raw) return { n: 0, t: 0 };
        const parsed = JSON.parse(raw) as Slot;
        if (typeof parsed?.n !== "number" || typeof parsed?.t !== "number") return { n: 0, t: 0 };
        if (Date.now() - parsed.t > STALE_MS) return { n: 0, t: 0 };
        return parsed;
    } catch (e) {
        logger.warn(e);
        return { n: 0, t: 0 };
    }
}

function writeSlot(slot: Slot) {
    try {
        sessionStorage.setItem(slotKey(), JSON.stringify(slot));
    } catch (e) {
        logger.warn(e);
    }
}

function clearSlot() {
    try {
        sessionStorage.removeItem(slotKey());
    } catch (e) {
        logger.warn(e);
    }
}

function isCrashScreen() {
    if (document.querySelector("form[data-composer], #app-sidebar")) return false;
    const titles = document.querySelectorAll("h1");
    let hit = false;
    for (const h of titles) {
        if (TITLE.test((h.textContent ?? "").trim())) {
            hit = true;
            break;
        }
    }
    if (!hit) return false;
    for (const el of document.querySelectorAll("a, button")) {
        if (RELOAD.test((el.textContent ?? "").replaceAll(/\s+/g, " ").trim())) return true;
    }
    return false;
}

function clearTimer() {
    if (timer != null) {
        clearTimeout(timer);
        timer = null;
    }
}

function schedule() {
    if (timer != null) return;
    const max = settings.store.maxRetries;
    const slot = readSlot();
    if (slot.n >= max) {
        logger.warn(`max retries (${max}) for ${location.pathname}`);
        return;
    }
    const delaySec = settings.store.delay;
    logger.info(`reload ${slot.n + 1}/${max} in ${delaySec}s`);
    timer = setTimeout(() => {
        timer = null;
        const next = readSlot();
        if (next.n >= settings.store.maxRetries) return;
        writeSlot({ n: next.n + 1, t: Date.now() });
        location.reload();
    }, Math.max(0, delaySec) * 1000);
}

function tick() {
    if (!isCrashScreen()) {
        clearSlot();
        return;
    }
    schedule();
}

function onMut() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        tick();
    });
}

export default definePlugin({
    name: "ErrorPageRetry",
    icon: RotateCcwIcon,
    description: "Reload Grok's crash screen automatically, keeping the current URL. Does not follow the native Reload link to /.",
    authors: [Devs.p],
    tags: ["navigation"],
    enabledByDefault: true,
    settings,

    start() {
        observer = new MutationObserver(onMut);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        tick();
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick, { once: true });
    },

    stop() {
        observer?.disconnect();
        observer = null;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        clearTimer();
    },

    onSettingsChange() {
        if (!isCrashScreen()) return;
        clearTimer();
        tick();
    },
});
