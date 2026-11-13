/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { LightbulbIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoBuildStarters",
    icon: LightbulbIcon,
    description: "Hide the Build mode Ideas chips above the input.",
    authors: [Devs.p],
    tags: ["declutter"],
    enabledByDefault: true,

    patches: [
        {
            find: "build-mode-starters.more",
            replacement: {
                match: /(?=\(0,\i\.jsx\)\(\i\.f\.div,\{className:"flex w-full flex-col items-center pt-1 pb-2)/,
                replace: "true?null:",
            },
        },
        {
            find: '"BuildModeStarters",0,',
            noWarn: true,
            replacement: {
                match: /"BuildModeStarters",0,/,
                replace: '"BuildModeStarters",0,true?()=>null:',
            },
        },
    ],
});
