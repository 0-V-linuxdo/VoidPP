/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { EyeOffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const CSS_CLASSES = {
    sidebarAvatar: "void-streamer-sidebar-avatar",
    sidebarName: "void-streamer-sidebar-name",
    accountAvatar: "void-streamer-account-avatar",
    accountName: "void-streamer-account-name",
    accountEmail: "void-streamer-account-email",
    accountAge: "void-streamer-account-age",
    projects: "void-streamer-projects",
    conversations: "void-streamer-conversations",
} as const;

const settings = definePluginSettings({
    sidebarAvatar: {
        type: OptionType.BOOLEAN,
        description: "Blur your avatar in the sidebar.",
        default: true,
    },
    sidebarName: {
        type: OptionType.BOOLEAN,
        description: "Blur your username in the sidebar.",
        default: true,
    },
    accountAvatar: {
        type: OptionType.BOOLEAN,
        description: "Blur your avatar in the account settings tab.",
        default: true,
    },
    accountName: {
        type: OptionType.BOOLEAN,
        description: "Blur your name in the account settings tab.",
        default: true,
    },
    accountEmail: {
        type: OptionType.BOOLEAN,
        description: "Blur your email in the account settings tab.",
        default: true,
    },
    accountAge: {
        type: OptionType.BOOLEAN,
        description: "Blur your birth year in the account settings tab.",
        default: true,
    },
    projects: {
        type: OptionType.BOOLEAN,
        description: "Blur project names in the sidebar.",
        default: true,
    },
    conversations: {
        type: OptionType.BOOLEAN,
        description: "Blur conversation titles in the sidebar.",
        default: true,
    },
});

function syncClasses() {
    const { classList } = document.documentElement;
    for (const [key, cls] of Object.entries(CSS_CLASSES)) {
        classList.toggle(cls, !!settings.store[key as keyof typeof CSS_CLASSES]);
    }
}

export default definePlugin({
    name: "StreamerMode",
    icon: EyeOffIcon,
    description: "Blurs personal information for privacy while streaming.",
    authors: [Devs.Prism],
    tags: ["privacy"],
    settings,

    start: syncClasses,
    onSettingsChange: syncClasses,

    stop() {
        const { classList } = document.documentElement;
        for (const cls of Object.values(CSS_CLASSES)) {
            classList.remove(cls);
        }
    },
});
