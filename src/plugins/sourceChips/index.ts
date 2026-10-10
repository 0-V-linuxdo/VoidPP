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

/* The sources chip is a pill. Each favicon sits in a 20px rounded plate
 * (`size-5` + `border` + `bg-surface`) around a 16px image (`size-4`).
 * That plate is a second circle outside the citation icon. Drop the plate
 * paint only. Keep the overlap mask and the pill border. */
const CSS = `
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) > div.rounded-full.border:has(> img[src*="favicon" i]) {
    border-color: transparent !important;
    background-color: transparent !important;
}
`;

export default definePlugin({
    name: "SourceChips",
    icon: GlobeIcon,
    description: "Drop the extra circle around citation favicons on the sources chip.",
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
