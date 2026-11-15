/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { grokSprite, type IconProps } from "@components/icons";
import { accountMenuParts, accountMenuSelect, MenuGlyphIcon } from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { PluginsDialogStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";

const logger = new Logger("ConnectorsFlyout");

const settings = definePluginSettings({});

const NEW_NAME = "ConnectorsFlyout";
const OLD_NAMES = ["AvatarPluginsFlyout", "BetterAvatarPlugins", "NoSidebarPlugins"];

function isOldName(item: unknown): item is string {
    return typeof item === "string" && OLD_NAMES.includes(item);
}

function renameList(list: unknown): string[] | undefined {
    if (!Array.isArray(list) || !list.some(isOldName)) return undefined;
    const seen = new Set<string>();
    const next: string[] = [];
    for (const item of list) {
        if (typeof item !== "string") continue;
        const name = isOldName(item) ? NEW_NAME : item;
        if (seen.has(name)) continue;
        seen.add(name);
        next.push(name);
    }
    return next;
}

function migrateLegacy() {
    const bag = PlainSettings.plugins;
    const meta = bag.Settings;
    const menu = bag.PluginsFlyout?.menuPlugins;
    const known = meta?.knownPlugins;
    const pinned = renameList(meta?.pinnedPlugins);
    const starred = renameList(meta?.starredPlugins);
    const menuRec = menu && typeof menu === "object" && !Array.isArray(menu) ? menu as Record<string, unknown> : undefined;
    const knownRec = known && typeof known === "object" && !Array.isArray(known) ? known as Record<string, unknown> : undefined;
    let moved = false;

    for (const oldName of OLD_NAMES) {
        const old = bag[oldName];
        if (old && typeof old === "object") {
            const target = bag[NEW_NAME] ??= {};
            const keys = Object.keys(target);
            const stub = keys.length === 0 || (keys.length === 1 && keys[0] === "enabled");
            for (const key of Object.keys(old)) {
                if (stub || !(key in target)) target[key] = old[key];
            }
            delete bag[oldName];
            moved = true;
        }
        if (knownRec && oldName in knownRec) {
            if (!(NEW_NAME in knownRec)) knownRec[NEW_NAME] = knownRec[oldName];
            delete knownRec[oldName];
            moved = true;
        }
        if (menuRec && oldName in menuRec) {
            if (!(NEW_NAME in menuRec)) menuRec[NEW_NAME] = menuRec[oldName];
            delete menuRec[oldName];
            moved = true;
        }
    }

    if (meta) {
        if (pinned) {
            meta.pinnedPlugins = pinned;
            moved = true;
        }
        if (starred) {
            meta.starredPlugins = starred;
            moved = true;
        }
    }

    if (!moved) return;
    SettingsStore.markAsChanged();
    logger.info("Migrated AvatarPluginsFlyout, BetterAvatarPlugins, and NoSidebarPlugins into ConnectorsFlyout");
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

const PlugIcon = grokSprite("plug");
const SkillsIcon = grokSprite("library");
const BotsIcon = grokSprite("grok-bot");

const PLUGIN_TABS: { id: string; name: string; icon: (props: IconProps) => React.ReactNode }[] = [
    { id: "connectors", name: "Connectors", icon: PlugIcon },
    { id: "skills", name: "Skills", icon: SkillsIcon },
    { id: "bots", name: "Bots", icon: BotsIcon },
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
        const labels = new Set(tabs.map(button => button.textContent?.trim()));
        if (!labels.has("Connectors") || !labels.has("Skills") || !labels.has("Bots")) continue;
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
    const hook = PluginsDialogStore.usePluginsDialogStore;
    const store = hook && typeof hook.getState === "function" ? hook.getState() : null;
    store?.setOpen(true);
    requestAnimationFrame(() => syncTabDom(tab));
}

function applyTab(local: boolean, state: string | null, setState: (tab: string) => void): string | null {
    if (!local || !pendingTab) return null;
    if (pendingTab !== state) setState(pendingTab);
    return pendingTab;
}

function PluginsMenu() {
    const { Sub, Trigger, Content, Item, desktop } = accountMenuParts();
    return (
        <Sub>
            <Trigger>
                <MenuGlyphIcon icon={PlugIcon} className="void-settings-menu-icon" desktop={desktop} />
                Connect Apps
            </Trigger>
            <Content>
                {PLUGIN_TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <Item key={tab.id} {...accountMenuSelect(desktop, () => openPlugins(tab.id))}>
                            <MenuGlyphIcon icon={Icon} className="void-settings-menu-icon" desktop={desktop} />
                            {tab.name}
                        </Item>
                    );
                })}
            </Content>
        </Sub>
    );
}

const PLUGIN_LABELS = new Set(["Plugins", "Skills and Connectors"]);
const PLUGINS_HIDE_ATTR = "data-void-plugins-hide";

let pluginsHideObserver: MutationObserver | null = null;
let pluginsHideRaf = 0;

function pluginControlLabel(el: HTMLElement): string {
    const text = (el.innerText || "").replaceAll(/\s+/g, " ").trim();
    if (text) return text;
    return (el.getAttribute("aria-label") || "").trim();
}

function hideSidebarPlugins() {
    const sidebar = document.querySelector("#app-sidebar, [data-sidebar=sidebar]");
    if (!sidebar) return;
    for (const el of sidebar.querySelectorAll<HTMLElement>("a, button")) {
        if (el.closest("[role=menu], [role=menuitem], [data-radix-popper-content-wrapper]")) continue;
        if (!PLUGIN_LABELS.has(pluginControlLabel(el))) continue;
        const row = el.closest<HTMLElement>("[data-sidebar=menu-item]") ?? el;
        row.setAttribute(PLUGINS_HIDE_ATTR, "1");
        row.style.setProperty("display", "none", "important");
    }
}

function scheduleSidebarPluginsHide() {
    if (pluginsHideRaf) return;
    pluginsHideRaf = requestAnimationFrame(() => {
        pluginsHideRaf = 0;
        hideSidebarPlugins();
    });
}

export function armSidebarPluginsHide() {
    hideSidebarPlugins();
    if (pluginsHideObserver) return;
    pluginsHideObserver = new MutationObserver(scheduleSidebarPluginsHide);
    pluginsHideObserver.observe(document.documentElement, { childList: true, subtree: true });
}

export function stopSidebarPluginsHide() {
    pluginsHideObserver?.disconnect();
    pluginsHideObserver = null;
    if (pluginsHideRaf) cancelAnimationFrame(pluginsHideRaf);
    pluginsHideRaf = 0;
    for (const el of document.querySelectorAll<HTMLElement>(`[${PLUGINS_HIDE_ATTR}]`)) {
        el.style.removeProperty("display");
        el.removeAttribute(PLUGINS_HIDE_ATTR);
    }
}

const WrappedPluginsMenu = ErrorBoundary.wrap(PluginsMenu);

export default definePlugin({
    name: NEW_NAME,
    icon: PlugIcon,
    description: "Put Connect Apps, Skills, and Bots in the avatar menu.",
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

    start() {
        armSidebarPluginsHide();
    },

    stop() {
        stopSidebarPluginsHide();
    },

    patches: [
        {
            find: '"skills-and-connectors"!==',
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i(?:\.\i)?,\{icon:.{0,180}?onClick:\(\)=>\{"skills-and-connectors")/,
                replace: "false&&$1",
            },
        },
        {
            find: "usePluginsDialogStore.getState().setOpen(!0)",
            noWarn: true,
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i\.AppSidebarItem,\{icon:.{0,80}?onClick:\(\)=>\{"skills-and-connectors")/,
                replace: "false&&$1",
            },
        },
        {
            find: 'WD_REFRESH&&{id:"skills-and-connectors"',
            noWarn: true,
            replacement: {
                match: /WD_REFRESH&&\{id:"skills-and-connectors"/,
                replace: 'WD_REFRESH&&!1&&{id:"skills-and-connectors"',
            },
        },
        {
            find: "avatar_menu_click",
            all: true,
            replacement: [
                {
                    match: /(?=\(0,\i\.jsxs\)\(\i\.W,\{children:\[\(0,\i\.jsxs\)\(\i\.f,\{ref:\i,children:\[.{0,260}"user-dropdown\.help")/,
                    replace: "$self._renderItem(),",
                },
                {
                    match: /(?=\(0,\i\.jsxs\)\(\i\.DropdownMenuSub,\{children:\[\(0,\i\.jsxs\)\(\i\.DropdownMenuSubTrigger,\{(?:\i:\i,)*children:\[.{0,240}"user-dropdown\.help")/,
                    replace: "$self._renderItem(),",
                    noWarn: true,
                },
            ],
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
                    replace: "$1[0]!==$self._shellKey($2)?($3=(0,$4.jsx)($5,{inDialog:!0,localTabs:$2,key:$self._shellKey($2)}),$1[0]=$self._shellKey($2),$1[1]=$3):$3=$1[1]",
                    noWarn: true,
                },
            ],
        },
        {
            find: "SkillsAndConnectorsPageContent",
            all: true,
            noWarn: true,
            replacement: {
                match: /(\i)\[(\d+)\]!==(\i)\?\((\i)=\(0,(\i)\.jsx\)\(([A-Za-z_$][\w$.]*),\{inDialog:!0,localTabs:\3\}\),\1\[\2\]=\3,\1\[(\d+)\]=\4\):\4=\1\[\7\]/g,
                replace: "$1[$2]!==$self._shellKey($3)?($4=(0,$5.jsx)($6,{inDialog:!0,localTabs:$3,key:$self._shellKey($3)}),$1[$2]=$self._shellKey($3),$1[$7]=$4):$4=$1[$7]",
            },
        },
        {
            // Desktop account menu: insert Connect Apps before the Help submenu in the item list.
            find: '"user-dropdown.help","Help"',
            all: true,
            replacement: {
                match: /(children:\[)(\i,\i,\i,\i,)(\i,\i,\i,\i\])([\s\S]{0,220}?function \i\(e\)\{return e\.toggleOpen\})/,
                replace: "$1$2$self._renderItem(),$3$4",
            },
        },
    ],
});
