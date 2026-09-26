/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { isPluginEnabled, plugins } from "@api/PluginManager";
import { definePluginSettings, migratePluginSetting } from "@api/Settings";
import { loadSavedThemes } from "@api/Themes";
import { ErrorBoundary, Flex, InfoHint, Text } from "@components";
import { BracesIcon, PaletteIcon, SettingsIcon, TestTubeIcon, UnplugIcon, VoidPPIcon } from "@components/icons";
import { CustomCSSTab, loadSavedCSS, PluginsTab, setPendingPluginDialog, ThemesTab } from "@components/settings/tabs";
import { Tab as ExperimentsTab } from "@plugins/experiments";
import { usePluginMenu } from "@plugins/pluginsFlyout";
import {
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { setSettingsPrimitive, type SettingsPrimitives } from "@turbopack/common/settingsPrimitives";
import { SettingsDialogStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory, registerStyle } from "@utils/css";
import { Logger } from "@utils/Logger";
import { useEventSubscription, useForceUpdater } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import type { ComponentType, ReactNode } from "react";

const logger = new Logger("Settings");

const cl = classNameFactory("void-settings-");

const settings = definePluginSettings({
    showVoidPPMenu: {
        type: OptionType.BOOLEAN,
        description: "Show the Void++ sub-menu in the avatar dropdown.",
        default: true,
    },
});

interface SettingsTab {
    id: string;
    name: string;
    icon: ComponentType<any>;
    component: ComponentType;
    plugin?: string;
    description?: string;
}

const PLUGINS_TAB_ID = "voidpp_plugins_tab";

export const allTabs: SettingsTab[] = [
    { id: PLUGINS_TAB_ID, name: "Plugins", icon: UnplugIcon, component: PluginsTab, description: "Toggle features. Some need a reload. Click the sliders icon to configure." },
    { id: "voidpp_themes_tab", name: "Themes", icon: PaletteIcon, component: ThemesTab },
    { id: "voidpp_css_tab", name: "Quick CSS", icon: BracesIcon, component: CustomCSSTab },
    { id: "voidpp_experiments_tab", name: "Experiments", icon: TestTubeIcon, component: ExperimentsTab, plugin: "Experiments" },
];

export function getVisibleTabs() {
    return allTabs.filter(t => !t.plugin || isPluginEnabled(t.plugin));
}

const Dot = () => <Text as="span" color="secondary">{"\u2022"}</Text>;

function VersionLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noreferrer" className={cl("version-link")}>
            <Text as="span" color="secondary">
                {children}
            </Text>
        </a>
    );
}

function VersionInfo() {
    return (
        <Flex flexDirection="column" gap="0" className={cl("version")}>
            <Flex alignItems="center" gap="0.25rem">
                <VersionLink href={REPO_URL}>Void++</VersionLink>
                <Dot />
                <Text as="span" color="secondary">{VERSION}</Text>
                <Dot />
                <VersionLink href={`${REPO_URL}/commit/${GIT_HASH}`}>{`(${GIT_HASH})`}</VersionLink>
            </Flex>
            <Flex alignItems="center" gap="0.25rem">
                <Text as="span" color="secondary">
                    {IS_DEV ? "Development" : "Production"}
                </Text>
                <Dot />
                <Text as="span" color="secondary">
                    {IS_EXTENSION ? "Extension" : "Userscript"}
                </Text>
            </Flex>
        </Flex>
    );
}

function TabLabel({ text, description }: { text: string; description: string }) {
    return (
        <span className={cl("tab-label")}>
            {text}
            <InfoHint>{description}</InfoHint>
        </span>
    );
}

function openSettingsTab(tab: string) {
    const store = SettingsDialogStore.useSettingsDialogStore.getState();
    store.setTab(tab);
    store.setOpen(true);
}

function openPluginSettings(name: string) {
    setPendingPluginDialog(name);
    openSettingsTab(PLUGINS_TAB_ID);
}

function VoidPPMenu() {
    const forceUpdate = useForceUpdater();
    useEventSubscription("pluginToggle", forceUpdate);
    const { showVoidPPMenu } = settings.use(["showVoidPPMenu"]);
    const menuPlugins = usePluginMenu();

    if (!showVoidPPMenu) return null;

    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <VoidPPIcon className={cl("menu-icon")} />
                Void++
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
                {menuPlugins.length > 0 && (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <UnplugIcon className={cl("menu-icon")} />
                            Plugins
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className={cl("plugin-menu")}>
                            {menuPlugins.map(name => {
                                const Icon = plugins[name].icon ?? UnplugIcon;
                                return (
                                    <DropdownMenuItem key={name} onSelect={() => openPluginSettings(name)}>
                                        <Icon className={cl("menu-icon")} />
                                        {name}
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                )}
                {getVisibleTabs().filter(t => t.id !== PLUGINS_TAB_ID).map(t => {
                    const Icon = t.icon;
                    return (
                        <DropdownMenuItem key={t.id} onSelect={() => openSettingsTab(t.id)}>
                            <Icon className={cl("menu-icon")} />
                            {t.name}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
}

const WrappedVoidPPMenu = ErrorBoundary.wrap(VoidPPMenu);

export default definePlugin({
    name: "Settings",
    icon: SettingsIcon,
    description: "Adds Void++ settings UI.",
    authors: [Devs.Prism, Devs.p],
    required: true,
    settings,

    _renderVoidPPMenu: () => createElement(WrappedVoidPPMenu),

    _setPrimitive<K extends keyof SettingsPrimitives>(name: K, component: SettingsPrimitives[K]) {
        setSettingsPrimitive(name, component);
        return component;
    },

    _tabEntries() {
        return getVisibleTabs().map(t => ({
            id: t.id,
            group: "voidpp",
            icon: t.icon,
            i18nKey: t.name,
            defaultLabel: t.name,
            description: t.description,
            visible: () => true,
            component: t.component,
        }));
    },

    _tabLabel(tab: { defaultLabel?: string; i18nKey?: string; id: string; description?: string }) {
        const label = tab.defaultLabel || tab.i18nKey || tab.id;
        if (!tab.description) return label;
        return <TabLabel text={label} description={tab.description} />;
    },

    _renderVersion() {
        return <VersionInfo key="voidpp-version" />;
    },

    start() {
        migratePluginSetting("Settings", "showVoidPPMenu", "showVoidMenu");
        registerStyle("void-global", "[data-sonner-toast] [data-title]{font-weight:400}");
        try {
            if (document.head) loadSavedCSS();
            else document.addEventListener("DOMContentLoaded", loadSavedCSS, { once: true });
        } catch (e) {
            logger.error("Failed to load saved CSS:", e);
        }
        loadSavedThemes().catch(e => logger.error("Failed to load saved themes:", e));
    },

    patches: [
        {
            find: "avatar_menu_click",
            all: true,
            replacement: {
                match: /\(0,(\i)\.jsxs\)\((\i)\.DropdownMenuSub,\{children:\[\(0,\1\.jsxs\)\(\2\.DropdownMenuSubTrigger,\{(?:\i:\i,)*children:\[.{0,100}"user-dropdown\.help"/,
                replace: "$self._renderVoidPPMenu(),$&",
            },
        },
        {
            find: "pressed_cmd_settings",
            replacement: [
                {
                    match: /\i\.filter\(\i=>\i\.visible\(\i\)&&!\(\i&&"team-overview"===\i\.id\)\)/,
                    replace: "[...$&,...$self._tabEntries()]",
                },
                {
                    match: /(\["general","grok","payments","data","other"),("team-management"\])/,
                    replace: '$1,"voidpp",$2',
                },
                {
                    match: /(case"other":return \i\("settings-nav-group\.other","Other"\);)(case"team-management":)/,
                    replace: '$1case"voidpp":return"Void++";$2',
                },
                {
                    match: /default:return\(0,\i\.logError\)\("SettingsDialog:tabLabel",`No label for settings tab \${(\i)\.id}`\),\1\.id/,
                    replace: "default:return $self._tabLabel($1)",
                },
            ],
        },
        {
            find: '"SettingsTitle",0,',
            all: true,
            replacement: [
                {
                    match: /("SettingsTitle",0,)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsTitle",$2)',
                },
                {
                    match: /("SettingsDescription",0,)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsDescription",$2)',
                },
                {
                    match: /("SettingsRow",0,)(?!function)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsRow",$2)',
                },
                {
                    match: /("SettingsRow",0,)(function\(\i\)\{[\s\S]*?\})(?=,"Settings)/,
                    replace: '$1$self._setPrimitive("SettingsRow",$2)',
                },
            ],
        },
    ],
});
