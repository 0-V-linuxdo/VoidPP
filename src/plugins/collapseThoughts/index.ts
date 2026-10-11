/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { LightbulbIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "CollapseThoughts",
    icon: LightbulbIcon,
    description: "Collapse the thought notes under the lightbulb.",
    authors: [Devs.p],
    tags: ["messages"],
    enabledByDefault: true,

    patches: [
        {
            find: 'thoughts-sidepanel.more-notes","+{{count}} more"',
            all: true,
            replacement: {
                match: /\.length>=2,\[(\i),(\i)\]=\(0,(\i)\.useState\)\(!0\)/,
                replace: ".length>=2,[$1,$2]=(0,$3.useState)(!1)",
            },
        },
    ],
});
