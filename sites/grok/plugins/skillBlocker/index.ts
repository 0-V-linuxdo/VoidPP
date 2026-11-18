/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, ToastType } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { ShieldOffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { pageWindow } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const SKILLS_PATH = "/rest/user-skills";
const MIN_POLL_SEC = 5;
const MENU_ROOTS = '[role="dialog"], [role="menu"], [role="listbox"]';

const logger = new Logger("SkillBlocker");

const settings = definePluginSettings({
    blockedSkills: {
        type: OptionType.STRING,
        description: "Private skill names to hide. Separate names with commas or new lines.",
        default: "remote-helium-sop",
    },
    pollInterval: {
        type: OptionType.NUMBER,
        description: "Seconds between delete checks. Minimum 5. Ignored while hide-only is on.",
        default: 5,
    },
    hideOnly: {
        type: OptionType.BOOLEAN,
        description: "Only hide blocked skills in the page. Do not delete them from the account.",
        default: false,
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when a blocked skill is deleted.",
        default: true,
    },
});

interface SkillBody {
    skills?: { name?: string }[];
}

let timer: ReturnType<typeof setInterval> | null = null;
let scrubTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let sweeping = false;
let active = false;
let origFetch: typeof fetch | null = null;
let origXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let origXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

function blockedNames(): string[] {
    return settings.store.blockedSkills.split(/[\n,]/).map(name => name.trim()).filter(Boolean);
}

function blockedSet(): Set<string> {
    return new Set(blockedNames());
}

function pollMs(): number {
    const sec = settings.store.pollInterval;
    const n = typeof sec === "number" && Number.isFinite(sec) ? sec : MIN_POLL_SEC;
    return Math.max(MIN_POLL_SEC, n) * 1000;
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    try {
        return input.url;
    } catch {
        return "";
    }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    return method.toUpperCase();
}

function skillListPath(url: string): boolean {
    if (!url) return false;
    let path = url;
    try {
        const base = pageWindow.location?.href || "https://grok.com/";
        path = new URL(url, base).pathname;
    } catch {
        const q = url.indexOf("?");
        path = q === -1 ? url : url.slice(0, q);
    }
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path.endsWith(SKILLS_PATH);
}

function isSkillWrite(input: RequestInfo | URL, init?: RequestInit): boolean {
    const method = requestMethod(input, init);
    if (method === "GET" || method === "HEAD" || method === "DELETE") return false;
    return requestUrl(input).includes(SKILLS_PATH);
}

function stripSkills(data: unknown, blocked: Set<string>): { body: string; removed: string[] } | null {
    if (!data || typeof data !== "object") return null;
    const { skills } = data as SkillBody;
    if (!Array.isArray(skills)) return null;
    const removed: string[] = [];
    const next = skills.filter(skill => {
        const name = skill?.name;
        if (name && blocked.has(name)) {
            removed.push(name);
            return false;
        }
        return true;
    });
    if (!removed.length) return null;
    return { body: JSON.stringify({ ...data, skills: next }), removed };
}

async function filterResponse(res: Response): Promise<Response> {
    if (!res.ok) return res;
    const blocked = blockedSet();
    if (!blocked.size) return res;
    let data: unknown;
    try {
        data = await res.clone().json();
    } catch (e) {
        logger.warn("Skill list was not JSON", e);
        return res;
    }
    const stripped = stripSkills(data, blocked);
    if (!stripped) return res;
    logger.info(`Hid ${stripped.removed.join(", ")}`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    scheduleScrub();
    return new Response(stripped.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
    });
}

async function removeSkill(name: string) {
    if (!origFetch) return;
    const res = await origFetch.call(pageWindow, `${SKILLS_PATH}/${encodeURIComponent(name)}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok) {
        logger.warn(`Delete ${name} failed`, res.status);
        return;
    }
    logger.info(`Removed ${name}`);
    if (settings.store.notify) showToast(`Removed skill ${name}.`, ToastType.SUCCESS);
    scheduleScrub();
}

async function sweep() {
    if (!active || sweeping || !origFetch || settings.store.hideOnly) return;
    const names = blockedNames();
    if (!names.length) return;
    sweeping = true;
    try {
        const res = await origFetch.call(pageWindow, SKILLS_PATH, { credentials: "include" });
        if (!res.ok) return;
        let data: unknown;
        try {
            data = await res.json();
        } catch (e) {
            logger.warn("Skill list was not JSON", e);
            return;
        }
        const blocked = new Set(names);
        const hits = ((data as SkillBody).skills ?? []).flatMap(skill => {
            const { name } = skill;
            return name && blocked.has(name) ? [name] : [];
        });
        if (!hits.length) return;
        await Promise.all(hits.map(name => removeSkill(name)));
    } catch (e) {
        logger.error("Skill sweep failed", e);
    } finally {
        sweeping = false;
    }
}

function skillBlockerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const list = active && requestMethod(input, init) === "GET" && skillListPath(requestUrl(input));
    const write = active && isSkillWrite(input, init);
    const promise = origFetch!.call(pageWindow, input, init);
    if (!list && !write) return promise;
    return promise.then(res => {
        if (write && res.ok) void sweep();
        return list ? filterResponse(res) : res;
    });
}

function patchXhr(xhr: XMLHttpRequest) {
    const blocked = blockedSet();
    if (!blocked.size || xhr.status < 200 || xhr.status >= 300) return;
    const type = xhr.responseType;
    let data: unknown;
    try {
        if (type === "" || type === "text") data = JSON.parse(xhr.responseText);
        else if (type === "json") data = xhr.response;
        else return;
    } catch (e) {
        logger.warn("xhr skill list was not JSON", e);
        return;
    }
    const stripped = stripSkills(data, blocked);
    if (!stripped) return;
    logger.info(`Hid ${stripped.removed.join(", ")}`);
    const parsed = JSON.parse(stripped.body) as unknown;
    try {
        Object.defineProperty(xhr, "responseText", { configurable: true, get: () => stripped.body });
        Object.defineProperty(xhr, "response", {
            configurable: true,
            get: () => type === "json" ? parsed : stripped.body,
        });
    } catch (e) {
        logger.warn("xhr skill list patch failed", e);
    }
    scheduleScrub();
}

function hookXhr() {
    if (origXhrOpen) return;
    const XHR = pageWindow.XMLHttpRequest;
    origXhrOpen = XHR.prototype.open;
    origXhrSend = XHR.prototype.send;
    XHR.prototype.open = function voidSkillBlockerOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
        try {
            xhrMeta.set(this, { method: String(method).toUpperCase(), url: requestUrl(url) });
        } catch (e) {
            logger.debug("xhr open failed", e);
        }
        return (origXhrOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
    };
    XHR.prototype.send = function voidSkillBlockerSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
        const meta = xhrMeta.get(this);
        if (active && meta?.method === "GET" && skillListPath(meta.url)) {
            let done = false;
            const apply = () => {
                if (done || this.readyState !== 4) return;
                done = true;
                patchXhr(this);
            };
            this.addEventListener("readystatechange", apply, true);
            this.addEventListener("load", apply, true);
        }
        return origXhrSend!.call(this, body);
    };
}

function unhookXhr() {
    if (!origXhrOpen) return;
    const XHR = pageWindow.XMLHttpRequest;
    XHR.prototype.open = origXhrOpen;
    if (origXhrSend) XHR.prototype.send = origXhrSend;
    origXhrOpen = null;
    origXhrSend = null;
}

function hideCard(text: Text, root: Element, names: string[]) {
    let node = text.parentElement;
    let best: HTMLElement | null = null;
    while (node && node !== root) {
        const content = (node.textContent ?? "").trim();
        if (content.length > 480) break;
        if (!names.some(name => content.includes(name))) break;
        const role = node.getAttribute("role");
        if (role === "tab" || role === "tablist") break;
        if (node instanceof HTMLElement) best = node;
        if (role === "menuitem" || role === "option" || role === "listitem" || node.tagName === "LI" || node.tagName === "BUTTON") break;
        node = node.parentElement;
    }
    if (!best || best === root || best.getAttribute("data-void-skill-hidden") === "1") return;
    best.setAttribute("data-void-skill-hidden", "1");
    best.style.setProperty("display", "none", "important");
}

function scrubSkills() {
    if (!active) return;
    const names = blockedNames();
    if (!names.length) return;
    const doc = pageWindow.document;
    if (!doc) return;
    const roots = doc.querySelectorAll(MENU_ROOTS);
    for (const root of roots) {
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
            const value = current.nodeValue?.trim() ?? "";
            if (value && names.some(name => value.includes(name)) && current instanceof Text) hideCard(current, root, names);
            current = walker.nextNode();
        }
    }
}

function scheduleScrub() {
    if (scrubTimer != null) return;
    scrubTimer = setTimeout(() => {
        scrubTimer = null;
        scrubSkills();
    }, 32);
}

function watchDom() {
    if (observer) return;
    const doc = pageWindow.document;
    if (!doc.body) return;
    observer = new MutationObserver(() => scheduleScrub());
    observer.observe(doc.body, { childList: true, subtree: true });
    scheduleScrub();
}

function unwatchDom() {
    observer?.disconnect();
    observer = null;
    if (scrubTimer != null) {
        clearTimeout(scrubTimer);
        scrubTimer = null;
    }
}

function arm() {
    if (timer != null) clearInterval(timer);
    timer = null;
    if (settings.store.hideOnly) return;
    timer = setInterval(() => { void sweep(); }, pollMs());
    void sweep();
}

function start() {
    active = true;
    if (!origFetch) {
        origFetch = pageWindow.fetch;
        pageWindow.fetch = skillBlockerFetch as typeof fetch;
    }
    hookXhr();
    watchDom();
    arm();
}

function stop() {
    active = false;
    if (timer != null) {
        clearInterval(timer);
        timer = null;
    }
    unwatchDom();
    unhookXhr();
    if (origFetch && pageWindow.fetch === skillBlockerFetch) {
        pageWindow.fetch = origFetch;
        origFetch = null;
    }
}

export default definePlugin({
    name: "SkillBlocker",
    icon: ShieldOffIcon,
    description: "Hide listed private skills, and delete them when they come back.",
    authors: [Devs.p],
    tags: ["privacy"],
    enabledByDefault: true,
    settings,
    startAt: StartAt.TurbopackReady,
    start,
    stop,
    onSettingsChange() {
        if (!active) return;
        arm();
        scheduleScrub();
    },
});
