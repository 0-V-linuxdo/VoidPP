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

const logger = new Logger("SkillBlocker");

const settings = definePluginSettings({
    blockedSkills: {
        type: OptionType.STRING,
        description: "Private skill names to delete whenever they reappear. Separate names with commas.",
        default: "remote-helium-sop",
    },
    pollInterval: {
        type: OptionType.NUMBER,
        description: "Seconds between checks. Minimum 5.",
        default: 30,
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when a blocked skill is removed.",
        default: true,
    },
});

let timer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;
let active = false;
let origFetch: typeof fetch | null = null;

function blockedNames(): string[] {
    return settings.store.blockedSkills.split(/[\n,]/).map(name => name.trim()).filter(Boolean);
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

function isSkillWrite(input: RequestInfo | URL, init?: RequestInit): boolean {
    const method = requestMethod(input, init);
    if (method === "GET" || method === "HEAD" || method === "DELETE") return false;
    return requestUrl(input).includes(SKILLS_PATH);
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
}

async function sweep() {
    if (!active || sweeping || !origFetch) return;
    const names = blockedNames();
    if (!names.length) return;
    sweeping = true;
    try {
        const res = await origFetch.call(pageWindow, SKILLS_PATH, { credentials: "include" });
        if (!res.ok) return;
        let data: { skills?: { name?: string }[] };
        try {
            data = await res.json();
        } catch (e) {
            logger.warn("Skill list was not JSON", e);
            return;
        }
        const blocked = new Set(names);
        const hits = (data.skills ?? []).flatMap(skill => {
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
    const promise = origFetch!.call(pageWindow, input, init);
    if (!active || !isSkillWrite(input, init)) return promise;
    return promise.then(res => {
        if (res.ok) void sweep();
        return res;
    });
}

function arm() {
    if (timer != null) clearInterval(timer);
    timer = setInterval(() => { void sweep(); }, pollMs());
    void sweep();
}

function start() {
    active = true;
    if (!origFetch) {
        origFetch = pageWindow.fetch;
        pageWindow.fetch = skillBlockerFetch as typeof fetch;
    }
    arm();
}

function stop() {
    active = false;
    if (timer != null) {
        clearInterval(timer);
        timer = null;
    }
    if (origFetch && pageWindow.fetch === skillBlockerFetch) {
        pageWindow.fetch = origFetch;
        origFetch = null;
    }
}

export default definePlugin({
    name: "SkillBlocker",
    icon: ShieldOffIcon,
    description: "Delete listed private skills whenever they reappear.",
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
    },
});
