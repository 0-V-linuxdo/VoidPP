/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Flex, Paragraph, Text, Textarea } from "@components";
import { TextCursorInputIcon } from "@components/icons";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { React } from "@turbopack/common/react";
import { RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory, registerStyle, unregisterStyle } from "@utils/css";
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
    return text.replaceAll(/\\/g, "\\\\").replaceAll(/"/g, "\\\"").replaceAll(/\n/g, "\\A ");
}

const settings = definePluginSettings({
    phrases: {
        type: OptionType.COMPONENT,
        default: DEFAULT_PHRASES,
        component: PhrasesEditor,
    },
}).withPrivateSettings<{ phrases: string; greetIndex: number }>();

function PhrasesEditor() {
    const { phrases } = settings.use(["phrases"]);
    return (
        <Flex flexDirection="column" gap="0.5rem" className={cl("root")}>
            <Flex flexDirection="column" gap="0">
                <Text size="sm" weight="medium">Phrases</Text>
                <Paragraph>One phrase per line. Used for the input placeholder and the non-project home greeting. Empty list uses Grok's defaults.</Paragraph>
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

function routeKey(s: RoutingStoreState): string {
    return `${s.route.page ?? ""}|${s.route.workspaceId ?? ""}`;
}

let wasHome = false;

function paintHero(advance: boolean) {
    const list = phrases();
    if (!list) {
        unregisterStyle(HERO_STYLE);
        return;
    }
    const cur = Number(settings.store.greetIndex ?? -1);
    let index = cur >= 0 && cur < list.length ? cur : 0;
    if (advance) {
        index = ((cur >= 0 ? cur : -1) + 1) % list.length;
        settings.store.greetIndex = index;
    }
    const content = escapeForCssContent(list[index] ?? list[0] ?? "");
    registerStyle(
        HERO_STYLE,
        `${HERO_SEL}{font-size:0!important;line-height:0!important;color:transparent!important;visibility:hidden!important}`
        + `${HERO_SEL}>*{display:none!important}`
        + `${HERO_SEL}::before{content:"${content}";display:block!important;visibility:visible!important;`
        + "font-size:1.5rem!important;line-height:1.35!important;font-weight:600!important;"
        + "letter-spacing:-0.48px!important;color:hsl(var(--fg-primary))!important;"
        + "white-space:pre-wrap!important;text-align:center!important;width:100%!important;margin:0 auto!important}",
    );
}

function syncHero(advance: boolean) {
    if (!isNonProjectHome()) {
        wasHome = false;
        unregisterStyle(HERO_STYLE);
        return;
    }
    const shouldAdvance = advance && !wasHome;
    wasHome = true;
    paintHero(shouldAdvance);
}

export default definePlugin({
    name: "Placeholder",
    icon: TextCursorInputIcon,
    description: "Replace the rotating chat input placeholder and the non-project home greeting.",
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
        wasHome = false;
        syncHero(true);
    },

    stop() {
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
