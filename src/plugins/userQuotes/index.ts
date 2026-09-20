/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { TextQuoteIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_NAME = "userQuotes";
const SEL = '[data-testid="user-message"] blockquote:not(.twitter-tweet)';

const settings = definePluginSettings({
    italic: {
        type: OptionType.BOOLEAN,
        description: "Render quoted lines in italic.",
        default: true,
    },
    quotes: {
        type: OptionType.BOOLEAN,
        description: "Wrap quoted lines in decorative quotation marks.",
        default: false,
    },
});

function apply() {
    const rules = [
        `${SEL}{margin:0!important;border-inline-start-color:hsl(var(--fg-secondary))!important;border-inline-start-width:0.25rem!important;border-inline-start-style:solid!important;padding-inline-start:0.75rem!important}`,
        `${SEL}>*{margin-block:0!important}`,
    ];
    if (!settings.store.italic) rules.push(`${SEL}{font-style:inherit!important}`);
    if (!settings.store.quotes) {
        rules.push(`${SEL}{quotes:none!important}`);
        rules.push(`${SEL}::before,${SEL}::after,${SEL} p::before,${SEL} p::after{content:none!important}`);
    }
    registerStyle(STYLE_NAME, rules.join("\n"));
}

export default definePlugin({
    name: "UserQuotes",
    icon: TextQuoteIcon,
    description: "Show a visible left bar on quoted lines in your own chat bubbles.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    settings,

    patches: [
        {
            find: '["###### ",',
            replacement: {
                match: /blockquote:(\(\{children:\i\}\)=>\(0,\i\.jsxs?\)\()"p"/,
                replace: 'blockquote:$1"blockquote"',
            },
        },
    ],

    start: apply,
    onSettingsChange: apply,
    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
