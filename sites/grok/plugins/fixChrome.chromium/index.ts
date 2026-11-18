/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChromiumIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "FixChrome",
    icon: ChromiumIcon,
    description: "Fixes Chromium-specific performance issues like backdrop blur lag.",
    authors: [Devs.Prism],
    required: true,

    patches: [
        {
            find: "backdrop-blur-",
            all: true,
            replacement: {
                match: /backdrop-blur-(?:\w+|\[[^\]]+\]) ?/g,
                replace: "",
            },
        },
    ],
});
