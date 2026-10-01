/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { GrokConnectorsIcon, type IconProps } from "@components/icons";
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

function menuSvg(className: string | undefined, filled: boolean, ...children: React.ReactNode[]) {
    return (
        <svg
            width="1rem"
            height="1rem"
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"}
            stroke={filled ? "none" : "currentColor"}
            strokeWidth={filled ? undefined : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className ?? "void-settings-menu-icon"}
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

function PluginsIcon(props: IconProps = {}) {
    return <GrokConnectorsIcon width="1rem" height="1rem" className={props.className ?? "void-settings-menu-icon"} />;
}

function ConnectorsMenuIcon({ className }: IconProps = {}) {
    return <GrokConnectorsIcon width="1rem" height="1rem" className={className ?? "void-settings-menu-icon"} />;
}

function SkillsMenuIcon({ className }: IconProps = {}) {
    return menuSvg(className, false,
        <path d="M10 7C10 8.79493 8.54493 10.25 6.75 10.25C4.95507 10.25 3.5 8.79493 3.5 7C3.5 5.20507 4.95507 3.75 6.75 3.75C8.54493 3.75 10 5.20507 10 7Z" />,
        <path d="M16.3732 4.34855C16.7528 3.65641 17.7472 3.65641 18.1268 4.34855L20.5514 8.7691C20.9169 9.43553 20.4347 10.25 19.6746 10.25H14.8254C14.0653 10.25 13.5831 9.43553 13.9486 8.7691L16.3732 4.34855Z" />,
        <rect x="3.64844" y="13.75" width="6.2" height="6.2" rx="2" />,
        <path d="M20.5 17C20.5 18.7949 19.0449 20.25 17.25 20.25C15.4551 20.25 14 18.7949 14 17C14 15.2051 15.4551 13.75 17.25 13.75C19.0449 13.75 20.5 15.2051 20.5 17Z" />,
    );
}

function BotsMenuIcon({ className }: IconProps = {}) {
    return menuSvg(className, true,
        <path d="M15 13H13V9H15V13Z" />,
        <path d="M19 13H17V9H19V13Z" />,
        <path fillRule="evenodd" clipRule="evenodd" d="M15 4C19.4183 4 23 7.58172 23 12C23 16.4183 19.4183 20 15 20C10.5817 20 7 16.4183 7 12C7 7.58172 10.5817 4 15 4ZM15 6C11.6863 6 9 8.68629 9 12C9 15.3137 11.6863 18 15 18C18.3137 18 21 15.3137 21 12C21 8.68629 18.3137 6 15 6Z" />,
        <path d="M8.99902 4C8.08913 4.68362 7.3005 5.51941 6.66895 6.46875C4.51293 7.37847 3 9.5129 3 12C3 14.487 4.51312 16.6205 6.66895 17.5303C7.30047 18.4797 8.08911 19.3153 8.99902 19.999C4.58119 19.9985 1 16.418 1 12C1 7.58205 4.58119 4.00053 8.99902 4Z" />,
    );
}

const PLUGIN_TABS: { id: string; name: string; icon: (props: IconProps) => React.ReactNode }[] = [
    { id: "connectors", name: "Connectors", icon: ConnectorsMenuIcon },
    { id: "skills", name: "Skills", icon: SkillsMenuIcon },
    { id: "bots", name: "Bots", icon: BotsMenuIcon },
];

let pendingTab: string | null = null;
let latchedTab = "";

function peekTab() {
    return pendingTab;
}

function shellKey(local: boolean) {
    if (pendingTab) latchedTab = pendingTab;
    return `${local ? 1 : 0}:${latchedTab}`;
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

function pillButton(tab: string) {
    const name = PLUGIN_TABS.find(item => item.id === tab)?.name;
    if (!name) return null;
    const lists = pluginsDialog()?.querySelectorAll("[role=tablist]");
    if (!lists) return null;
    for (const list of lists) {
        const tabs = [...list.querySelectorAll('[role="tab"]')];
        const labels = tabs.map(button => button.textContent?.trim());
        if (!labels.includes("Connectors") || !labels.includes("Skills") || !labels.includes("Bots")) continue;
        const button = tabs.find(item => item.textContent?.trim() === name);
        if (button instanceof HTMLElement) return button;
    }
    return null;
}

function syncTabDom(tab: string, attempt = 0) {
    if (pendingTab !== tab || attempt > 12) return;
    const button = pillButton(tab);
    if (!button) {
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
    latchedTab = tab;
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

    _shellKey: (local: boolean) => shellKey(local),

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
                {
                    match: /(\i)\[0\]!==(\i)\?\((\i)=\(0,(\i)\.jsx\)\((\i),\{inDialog:!0,localTabs:\2\}\),\1\[0\]=\2,\1\[1\]=\3\):\3=\1\[1\]/,
                    replace: '$1[0]!==$self._shellKey($2)?($3=(0,$4.jsx)($5,{inDialog:!0,localTabs:$2,key:$self._shellKey($2)}),$1[0]=$self._shellKey($2),$1[1]=$3):$3=$1[1]',
                },
            ],
        },
    ],
});
