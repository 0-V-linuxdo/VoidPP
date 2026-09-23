/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { GrokConnectorsIcon, type IconProps } from "@components/icons";
import { DropdownMenuItem } from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { findByPropsLazy, findExportedComponent } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";

const logger = new Logger("BetterAvatarPlugins");

const PluginsDialogStore = findByPropsLazy("usePluginsDialogStore");

const settings = definePluginSettings({});

const OLD_NAME = "NoSidebarPlugins";
const NEW_NAME = "BetterAvatarPlugins";

function renameList(list: unknown): string[] | undefined {
    if (!Array.isArray(list) || !list.includes(OLD_NAME)) return undefined;
    const seen = new Set<string>();
    const next: string[] = [];
    for (const item of list) {
        if (typeof item !== "string") continue;
        const name = item === OLD_NAME ? NEW_NAME : item;
        if (seen.has(name)) continue;
        seen.add(name);
        next.push(name);
    }
    return next;
}

function migrateLegacy() {
    const bag = PlainSettings.plugins;
    const old = bag[OLD_NAME];
    const meta = bag.Settings;
    const menu = bag.PluginsFlyout?.menuPlugins;
    const known = meta?.knownPlugins;
    const pinned = renameList(meta?.pinnedPlugins);
    const starred = renameList(meta?.starredPlugins);
    const menuRec = menu && typeof menu === "object" && !Array.isArray(menu) ? menu as Record<string, unknown> : undefined;
    const knownRec = known && typeof known === "object" && !Array.isArray(known) ? known as Record<string, unknown> : undefined;
    const menuHas = !!menuRec && OLD_NAME in menuRec;
    const knownHas = !!knownRec && OLD_NAME in knownRec;
    if (!old && !menuHas && !knownHas && !pinned && !starred) return;

    if (old) {
        const target = bag[NEW_NAME] ??= {};
        const keys = Object.keys(target);
        const stub = keys.length === 0 || (keys.length === 1 && keys[0] === "enabled");
        for (const key of Object.keys(old)) {
            if (stub || !(key in target)) target[key] = old[key];
        }
        delete bag[OLD_NAME];
    }

    if (meta) {
        if (pinned) meta.pinnedPlugins = pinned;
        if (starred) meta.starredPlugins = starred;
        if (knownHas && knownRec) {
            if (!(NEW_NAME in knownRec)) knownRec[NEW_NAME] = knownRec[OLD_NAME];
            delete knownRec[OLD_NAME];
        }
    }

    if (menuHas && menuRec) {
        if (!(NEW_NAME in menuRec)) menuRec[NEW_NAME] = menuRec[OLD_NAME];
        delete menuRec[OLD_NAME];
    }

    SettingsStore.markAsChanged();
    logger.info("Migrated NoSidebarPlugins into BetterAvatarPlugins");
}

const pluginName = Object.getOwnPropertyDescriptor(settings, "pluginName");
if (pluginName?.set && pluginName.get) {
    Object.defineProperty(settings, "pluginName", {
        configurable: true,
        enumerable: true,
        get: pluginName.get,
        set(name: string) {
            if (name === NEW_NAME) migrateLegacy();
            pluginName.set!.call(settings, name);
        },
    });
}

function PluginsIcon(props: IconProps = {}) {
    const Comp = findExportedComponent("ConnectorsIcon") ?? GrokConnectorsIcon;
    return <Comp {...props} />;
}

function openPlugins() {
    PluginsDialogStore.usePluginsDialogStore.getState().setOpen(true);
}

function PluginsItem() {
    return (
        <DropdownMenuItem onSelect={openPlugins}>
            <PluginsIcon className="void-settings-menu-icon" />
            Plugins
        </DropdownMenuItem>
    );
}

const WrappedPluginsItem = ErrorBoundary.wrap(PluginsItem);

export default definePlugin({
    name: "BetterAvatarPlugins",
    icon: PluginsIcon,
    description: "Move the sidebar Plugins button into the avatar menu.",
    authors: [Devs.p],
    tags: ["ui"],
    enabledByDefault: true,
    settings,

    _renderItem: () => createElement(WrappedPluginsItem),

    patches: [
        {
            find: "usePluginsDialogStore.getState().setOpen(!0)",
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i\.AppSidebarItem,\{icon:.{0,80}?onClick:\(\)=>\{"skills-and-connectors")/,
                replace: "false&&$1",
            },
        },
        {
            find: 'WD_REFRESH&&{id:"skills-and-connectors"',
            replacement: {
                match: /WD_REFRESH&&\{id:"skills-and-connectors"/,
                replace: 'WD_REFRESH&&!1&&{id:"skills-and-connectors"',
            },
        },
        {
            find: "avatar_menu_click",
            all: true,
            replacement: {
                match: /(?=\(0,\i\.jsxs\)\(\i\.DropdownMenuSub,\{children:\[\(0,\i\.jsxs\)\(\i\.DropdownMenuSubTrigger,\{(?:\i:\i,)*children:\[.{0,100}"user-dropdown\.help")/,
                replace: "$self._renderItem(),",
            },
        },
    ],
});
