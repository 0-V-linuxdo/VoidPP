/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Link2OffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_NAME = "noShareLink";

const settings = definePluginSettings({
    hideShareProject: {
        type: OptionType.BOOLEAN,
        description: "Inside a project: hide the top-right Share Project button.",
        default: true,
    },
    hideCreateShareLink: {
        type: OptionType.BOOLEAN,
        description: "Not in a project: hide the top-right Create share link button on chats.",
        default: true,
    },
});

function apply() {
    const rules: string[] = [];
    if (settings.store.hideShareProject) {
        rules.push('button[aria-label="Share Project"]{display:none!important}');
    }
    if (settings.store.hideCreateShareLink) {
        rules.push('button[aria-label="Create share link"]{display:none!important}');
    }
    registerStyle(STYLE_NAME, rules.join("\n"));
}

export default definePlugin({
    name: "NoShareLink",
    icon: Link2OffIcon,
    description: "Hide share buttons: Share Project (in a project) and Create share link (top-right of chats).",
    authors: [Devs.p],
    tags: ["declutter", "privacy"],
    enabledByDefault: true,
    settings,

    start: apply,
    onSettingsChange: apply,
    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
