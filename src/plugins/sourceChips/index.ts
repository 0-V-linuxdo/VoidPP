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
 * (`size-5` + `rounded-full` + `overflow-hidden` + `border`) around a 16px
 * image that is also `rounded-full`. `[20261010.6]` only cleared the plate
 * paint. The circular clip stayed, so the ring was still visible.
 * Drop the circle itself: no border, no radius on the plate or the image.
 * Keep the overlap mask and the pill border. */
const CSS = `
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
