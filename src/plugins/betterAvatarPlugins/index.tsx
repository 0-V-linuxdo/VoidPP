/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { LayoutGridIcon, type IconProps } from "@components/icons";
import {
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { findByPropsLazy } from "@turbopack/turbopack";
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

function menuSvg(className: string | undefined, ...children: React.ReactNode[]) {
    return (
        <svg
            width="1rem"
            height="1rem"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className ?? "void-settings-menu-icon"}
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

// Grok's ConnectorsIcon / SkillsIcon / CreateBotIcon ignore the menu box:
// ConnectorsIcon strokes a filled puzzle, SkillsIcon is hardcoded to 1.5rem,
// CreateBotIcon is the "new bot" face-plus. Draw the same metaphors at 1rem.
function PluginsIcon(props: IconProps = {}) {
    return <LayoutGridIcon width="1rem" height="1rem" className={props.className ?? "void-settings-menu-icon"} />;
}

function SkillsMenuIcon({ className }: IconProps = {}) {
    return menuSvg(className,
        <path d="M10 7C10 8.79493 8.54493 10.25 6.75 10.25C4.95507 10.25 3.5 8.79493 3.5 7C3.5 5.20507 4.95507 3.75 6.75 3.75C8.54493 3.75 10 5.20507 10 7Z" />,
        <path d="M16.3732 4.34855C16.7528 3.65641 17.7472 3.65641 18.1268 4.34855L20.5514 8.7691C20.9169 9.43553 20.4347 10.25 19.6746 10.25H14.8254C14.0653 10.25 13.5831 9.43553 13.9486 8.7691L16.3732 4.34855Z" />,
        <rect x="3.64844" y="13.75" width="6.2" height="6.2" rx="2" />,
        <path d="M20.5 17C20.5 18.7949 19.0449 20.25 17.25 20.25C15.4551 20.25 14 18.7949 14 17C14 15.2051 15.4551 13.75 17.25 13.75C19.0449 13.75 20.5 15.2051 20.5 17Z" />,
    );
}

function BotsMenuIcon({ className }: IconProps = {}) {
    return menuSvg(className,
        <path d="M14.1 3.5H9.9C7.65979 3.5 6.53969 3.5 5.68404 3.93597C4.93139 4.31947 4.31947 4.93139 3.93597 5.68404C3.5 6.53969 3.5 7.65979 3.5 9.9V14.1C3.5 16.3402 3.5 17.4603 3.93597 18.316C4.31947 19.0686 4.93139 19.6805 5.68404 20.064C6.53969 20.5 7.65979 20.5 9.9 20.5H14.1C16.3402 20.5 17.4603 20.5 18.316 20.064C19.0686 19.6805 19.6805 19.0686 20.064 18.316C20.5 17.4603 20.5 16.3402 20.5 14.1V9.9C20.5 7.65979 20.5 6.53969 20.064 5.68404C19.6805 4.93139 19.0686 4.31947 18.316 3.93597C17.4603 3.5 16.3402 3.5 14.1 3.5Z" />,
        <path d="M9 10.5v2" />,
        <path d="M15 10.5v2" />,
    );
}

const PLUGIN_TABS: { id: string; name: string; icon: (props: IconProps) => React.ReactNode }[] = [
    { id: "connectors", name: "Connectors", icon: PluginsIcon },
    { id: "skills", name: "Skills", icon: SkillsMenuIcon },
    { id: "bots", name: "Bots", icon: BotsMenuIcon },
];

const TAB_INDEX: Record<string, number> = { connectors: 0, skills: 1, bots: 2 };

let pendingTab: string | null = null;

function peekTab() {
    return pendingTab;
}

function clearPending(tab?: string) {
    if (typeof tab === "string" && tab === pendingTab) return;
    pendingTab = null;
}

function pluginsDialog() {
    return [...document.querySelectorAll('[role="dialog"]')].find(dialog =>
        dialog.getAttribute("data-state") === "open"
        && [...dialog.querySelectorAll("h1, h2")].some(heading => heading.textContent?.trim() === "Plugins"),
    );
}

function syncTabDom(tab: string, attempt = 0) {
    if (pendingTab !== tab || attempt > 12) return;
    const button = pluginsDialog()?.querySelector("[role=tablist]")?.querySelectorAll('[role="tab"]')[TAB_INDEX[tab] ?? -1];
    if (!(button instanceof HTMLElement)) {
        requestAnimationFrame(() => syncTabDom(tab, attempt + 1));
        return;
    }
    if (button.getAttribute("aria-selected") === "true") {
        pendingTab = null;
        return;
    }
    button.click();
    requestAnimationFrame(() => syncTabDom(tab, attempt + 1));
}

function openPlugins(tab: string) {
    pendingTab = tab;
    PluginsDialogStore.usePluginsDialogStore.getState().setOpen(true);
    requestAnimationFrame(() => syncTabDom(tab));
}

function applyTab(local: boolean, state: string | null, setState: (tab: string) => void): string | null {
    if (!local || !pendingTab) return null;
    if (pendingTab !== state) setState(pendingTab);
    return pendingTab;
}

function PluginsMenu() {
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <PluginsIcon className="void-settings-menu-icon" />
                Plugins
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
                {PLUGIN_TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <DropdownMenuItem key={tab.id} onSelect={() => openPlugins(tab.id)}>
                            <Icon className="void-settings-menu-icon" />
                            {tab.name}
                        </DropdownMenuItem>
                    );
                })}
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

    _peekTab: () => peekTab(),

    _clearPending: (tab?: string) => clearPending(tab),

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
            replacement: [
                {
                    match: /\[(\i),(\i)\]=\(0,(\i)\.useState\)\(null\),(\i)=(\i)\?\1:"skills-and-connectors"===(\i)\.page\?\6\.tab:null/,
                    replace: '[$1,$2]=(0,$3.useState)($self._peekTab()),$4=($self._applyTab($5,$1,$2)??($5?$1:"skills-and-connectors"===$6.page?$6.tab:null))',
                },
                {
                    match: /(\i)\)return void (\i)\((\i)\);(\i)\.replace\(\{page:"skills-and-connectors",tab:\3\}\)\}/,
                    replace: '$1)return ($self._clearPending($3),void $2($3));$4.replace({page:"skills-and-connectors",tab:$3})}',
                },
            ],
        },
    ],
});
