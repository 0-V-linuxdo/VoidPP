/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { OptionType, type Plugin, type PluginSettingDef, type PluginTag } from "@utils/types";

export type InputChangeEvent = { target: { value: string } };

export type ListFilter = "all" | "enabled" | "disabled";

export type PluginCategory = "favorites" | "recent" | "all" | PluginTag;

export const PLUGIN_CATEGORY_TABS: readonly { id: PluginCategory; label: string }[] = [
    { id: "favorites", label: "Favorites" },
    { id: "recent", label: "Recent" },
    { id: "all", label: "All" },
    { id: "composer", label: "Composer" },
    { id: "messages", label: "Messages" },
    { id: "chats", label: "Chats" },
    { id: "media", label: "Media" },
    { id: "navigation", label: "Navigation" },
    { id: "notifications", label: "Notifications" },
    { id: "appearance", label: "Appearance" },
    { id: "declutter", label: "Declutter" },
    { id: "privacy", label: "Privacy" },
    { id: "developer", label: "Developer" },
];

const RECENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isRecentlyUpdated(plugin: Plugin): boolean {
    return plugin.updatedAt != null && Date.now() - plugin.updatedAt < RECENT_TTL_MS;
}

export function pluginMatchesCategory(plugin: Plugin, category: PluginCategory): boolean {
    if (category === "all" || category === "favorites") return true;
    if (category === "recent") return isRecentlyUpdated(plugin);
    return plugin.tags?.includes(category) ?? false;
}

export function isVisibleSetting([, s]: [string, PluginSettingDef]): boolean {
    return s.type !== OptionType.CUSTOM && !s.hidden;
}

export function hasVisibleSettings(plugin: Plugin): boolean {
    return !!plugin.settings?.def && Object.entries(plugin.settings.def).some(isVisibleSetting);
}
