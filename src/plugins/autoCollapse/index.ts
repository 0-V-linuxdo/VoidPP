/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChevronsDownUpIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "AutoCollapse",
    icon: ChevronsDownUpIcon,
    description: "Automatically collapse code blocks in responses.",
    authors: [Devs.Prism],
    tags: ["messages"],

    _collapse: () => true,

    patches: [
        {
            find: ["isInitiallyCollapsed", "showRunCode"],
            all: true,
            replacement: {
                match: /isInitiallyCollapsed:(\i)=!1/g,
                replace: "isInitiallyCollapsed:$1=$self._collapse()",
            },
        },
    ],
});
