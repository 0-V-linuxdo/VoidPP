/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserRoundXIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_NAME = "noSidebarIdentity";

const FOOTER = '[data-sidebar="footer"]';
const STACK = `${FOOTER} button[data-slot="button"] div.flex.flex-col.items-start.min-w-0.text-left`;
const TEXT_WRAP = `${FOOTER} button[data-slot="button"]>div.min-w-0.flex-1.overflow-hidden,${FOOTER} button[data-state]>div.min-w-0.flex-1.overflow-hidden`;
const MENU_EMAIL = '[role="menu"] [class*="max-w-[400px]"].truncate';

const settings = definePluginSettings({
    hideUsername: {
        type: OptionType.BOOLEAN,
        description: "Hide the username next to the sidebar avatar.",
        default: true,
    },
    hideEmail: {
        type: OptionType.BOOLEAN,
        description: "Hide the email next to the sidebar avatar and at the top of the account menu.",
        default: true,
    },
});

function apply() {
    const rules: string[] = [];
    if (settings.store.hideUsername) {
        rules.push(`${STACK}>:first-child{display:none!important}`);
        rules.push(`${FOOTER} .void-sidebar-name{display:none!important}`);
    }
    if (settings.store.hideEmail) {
        rules.push(`${STACK}>:nth-child(2){display:none!important}`);
        rules.push(`${MENU_EMAIL}{display:none!important}`);
    }
    if (settings.store.hideUsername && settings.store.hideEmail) {
        rules.push(`${TEXT_WRAP}{display:none!important}`);
        rules.push(`${FOOTER} .void-sidebar-info{display:none!important}`);
    }
    registerStyle(STYLE_NAME, rules.join("\n"));
}

export default definePlugin({
    name: "NoSidebarIdentity",
    icon: UserRoundXIcon,
    description: "Hide username and/or email in the Grok sidebar and account menu. Avatar stays clickable.",
    authors: [Devs.p],
    tags: ["privacy"],
    enabledByDefault: true,
    settings,

    patches: [
        {
            find: '"max-w-[400px] truncate"',
            all: true,
            replacement: {
                match: /WD_REFRESH&&(\i)\.user\.email&&/,
                replace: "WD_REFRESH&&!$self.settings.store.hideEmail&&$1.user.email&&",
            },
        },
    ],

    start: apply,
    onSettingsChange: apply,
    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
