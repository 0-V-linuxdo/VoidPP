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
            all: true,
            replacement: [
                {
                    match: /BuildStarters:function\((\i)\)\{/,
                    replace: "BuildStarters:function($1){return null;",
                    noWarn: true,
                },
                {
                    match: /(?=\(0,\i\.jsx\)\(\i\.f\.div,\{className:"flex w-full flex-col items-center pt-1 pb-2)/,
                    replace: "true?null:",
                    noWarn: true,
                },
            ],
        },
        {
            // Desktop home renders `k?(0,jsx)(S.home.BuildStarters,{chips,…}):null`.
            find: ".home.BuildStarters,{chips:",
            replacement: {
                match: /\(0,(\i)\.jsx\)\((\i\.home\.BuildStarters),\{chips:/,
                replace: "null&&(0,$1.jsx)($2,{chips:",
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
