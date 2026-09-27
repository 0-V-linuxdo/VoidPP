/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { ColorSettingRow } from "@components";
import { LinkIcon } from "@components/icons";
import { React } from "@turbopack/common/react";
import { Devs } from "@utils/constants";
import { disableStyle, enableStyle, registerStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const DEFAULT_LINK = "#4a9eff";
const DEFAULT_VISITED = "#9b59b6";
const STYLE_NAME = "better-links-dynamic";

const DOMAIN_RE = /(?<![a-zA-Z0-9@/:.#])(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.(?:com|org|net|io|dev|app|co|ai|gov|edu|me|xyz|gg|tv|cc|so|is|info|tech|pro|site|store|cloud|online|icu|top|be|ly|sh|to|fm|am|us|uk|ca|de|fr|es|it|nl|jp|cn|ru|br|au|in|eu)(?:\/[^\s<>"'`)\]},]*)?/g;

function isValidHex(c: string) {
    return /^#[0-9a-fA-F]{6}$/.test(c);
}

interface PrivateColors {
    linkColor: string;
    visitedColor: string;
}

function getColor(key: keyof PrivateColors, fallback: string): string {
    const val = settings.store[key];
    return val && isValidHex(val) ? val : fallback;
}

function applyColors() {
    const link = getColor("linkColor", DEFAULT_LINK);
    let css = `.void-colored-link{color:${link}!important;text-decoration-color:${link}!important}`;

    if (settings.store.enableVisitedColor) {
        const visited = getColor("visitedColor", DEFAULT_VISITED);
        css += `.void-colored-link:visited{color:${visited}!important;text-decoration-color:${visited}!important}`;
    }

    registerStyle(STYLE_NAME, css);
}

function ColorRow({ settingKey, title, description, fallback }: {
    settingKey: keyof PrivateColors;
    title: string;
    description: string;
    fallback: string;
}) {
    settings.use([settingKey]);

    return (
        <ColorSettingRow
            value={getColor(settingKey, fallback)}
            onChange={v => { settings.store[settingKey] = v; applyColors(); }}
            title={title}
            description={description}
        />
    );
}

const settings = definePluginSettings({
    linkifyDomains: {
        type: OptionType.BOOLEAN,
        description: "Detect bare domains in messages and make them clickable.",
        default: true,
    },
    enableVisitedColor: {
        type: OptionType.BOOLEAN,
        description: "Apply a different color to links you already visited.",
        default: false,
        onChange: applyColors,
    },
    linkColor: {
        type: OptionType.COMPONENT,
        component: () => <ColorRow settingKey="linkColor" title="Link color" description="Colorize links in messages." fallback={DEFAULT_LINK} />,
    },
    visitedColor: {
        type: OptionType.COMPONENT,
        component: () => <ColorRow settingKey="visitedColor" title="Visited color" description="Colorize links you already visited." fallback={DEFAULT_VISITED} />,
    },
}).withPrivateSettings<PrivateColors>();

export default definePlugin({
    name: "BetterLinks",
    icon: LinkIcon,
    description: "Colorize links and detect bare domains in chat messages.",
    authors: [Devs.Prism],
    tags: ["messages"],
    settings,

    patches: [
        {
            find: "chat-markdown:a:link",
            all: true,
            replacement: {
                match: /target:"_blank",rel:"noopener noreferrer nofollow",onClick:/,
                replace: 'target:"_blank",rel:"noopener noreferrer nofollow",className:"void-colored-link",onClick:',
            },
        },
        {
            find: "chat-markdown-load-third-party",
            replacement: {
                match: /singleDollarTextMath:!1\}\],([^\]]{0,200})\]/,
                replace: "singleDollarTextMath:!1}],$1,$self._remarkLinkify]",
            },
        },
    ],

    _remarkLinkify() {
        const { store } = settings;
        return (tree: any) => {
            try {
                if (!store.linkifyDomains) return;

                const walk = (node: any) => {
                    if (!node.children) return;
                    const out: any[] = [];
                    let changed = false;

                    for (const child of node.children) {
                        if (child.type !== "text") {
                            walk(child);
                            out.push(child);
                            continue;
                        }

                        DOMAIN_RE.lastIndex = 0;
                        if (!DOMAIN_RE.test(child.value)) {
                            out.push(child);
                            continue;
                        }

                        DOMAIN_RE.lastIndex = 0;
                        let last = 0;
                        let m: RegExpExecArray | null;

                        while ((m = DOMAIN_RE.exec(child.value)) != null) {
                            if (m.index > last) out.push({ type: "text", value: child.value.slice(last, m.index) });
                            out.push({ type: "link", url: "https://" + m[0], children: [{ type: "text", value: m[0] }] });
                            last = m.index + m[0].length;
                        }

                        if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
                        changed = true;
                    }

                    if (changed) node.children = out;
                };

                walk(tree);
            } catch { return tree; }
        };
    },

    start() {
        settings.store.linkColor ??= DEFAULT_LINK;
        settings.store.visitedColor ??= DEFAULT_VISITED;
        applyColors();
        enableStyle(STYLE_NAME);
    },

    stop() {
        disableStyle(STYLE_NAME);
    },
});
