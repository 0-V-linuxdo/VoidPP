/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GlobeIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin from "@utils/types";

const STYLE_NAME = "sourceChips";

/* The sources chip is a pill (`border border-border-l1`). Each favicon sits
 * in a 20px rounded plate around a 16px image. `[20261010.7]` dropped the
 * plate circle and left the pill border. `[20261010.8]` drops that border
 * too. Keep the pill fill, the label, and the overlap mask. */
const CSS = `
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) {
    border: 0 !important;
    box-shadow: none !important;
}
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) > div:has(> img[src*="favicon" i]) {
    border: 0 !important;
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    border-radius: 0 !important;
}
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) img[src*="favicon" i] {
    border-radius: 0 !important;
}
`;

export default definePlugin({
    name: "SourceChips",
    icon: GlobeIcon,
    description: "Drop the circle around citation favicons and the sources chip border.",
    authors: [Devs.p],
    tags: ["messages", "declutter"],
    enabledByDefault: true,

    start() {
        registerStyle(STYLE_NAME, CSS);
    },
    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
