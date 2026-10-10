/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, migratePluginSetting } from "@api/Settings";
import { ErrorBoundary, Text } from "@components";
import { BracesIcon, PaletteIcon, Settings2Icon, UnplugIcon } from "@components/icons";
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@turbopack/common/components";
import { createElement, React } from "@turbopack/common/react";
import { SettingsDialogStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import type { ComponentType } from "react";

import { CogIcon, DatabaseIcon, LightningIcon, PaintIcon, PaymentsIcon, PersonIcon, SlidersIcon, VisitIcon } from "./icons";

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
    { id: "account", name: "Account", setting: "account", icon: PersonIcon },
    { id: "appearance", name: "Appearance", setting: "appearance", icon: PaintIcon },
    { id: "behavior", name: "Behavior", setting: "behavior", icon: VisitIcon },
    { id: "personality", name: "Customize", setting: "customize", icon: SlidersIcon },
    { id: "billing", name: "Billing", setting: "billing", icon: PaymentsIcon },
    { id: "usage", name: "Usage", setting: "usage", icon: LightningIcon },
    { id: "data", name: "Data Controls", setting: "data", icon: DatabaseIcon },
];

const VOIDPP_TABS: VoidPPFlyoutTab[] = [
    { id: "voidpp_plugins_tab", name: "Plugins", setting: "plugins", icon: UnplugIcon },
    { id: "voidpp_themes_tab", name: "Themes", setting: "themes", icon: PaletteIcon },
    { id: "voidpp_css_tab", name: "Quick CSS", setting: "css", icon: BracesIcon },
];

function openTab(tab: string | undefined, onOpen?: (event?: Event) => void, event?: Event) {
    const store = SettingsDialogStore.useSettingsDialogStore.getState();
    if (tab) {
        store.setTab(tab);
        store.setOpen(true);
        return;
    }
    try {
        onOpen?.(event);
    } catch {}
    store.setOpen(true);
}

function tabItems(tabs: FlyoutTab[]) {
    return tabs.map(t => {
        const Icon = t.icon;
        return (
            <DropdownMenuItem key={t.id} onSelect={() => openTab(t.id)}>
                <Icon className={cl("menu-icon")} />
                {t.name}
            </DropdownMenuItem>
        );
    });
}

function VoidPPSection({ tabs }: { tabs: FlyoutTab[] }) {
    if (tabs.length === 0) return null;
    return (
        <>
            <Text size="xs" color="secondary" className={cl("group")}>Void++</Text>
            {tabItems(tabs)}
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

    const grokTabs = GROK_TABS.filter(t => cfg[t.setting]);
    const voidppTabs = VOIDPP_TABS.filter(t => cfg[t.setting]);
    const showOpen = cfg.showOpenSettings || (grokTabs.length === 0 && voidppTabs.length === 0);
    const voidppFirst = cfg.voidppPosition !== "below";
    const hasBoth = grokTabs.length > 0 && voidppTabs.length > 0;

    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <CogIcon className={cl("menu-icon")} />
                Settings
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={cl("menu")}>
                {showOpen && (
                    <DropdownMenuItem onSelect={e => openTab(undefined, onOpen, e)}>
                        <CogIcon className={cl("menu-icon")} />
                        Open Settings
                    </DropdownMenuItem>
                )}
                {showOpen && (voidppTabs.length > 0 || grokTabs.length > 0) && <DropdownMenuSeparator />}
                {voidppFirst && <VoidPPSection tabs={voidppTabs} />}
                {voidppFirst && hasBoth && <DropdownMenuSeparator />}
                {tabItems(grokTabs)}
                {!voidppFirst && hasBoth && <DropdownMenuSeparator />}
                {!voidppFirst && <VoidPPSection tabs={voidppTabs} />}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
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
            replacement: {
                match: /\(0,\i\.jsxs?\)\(\i\.DropdownMenuItem,\{on(?:Select|Click):(\i),children:\[\(0,\i\.jsx\)\("span",\{className:"inline-flex me-2 text-fg-secondary",children:\(0,\i\.jsx\)\(\i\.SettingsIcon,\{size:4\}\)\}\),\i\("user-dropdown\.settings","Settings"\)\]\}\)/,
                replace: "$self._renderSettingsMenu($1)",
            },
        },
    ],
});
