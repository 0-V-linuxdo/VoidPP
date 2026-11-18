/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CircleXIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin from "@utils/types";

const STYLE_NAME = "noMergeSubscription";

const CARD = [
    '[role="region"][data-slot="card"][aria-label*="ultimate AI subscription"]',
    '[role="region"][data-slot="card"][aria-label*="合并订阅"]',
    '[role="region"][data-slot="card"][aria-label*="终极 AI 订阅"]',
    '[role="region"][data-slot="card"][aria-label*="终极AI订阅"]',
    '[data-slot="card"]:has(> [data-slot="card-body"] [data-slot="card-title"][title="Unlock the ultimate AI subscription"])',
    '[data-slot="card"]:has(> [data-slot="card-body"] [data-slot="card-description"][title*="under a single account"])',
].join(",");

const CSS = `
${CARD},
div:has(> ${CARD.split(",")[0]}),
div:has(> div > ${CARD.split(",")[0]}),
div:has(> [role="region"][data-slot="card"][aria-label*="合并订阅"]),
div:has(> div > [role="region"][data-slot="card"][aria-label*="合并订阅"]),
div:has(> [role="region"][data-slot="card"][aria-label*="终极 AI 订阅"]),
div:has(> div > [role="region"][data-slot="card"][aria-label*="终极 AI 订阅"]),
div:has(> [role="region"][data-slot="card"][aria-label*="终极AI订阅"]),
div:has(> div > [role="region"][data-slot="card"][aria-label*="终极AI订阅"]) {
    display: none !important;
}
`;

export default definePlugin({
    name: "NoMergeSubscription",
    icon: CircleXIcon,
    description: "Hide the bottom-right unified-subscription card (Grok / Grok Bot / Cursor / X under one account).",
    authors: [Devs.p],
    tags: ["declutter"],
    enabledByDefault: true,

    start() {
        registerStyle(STYLE_NAME, CSS);
    },

    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
