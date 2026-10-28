/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { LightbulbIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    collapseSingle: {
        type: OptionType.BOOLEAN,
        description: "Also collapse a thought that has only one note.",
        default: true,
    },
});

export default definePlugin({
    name: "CollapseThoughts",
    icon: LightbulbIcon,
    description: "Collapse the thought notes under the lightbulb.",
    authors: [Devs.p],
    tags: ["messages"],
    enabledByDefault: true,
    settings,

    patches: [
        {
            find: 'thoughts-sidepanel.more-notes","+{{count}} more"',
            all: true,
            replacement: [
                {
                    match: /\.length>=2,\[(\i),(\i)\]=\(0,(\i)\.useState\)\(!0\)/,
                    replace: ".length>=($self.settings.store.collapseSingle?1:2),[$1,$2]=(0,$3.useState)(!1)",
                },
                {
                    // Side panel: `[open,set]=(0,x.useState)(!0),text=notes[0]?.text??"",many=notes.length>1`.
                    match: /\[(\i),(\i)\]=\(0,(\i)\.useState\)\(!0\),(\i)=(\i)\[0\]\?\.text\?\?\"\",(\i)=\5\.length>1/,
                    replace: "[$1,$2]=(0,$3.useState)(!1),$4=$5[0]?.text??\"\",$6=$5.length>($self.settings.store.collapseSingle?0:1)",
                },
            ],
        },
    ],
});
