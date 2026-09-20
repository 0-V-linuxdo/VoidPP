/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Flex, InfoHint, Text, Textarea } from "@components";
import { TextCursorInputIcon } from "@components/icons";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { React } from "@turbopack/common/react";
import { RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory, registerStyle, unregisterStyle } from "@utils/css";
import { clamp } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

const cl = classNameFactory("void-ph-");
const HERO_STYLE = "placeholderHero";
const HERO_SEL = "h1[data-void-ph-hero]";

const DEFAULT_PHRASES = [
    "Ask not what your country can do for you — ask what you can do for your country.",
    "It always seems impossible until it is done.",
    "The best way to predict the future is to create it.",
].join("\n");

function parsePhrases(raw: unknown): string[] {
    return String(raw ?? "").split("\n").map(s => s.trim()).filter(Boolean);
}

function escapeForCssContent(text: string): string {
    return text.replaceAll("\\", "\\\\").replaceAll('"', "\\\"").replaceAll("\n", "\\A ");
}

const settings = definePluginSettings({
    mode: {
        type: OptionType.SELECT,
        description: "When to rotate the home greeting.",
        options: [
            { label: "Each visit to home", value: "refresh", default: true },
            { label: "Timer while on home", value: "interval" },
            { label: "Click the title", value: "manual" },
        ],
    },
    order: {
        type: OptionType.SELECT,
        description: "Order of the greeting list.",
        options: [
            { label: "Sequential", value: "sequential", default: true },
            { label: "Random", value: "random" },
        ],
    },
    intervalSec: {
        type: OptionType.SLIDER,
        description: "Seconds between rotations (timer mode).",
        min: 1,
        max: 3600,
        default: 10,
    },
    phrases: {
        type: OptionType.COMPONENT,
        default: DEFAULT_PHRASES,
        component: PhrasesEditor,
    },
}).withPrivateSettings<{ phrases: string; greetIndex: number; lastRandom: number }>();

function PhrasesEditor() {
    const { phrases } = settings.use(["phrases"]);
    return (
        <Flex flexDirection="column" gap="0.5rem" className={cl("root")}>
            <Flex alignItems="center" gap="0.375rem">
                <Text size="sm" weight="medium">Phrases</Text>
                <InfoHint>One phrase per line. Used for the input placeholder and the non-project home greeting. Empty list uses Grok's defaults.</InfoHint>
            </Flex>
            <div className={cl("textarea-wrap")}>
                <Textarea
                    className={cl("textarea")}
                    value={phrases ?? DEFAULT_PHRASES}
                    onChange={e => { settings.store.phrases = e.target.value; }}
                    placeholder={DEFAULT_PHRASES}
                />
            </div>
        </Flex>
    );
}

function isNonProjectHome(): boolean {
    try {
        const { page, workspaceId } = RoutingStore.useRoutingStore.getState().route;
        return page === "main" && !workspaceId;
    } catch {
        const path = location.pathname.replace(/\/+$/, "") || "/";
        return path === "/";
    }
}

function phrases(): string[] | null {
    try {
        const lines = parsePhrases(settings.store.phrases ?? DEFAULT_PHRASES);
        return lines.length ? lines : null;
    } catch {
        return null;
    }
}

function rotateMode(): "refresh" | "interval" | "manual" {
    const value = String(settings.store.mode ?? "refresh");
    if (value === "interval" || value === "manual") return value;
    return "refresh";
}

function rotateOrder(): "sequential" | "random" {
    return settings.store.order === "random" ? "random" : "sequential";
}

function intervalMs(): number {
    return clamp(Number(settings.store.intervalSec ?? 10), 1, 3600) * 1000;
}

function routeKey(s: RoutingStoreState): string {
    return `${s.route.page ?? ""}|${s.route.workspaceId ?? ""}`;
}

let started = false;
let wasHome = false;
let timerId: ReturnType<typeof setInterval> | undefined;
let clicks: AbortController | null = null;

function pickNextIndex(listLen: number, advance: boolean): number {
    if (listLen <= 0) return 0;
    const current = Number(settings.store.greetIndex ?? -1);
    const last = Number(settings.store.lastRandom ?? -1);
    if (listLen === 1) {
        if (current !== 0) settings.store.greetIndex = 0;
        if (last !== 0) settings.store.lastRandom = 0;
        return 0;
    }
    if (!advance) return current >= 0 && current < listLen ? current : 0;
    if (rotateOrder() === "random") {
        const prev = current >= 0 && current < listLen ? current : last;
        let next = Math.floor(Math.random() * listLen);
        let guard = 0;
        while (next === prev && guard++ < 10) next = Math.floor(Math.random() * listLen);
        settings.store.greetIndex = next;
        settings.store.lastRandom = next;
        return next;
    }
    const prev = current >= -1 && current < listLen ? current : -1;
    const next = (prev + 1) % listLen;
    settings.store.greetIndex = next;
    return next;
}

function paintHero(advance: boolean) {
    if (!started || !isNonProjectHome()) {
        unregisterStyle(HERO_STYLE);
        return;
    }
    const list = phrases();
    if (!list) {
        unregisterStyle(HERO_STYLE);
        return;
    }
    const index = pickNextIndex(list.length, advance);
    const content = escapeForCssContent(list[index] ?? list[0] ?? "");
    const clickable = rotateMode() === "manual" && list.length > 1;
    registerStyle(
        HERO_STYLE,
        `${HERO_SEL}{font-size:0!important;line-height:0!important;color:transparent!important}`
        + `${HERO_SEL}>*{display:none!important}`
        + `${HERO_SEL}::before{content:"${content}";display:block!important;`
        + "font-size:1.5rem!important;line-height:1.35!important;font-weight:600!important;"
        + "letter-spacing:-0.48px!important;color:hsl(var(--fg-primary))!important;"
        + "white-space:pre-wrap!important;text-align:center!important;width:100%!important;margin:0 auto!important}"
        + (clickable ? `${HERO_SEL}{cursor:pointer!important;user-select:none!important}` : ""),
    );
}

function stopTimer() {
    if (timerId === undefined) return;
    clearInterval(timerId);
    timerId = undefined;
}

function startTimerIfNeeded() {
    stopTimer();
    if (!started || !isNonProjectHome()) return;
    if (rotateMode() !== "interval") return;
    const list = phrases();
    if (!list || list.length <= 1) return;
    timerId = setInterval(() => paintHero(true), intervalMs());
}

function enterHome() {
    const first = !wasHome;
    wasHome = true;
    paintHero(first && rotateMode() === "refresh");
    startTimerIfNeeded();
}

function leaveHome() {
    wasHome = false;
    stopTimer();
    unregisterStyle(HERO_STYLE);
}

function syncHero(fromRoute: boolean) {
    if (!started) return;
    if (!isNonProjectHome()) {
        leaveHome();
        return;
    }
    if (fromRoute) enterHome();
    else {
        paintHero(false);
        startTimerIfNeeded();
    }
}

function onManualClick(e: Event) {
    if (!started || !isNonProjectHome()) return;
    if (rotateMode() !== "manual") return;
    const list = phrases();
    if (!list || list.length <= 1) return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el?.closest(HERO_SEL)) return;
    const sel = window.getSelection?.();
    if (sel && String(sel).trim()) return;
    paintHero(true);
}

export default definePlugin({
    name: "Placeholder",
    icon: TextCursorInputIcon,
    description: "Replace the rotating chat input placeholder and the non-project home greeting. Rotate the greeting on visit, a timer, or a click.",
    authors: [Devs.p],
    tags: ["chat"],
    settings,

    _phrases() {
        return phrases();
    },

    _inputPlaceholder(value: unknown) {
        if (typeof value !== "string") return value;
        return this._phrases()?.[0] ?? value;
    },

    start() {
        started = true;
        wasHome = false;
        clicks = new AbortController();
        document.addEventListener("click", onManualClick, { signal: clicks.signal });
        syncHero(true);
    },

    stop() {
        started = false;
        clicks?.abort();
        clicks = null;
        stopTimer();
        wasHome = false;
        unregisterStyle(HERO_STYLE);
    },

    onSettingsChange() {
        syncHero(false);
    },

    zustand: {
        RoutingStore: {
            selector: routeKey,
            handler() { syncHero(true); },
        },
    },

    patches: [
        {
            find: 'query-bar-placeholder.whats-on-your-mind","What\'s on your mind?"',
            group: true,
            replacement: [
                {
                    match: /:\[g\("query-bar-placeholder\.1",/,
                    replace: ':($self._phrases()??[g("query-bar-placeholder.1",',
                },
                {
                    match: /g\("query-bar-placeholder\.whats-on-your-mind","What's on your mind\?"\)(?=\],\[)/,
                    replace: "$&)",
                },
            ],
        },
        {
            find: "data-query-bar-mode-select",
            all: true,
            replacement: {
                match: /("query-bar\.voice-connecting-placeholder","Connecting…"\):)(\i)(?=,isLoading)/,
                replace: "$1$self._inputPlaceholder($2)",
            },
        },
        {
            find: '"WdRefreshHeading",0,',
            replacement: {
                match: /("h1",\{className:\i),children:/,
                replace: '$1,"data-void-ph-hero":"",children:',
            },
        },
    ],
});
