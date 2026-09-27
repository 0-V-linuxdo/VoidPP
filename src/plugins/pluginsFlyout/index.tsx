/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { isPluginEnabled, plugins } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { Flex, SettingsDescription, SettingsRow, SettingsSwitch, SettingsTitle } from "@components";
import { ListFilterIcon, UnplugIcon } from "@components/icons";
import { hasVisibleSettings } from "@components/settings/utils";
import { React } from "@turbopack/common/react";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const PLUGIN_NAME = "PluginsFlyout";
const cl = classNameFactory("void-pf-");

const settings = definePluginSettings({
    menuPlugins: {
        type: OptionType.COMPONENT,
        description: "Plugins shown under Void++ → Plugins.",
        component: MenuPluginsEditor,
        default: {},
    },
}).withPrivateSettings<{ menuPlugins: Record<string, boolean> }>();

function listedPlugins() {
    return Object.keys(plugins)
        .filter(n => !plugins[n].hidden)
        .toSorted((a, b) => a.localeCompare(b));
}

function menuPluginMap(): Record<string, boolean> {
    const raw = settings.store.menuPlugins;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function isShownInPluginMenu(name: string): boolean {
    const map = menuPluginMap();
    if (name in map) return !!map[name];
    return hasVisibleSettings(plugins[name]);
}

function setShownInPluginMenu(name: string, shown: boolean) {
    settings.store.menuPlugins = { ...menuPluginMap(), [name]: shown };
}

export function getVisibleMenuPlugins(): string[] {
    const names = listedPlugins();
    if (!isPluginEnabled(PLUGIN_NAME)) return names.filter(n => hasVisibleSettings(plugins[n]));
    return names.filter(isShownInPluginMenu);
}

export function usePluginMenu(): string[] {
    settings.use(["menuPlugins"]);
    return getVisibleMenuPlugins();
}

function MenuPluginsEditor() {
    settings.use(["menuPlugins"]);

    return (
        <Flex flexDirection="column" gap="0.5rem" className={cl("root")}>
            <Flex flexDirection="column" gap="0">
                <SettingsTitle>Plugin menu</SettingsTitle>
                <SettingsDescription>Choose which plugins appear under Void++ → Plugins.</SettingsDescription>
            </Flex>
            <div className={cl("list")}>
                {listedPlugins().map(name => {
                    const Icon = plugins[name].icon ?? UnplugIcon;
                    return (
                        <SettingsRow
                            key={name}
                            action={<SettingsSwitch checked={isShownInPluginMenu(name)} onCheckedChange={v => setShownInPluginMenu(name, v)} />}
                        >
                            <Flex alignItems="center" gap="0.5rem">
                                <Icon className={cl("icon")} />
                                <SettingsTitle>{name}</SettingsTitle>
                            </Flex>
                        </SettingsRow>
                    );
                })}
            </div>
        </Flex>
    );
}

export default definePlugin({
    name: PLUGIN_NAME,
    icon: ListFilterIcon,
    description: "Choose which plugins appear in the avatar Void++ → Plugins menu.",
    authors: [Devs.p],
    tags: ["ui", "settings"],
    enabledByDefault: true,
    settings,
});
