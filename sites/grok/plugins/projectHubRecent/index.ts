/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HistoryIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ProjectHubRecent",
    icon: HistoryIcon,
    description: "On a project's new-chat page, open the Recent tab instead of Suggested.",
    authors: [Devs.p],
    tags: ["navigation"],
    enabledByDefault: true,

    patches: [
        {
            find: ["desktop-shell.project-hub.suggested", "data-project-hub"],
            group: true,
            all: true,
            noWarn: true,
            replacement: {
                match: /\(0,(\i)\.useState\)\("suggested"\)/,
                replace: '(0,$1.useState)("recent")',
            },
        },
    ],
});
