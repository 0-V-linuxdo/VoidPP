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
    tags: ["chat", "ui"],
    enabledByDefault: true,

    patches: [
        {
            find: '"BuildModeStarters",0,',
            replacement: {
                match: /"BuildModeStarters",0,/,
                replace: '"BuildModeStarters",0,true?()=>null:',
            },
        },
    ],
});
