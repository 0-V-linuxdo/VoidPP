/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, migratePluginSetting } from "@api/Settings";
import { ErrorBoundary, Text } from "@components";
import { BracesIcon, grokSprite, PaletteIcon, Settings2Icon, UnplugIcon } from "@components/icons";
import { accountMenuParts, accountMenuSelect, MenuGlyphIcon, type AccountMenuParts } from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { SettingsDialogStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import type { ComponentType } from "react";

import { CogIcon } from "./icons";

const cl = classNameFactory("void-sf-");

const settings = definePluginSettings({
    showOpenSettings: {
        type: OptionType.BOOLEAN,
        description: 'Show "Open Settings" (last used tab).',
        default: true,
    },
    voidppPosition: {
        type: OptionType.SELECT,
        description: "Place Void++ tabs above or below Grok tabs.",
        options: [
            { label: "Above Grok tabs", value: "above", default: true },
            { label: "Below Grok tabs", value: "below" },
        ],
    },
    plugins: {
        type: OptionType.BOOLEAN,
        description: "Plugins",
        default: true,
    },
    themes: {
        type: OptionType.BOOLEAN,
        description: "Themes",
        default: true,
    },
    css: {
        type: OptionType.BOOLEAN,
        description: "Quick CSS",
        default: true,
    },
    account: {
        type: OptionType.BOOLEAN,
        description: "Account",
        default: true,
    },
    appearance: {
        type: OptionType.BOOLEAN,
        description: "Appearance",
        default: true,
    },
    behavior: {
        type: OptionType.BOOLEAN,
        description: "Behavior",
        default: true,
    },
    customize: {
        type: OptionType.BOOLEAN,
        description: "Customize",
        default: true,
    },
    billing: {
        type: OptionType.BOOLEAN,
        description: "Billing",
        default: true,
    },
    usage: {
        type: OptionType.BOOLEAN,
        description: "Usage",
        default: true,
    },
    data: {
        type: OptionType.BOOLEAN,
        description: "Data Controls",
        default: true,
    },
});

type GrokTabSetting = "account" | "appearance" | "behavior" | "customize" | "billing" | "usage" | "data";
type VoidPPTabSetting = "plugins" | "themes" | "css";

interface FlyoutTab {
    id: string;
    name: string;
    icon: ComponentType<{ className?: string }>;
}

interface GrokFlyoutTab extends FlyoutTab {
    setting: GrokTabSetting;
}

interface VoidPPFlyoutTab extends FlyoutTab {
    setting: VoidPPTabSetting;
}

const GROK_TABS: GrokFlyoutTab[] = [
    { id: "account", name: "Account", setting: "account", icon: grokSprite("account") },
    { id: "appearance", name: "Appearance", setting: "appearance", icon: grokSprite("color-mode") },
    { id: "behavior", name: "Behavior", setting: "behavior", icon: grokSprite("sliders") },
    { id: "personality", name: "Customize", setting: "customize", icon: grokSprite("agent") },
    { id: "billing", name: "Billing", setting: "billing", icon: grokSprite("credit-card") },
    { id: "usage", name: "Usage", setting: "usage", icon: grokSprite("chart-bars") },
    { id: "data", name: "Data Controls", setting: "data", icon: grokSprite("shield") },
];

const VOIDPP_TABS: VoidPPFlyoutTab[] = [
    { id: "uspp_voidpp_plugins_tab", name: "Plugins", setting: "plugins", icon: UnplugIcon },
    { id: "uspp_voidpp_themes_tab", name: "Themes", setting: "themes", icon: PaletteIcon },
    { id: "uspp_voidpp_quickcss_tab", name: "Quick CSS", setting: "css", icon: BracesIcon },
];

function openTab(tab: string | undefined, onOpen?: (event?: Event) => void, event?: Event) {
    if (!tab) {
        try { onOpen?.(event); } catch { /* grok's opener can throw; still try the store */ }
    }
    const hook = SettingsDialogStore.useSettingsDialogStore;
    const store = hook && typeof hook.getState === "function" ? hook.getState() : null;
    if (!store) return;
    if (tab) {
        const openTab = (store as { openTab?: (id: string) => void }).openTab;
        if (typeof openTab === "function") {
            openTab(tab);
            return;
        }
        store.setTab(tab);
    }
    store.setOpen(true);
}

function tabItems(tabs: FlyoutTab[], menu: AccountMenuParts) {
    const { Item, desktop } = menu;
    return tabs.map(t => {
        const Icon = t.icon;
        return (
            <Item key={t.id} {...accountMenuSelect(desktop, () => openTab(t.id))}>
                <MenuGlyphIcon icon={Icon} className={cl("menu-icon")} desktop={desktop} />
                {t.name}
            </Item>
        );
    });
}

function VoidPPSection({ tabs, menu }: { tabs: FlyoutTab[]; menu: AccountMenuParts }) {
    if (tabs.length === 0) return null;
    return (
        <>
            <Text size="xs" color="secondary" className={cl("group")}>Void++</Text>
            {tabItems(tabs, menu)}
        </>
    );
}

function SettingsMenu({ onOpen }: { onOpen?: (event?: Event) => void }) {
    const cfg = settings.use([
        "showOpenSettings",
        "voidppPosition",
        "plugins",
        "themes",
        "css",
        "account",
        "appearance",
        "behavior",
        "customize",
        "billing",
        "usage",
        "data",
    ]);
    const menu = accountMenuParts();
    const { Sub, Trigger, Content, Item, Separator, desktop } = menu;

    const grokTabs = GROK_TABS.filter(t => cfg[t.setting]);
    const voidppTabs = VOIDPP_TABS.filter(t => cfg[t.setting]);
    const showOpen = cfg.showOpenSettings || (grokTabs.length === 0 && voidppTabs.length === 0);
    const voidppFirst = cfg.voidppPosition !== "below";
    const hasBoth = grokTabs.length > 0 && voidppTabs.length > 0;

    return (
        <Sub>
            <Trigger>
                <MenuGlyphIcon icon={CogIcon} className={cl("menu-icon")} desktop={desktop} />
                Settings
            </Trigger>
            <Content {...(desktop ? {} : { maxHeight: "lg" })}>
                {showOpen && (
                    <Item {...accountMenuSelect(desktop, event => openTab(undefined, onOpen, event as Event | undefined))}>
                        <MenuGlyphIcon icon={CogIcon} className={cl("menu-icon")} desktop={desktop} />
                        Open Settings
                    </Item>
                )}
                {showOpen && (voidppTabs.length > 0 || grokTabs.length > 0) && <Separator />}
                {voidppFirst && <VoidPPSection tabs={voidppTabs} menu={menu} />}
                {voidppFirst && hasBoth && <Separator />}
                {tabItems(grokTabs, menu)}
                {!voidppFirst && hasBoth && <Separator />}
                {!voidppFirst && <VoidPPSection tabs={voidppTabs} menu={menu} />}
            </Content>
        </Sub>
    );
}

const WrappedSettingsMenu = ErrorBoundary.wrap(SettingsMenu);

export default definePlugin({
    name: "SettingsFlyout",
    icon: Settings2Icon,
    description: "Replace the avatar Settings item with a flyout of shortcuts to Void++ and Grok settings tabs.",
    authors: [Devs.p],
    tags: ["navigation"],
    enabledByDefault: true,
    requiresRestart: true,
    settings,

    start() {
        migratePluginSetting("SettingsFlyout", "voidppPosition", "voidPosition");
    },

    _renderSettingsMenu: (onOpen?: (event?: Event) => void) => createElement(WrappedSettingsMenu, { onOpen }),

    patches: [
        {
            find: '"user-dropdown.settings","Settings"',
            all: true,
            replacement: [
                {
                    match: /\(0,\i\.jsxs?\)\(\i\.r,\{on(?:Select|Click):(\i),children:\[\(0,\i\.jsx\)\("span",\{className:"inline-flex me-2 text-fg-secondary",children:\(0,\i\.jsx\)\(\i(?:\.\i)?,\{size:4\}\)\}\),\i\("user-dropdown\.settings","Settings"\)\]\}\)/,
                    replace: "$self._renderSettingsMenu($1)",
                },
                {
                    match: /\(0,\i\.jsxs?\)\(\i\.DropdownMenuItem,\{on(?:Select|Click):(\i),children:\[\(0,\i\.jsx\)\("span",\{className:"inline-flex me-2 text-fg-secondary",children:\(0,\i\.jsx\)\(\i\.SettingsIcon,\{size:4\}\)\}\),\i\("user-dropdown\.settings","Settings"\)\]\}\)/,
                    replace: "$self._renderSettingsMenu($1)",
                    noWarn: true,
                },
                {
                    // Desktop account menu: `Item,{onClick,children:[icon,label]}` after the settings string.
                    match: /("user-dropdown\.settings","Settings"\)[\s\S]{0,160}?)(\(0,\i\.jsxs?\)\(\i(?:\.\i)?\.Item,\{onClick:(\i),children:\[[^\]]{0,30}\]\}\))/,
                    replace: "$1$self._renderSettingsMenu($3)",
                },
            ],
        },
    ],
});
