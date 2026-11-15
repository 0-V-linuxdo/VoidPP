/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SparklesIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin from "@utils/types";

const STYLE_NAME = "noComposerSuggestions";

const CSS = `
[data-slot="composer-suggestions"],
div:has(> [data-slot="composer-suggestions"]) {
    display: none !important;
}
`;

export default definePlugin({
    name: "NoComposerSuggestions",
    icon: SparklesIcon,
    description: "Hide the Suggested chips under the home composer (Create an image, Check email, …).",
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
