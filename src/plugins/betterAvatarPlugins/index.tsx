/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { GrokConnectorsIcon, SparklesIcon, type IconProps } from "@components/icons";
import {
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { findByPropsLazy, findExportedComponent } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import type { ComponentType } from "react";

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

function BotMenuIcon(props: IconProps = {}) {
    return (
        <svg
            width={props.width ?? props.size ?? "1em"}
            height={props.height ?? props.size ?? "1em"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={props.strokeWidth ?? 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
            aria-hidden="true"
        >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
        </svg>
    );
}

const PLUGIN_TABS: { id: string; name: string; exportName: string; fallback: ComponentType<IconProps> }[] = [
    { id: "connectors", name: "Connectors", exportName: "ConnectorsIcon", fallback: GrokConnectorsIcon },
    { id: "skills", name: "Skills", exportName: "SkillsIcon", fallback: SparklesIcon },
    { id: "bots", name: "Bots", exportName: "CreateBotIcon", fallback: BotMenuIcon },
];

let pendingTab: string | null = null;

function openPlugins(tab: string) {
    pendingTab = tab;
    PluginsDialogStore.usePluginsDialogStore.getState().setOpen(true);
}

function applyTab(local: boolean, state: string | null, setState: (tab: string) => void): string | null {
    if (!local || !pendingTab) return null;
    const next = pendingTab;
    if (next !== state) setState(next);
    else pendingTab = null;
    return next;
}

function TabGlyph({ exportName, fallback: Fallback }: { exportName: string; fallback: ComponentType<IconProps> }) {
    const Comp = findExportedComponent(exportName) ?? Fallback;
    return <Comp className="void-settings-menu-icon" />;
}

function PluginsMenu() {
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <PluginsIcon className="void-settings-menu-icon" />
                Plugins
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
                {PLUGIN_TABS.map(tab => (
                    <DropdownMenuItem key={tab.id} onSelect={() => openPlugins(tab.id)}>
                        <TabGlyph exportName={tab.exportName} fallback={tab.fallback} />
                        {tab.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
}

const WrappedPluginsMenu = ErrorBoundary.wrap(PluginsMenu);

export default definePlugin({
    name: "BetterAvatarPlugins",
    icon: PluginsIcon,
    description: "Move the sidebar Plugins button into the avatar menu and expand it into Connectors, Skills, and Bots.",
    authors: [Devs.p],
    tags: ["navigation"],
    enabledByDefault: true,
    settings,

    _renderItem: () => createElement(WrappedPluginsMenu),

    _applyTab(local: boolean, state: string | null, setState: (tab: string) => void) {
        return applyTab(local, state, setState);
    },

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
        {
            find: "SkillsAndConnectorsPage:handleTabChange",
            replacement: {
                match: /\[(\i),(\i)\]=\(0,(\i)\.useState\)\(null\),(\i)=(\i)\?\1:"skills-and-connectors"===(\i)\.page\?\6\.tab:null/,
                replace: '[$1,$2]=(0,$3.useState)(null),$4=($self._applyTab($5,$1,$2)??($5?$1:"skills-and-connectors"===$6.page?$6.tab:null))',
            },
        },
    ],
});
