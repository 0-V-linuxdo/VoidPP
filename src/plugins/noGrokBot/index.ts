/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BotOffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin from "@utils/types";

const STYLE_NAME = "noGrokBot";

const CSS = `
#grok-bot-nav-button,
div:has(> #grok-bot-nav-button),
#promo-portal [aria-label*="Grok Bot"],
a[href*="grok_bot_upsell"],
a[href*="utm_medium=nav-button"][href*="x.ai/bot"],
a[aria-label="Open Grok Bot"],
a[aria-label="Download Grok Bot"],
button[aria-label="Open Grok Bot"],
button[aria-label="Download Grok Bot"],
button[aria-label^="Get Grok Bot"],
[class*="@container/nav"] a:has(.grok-bot-eye),
[class*="@container/nav"] button:has(.grok-bot-eye),
span:has(> a[href*="grok_bot_upsell"]),
span:has(> a[aria-label="Open Grok Bot"]),
span:has(> a[aria-label="Download Grok Bot"]),
span:has(> button[aria-label="Open Grok Bot"]),
span:has(> button[aria-label="Download Grok Bot"]),
span:has(> button[aria-label^="Get Grok Bot"]),
span:has(> [aria-label*="Grok Bot"]) {
    display: none !important;
}
`;

export default definePlugin({
    name: "NoGrokBot",
    icon: BotOffIcon,
    description: "Hide the top-right Grok Bot promo button.",
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
