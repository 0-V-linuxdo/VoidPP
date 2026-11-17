/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { isPluginEnabled, plugins } from "@api/PluginManager";
import { definePluginSettings, migratePluginSetting } from "@api/Settings";
import { loadSavedThemes } from "@api/Themes";
import { ErrorBoundary, Flex, Text } from "@components";
import { BracesIcon, type IconProps,PaletteIcon, SettingsIcon, TestTubeIcon, UnplugIcon, VoidPPIcon } from "@components/icons";
import { CustomCSSTab, loadSavedCSS, PluginsTab, setPendingPluginDialog, ThemesTab } from "@components/settings/tabs";
import { Tab as ExperimentsTab } from "@plugins/experiments";
import { usePluginMenu } from "@plugins/pluginsFlyout";
import { accountMenuParts, accountMenuSelect, MenuGlyphIcon } from "@turbopack/common/components";
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

const navIcons = new Map<ComponentType<any>, ComponentType<IconProps>>();

/** Grok's icon `size` is a 0.25rem step (`size={4}` → 1rem), not a pixel length. */
function grokNavIcon(Icon: ComponentType<any>) {
    let wrapped = navIcons.get(Icon);
    if (wrapped) return wrapped;
    wrapped = function GrokNavIcon({ size, width, height, ...rest }: IconProps) {
        const dim = width ?? height ?? (typeof size === "number" ? `${0.25 * size}rem` : size) ?? "1rem";
        return <Icon {...rest} width={dim} height={dim} />;
    };
    navIcons.set(Icon, wrapped);
    return wrapped;
}

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

function openSettingsTab(tab: string) {
    const hook = SettingsDialogStore.useSettingsDialogStore;
    if (!hook || typeof hook.getState !== "function") return;
    const store = hook.getState() as { openTab?: (id: string) => void; setTab: (id: string) => void; setOpen: (open: boolean) => void };
    if (typeof store.openTab === "function") {
        store.openTab(tab);
        return;
    }
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
    const { Sub, Trigger, Content, Item, desktop } = accountMenuParts();

    if (!showVoidPPMenu) return null;

    const scroll = desktop ? {} : { maxHeight: "lg" };

    return (
        <Sub>
            <Trigger>
                <MenuGlyphIcon icon={VoidPPIcon} className={cl("menu-icon")} desktop={desktop} />
                Void++
            </Trigger>
            <Content>
                {menuPlugins.length > 0 && (
                    <Sub>
                        <Trigger>
                            <MenuGlyphIcon icon={UnplugIcon} className={cl("menu-icon")} desktop={desktop} />
                            Plugins
                        </Trigger>
                        <Content {...scroll}>
                            {menuPlugins.map(name => {
                                const Icon = plugins[name].icon ?? UnplugIcon;
                                return (
                                    <Item key={name} {...accountMenuSelect(desktop, () => openPluginSettings(name))}>
                                        <MenuGlyphIcon icon={Icon} className={cl("menu-icon")} desktop={desktop} />
                                        {name}
                                    </Item>
                                );
                            })}
                        </Content>
                    </Sub>
                )}
                {getVisibleTabs().filter(t => t.id !== PLUGINS_TAB_ID).map(t => {
                    const Icon = t.icon;
                    return (
                        <Item key={t.id} {...accountMenuSelect(desktop, () => openSettingsTab(t.id))}>
                            <MenuGlyphIcon icon={Icon} className={cl("menu-icon")} desktop={desktop} />
                            {t.name}
                        </Item>
                    );
                })}
            </Content>
        </Sub>
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

    _navLeading(id: string) {
        const tab = allTabs.find(t => t.id === id);
        if (!tab) return null;
        return createElement(tab.icon, { width: 18, height: 18, className: cl("nav-icon") });
    },

    _selectNavTab(id: string, setTab: (id: string) => void) {
        if (String(id).startsWith("voidpp_")) {
            const hook = SettingsDialogStore.useSettingsDialogStore;
            const openTab = hook && typeof hook.getState === "function"
                ? (hook.getState() as { openTab?: (tab: string) => void }).openTab
                : undefined;
            if (typeof openTab === "function") {
                openTab(id);
                return;
            }
        }
        setTab(id);
    },

    _resolveShownTab(opts: {
        activeTab: string;
        open: boolean;
        requestedTab: string;
        hostedSection: string | null;
        normalized: string;
        isHosted: (id: string) => boolean;
    }) {
        const hook = SettingsDialogStore.useSettingsDialogStore;
        const tab = hook && typeof hook.getState === "function" ? hook.getState().tab : undefined;
        if (String(tab || "").startsWith("voidpp_")) return tab;
        if (String(opts.requestedTab || "").startsWith("voidpp_")) return opts.requestedTab;
        if (opts.open && opts.isHosted(opts.normalized)) return opts.normalized;
        if (opts.open || opts.hostedSection == null) return opts.activeTab;
        return opts.hostedSection;
    },

    _tabEntries() {
        return getVisibleTabs().map(t => ({
            id: t.id,
            group: "voidpp",
            icon: grokNavIcon(t.icon),
            i18nKey: t.name,
            defaultLabel: t.name,
            description: t.description,
            visible: () => true,
            component: t.component,
        }));
    },

    _tabLabel(tab: { defaultLabel?: string; i18nKey?: string; id: string; description?: string }) {
        return tab.defaultLabel || tab.i18nKey || tab.id;
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
            replacement: [
                {
                    match: /(?=\(0,\i\.jsxs\)\(\i\.W,\{children:\[\(0,\i\.jsxs\)\(\i\.f,\{ref:\i,children:\[.{0,260}"user-dropdown\.help")/,
                    replace: "$self._renderVoidPPMenu(),",
                },
                {
                    match: /\(0,(\i)\.jsxs\)\((\i)\.DropdownMenuSub,\{children:\[\(0,\1\.jsxs\)\(\2\.DropdownMenuSubTrigger,\{(?:\i:\i,)*children:\[.{0,240}"user-dropdown\.help"/,
                    replace: "$self._renderVoidPPMenu(),$&",
                    noWarn: true,
                },
            ],
        },
        {
            // Desktop account menu builds Help as `(0,jsx)(HelpMenu,{onOpenChangelog})`.
            // A fragment flattens so Void++ sits immediately before Help.
            find: '"user-dropdown.help","Help"',
            all: true,
            replacement: {
                match: /(\(0,(\i)\.jsx\)\(\i,\{onOpenChangelog:\i\}\))/,
                replace: "(0,$2.jsx)($2.Fragment,{children:[$self._renderVoidPPMenu(),$1]})",
            },
        },
        {
            find: "registryTabs",
            replacement: [
                {
                    match: /\.filter\(\i=>\i\.visible\(\i\)&&!\(\i&&"team-overview"===\i\.id\)\)/,
                    replace: "$&.concat($self._tabEntries())",
                    noWarn: true,
                },
                {
                    match: /\.filter\(\i=>\i\.visible\(\i\)\)(?=[\s\S]{0,1200}registryTabs)/,
                    replace: "$&.concat($self._tabEntries())",
                },
                {
                    match: /(\["general","grok","payments","data","other"),("team-management"\])/,
                    replace: '$1,"voidpp",$2',
                    noWarn: true,
                },
                {
                    match: /(case"other":return \i\("settings-nav-group\.other","Other"\);)(case"team-management":)/,
                    replace: '$1case"voidpp":return"Void++";$2',
                },
                {
                    match: /default:return\(0,\i(?:\.\i)?\)\("SettingsDialog:tabLabel",`No label for settings tab \${(\i)\.id}`\),\1\.id/,
                    replace: "default:return $self._tabLabel($1)",
                },
            ],
        },
        {
            find: '"data-settings-tab"',
            all: true,
            replacement: {
                match: /leading:\(0,(\i)\.jsx\)\((\i)\.f,\{name:(\i)\.X\[(\i)\.id\]\}\)/g,
                replace: "leading:$self._navLeading($4.id)||(0,$1.jsx)($2.f,{name:$3.X[$4.id]})",
            },
        },
        {
            find: '"DesktopSettingsDialog",0,function',
            replacement: [
                {
                    match: /function\(\{activeTab:\i,open:\i,requestedTab:\i,hostedSection:\i\}\)\{let \i=\(0,(\i)\.(\i)\)\(\i\);return \i&&\(0,(\i)\.(\i)\)\(\i\)\?\i:\i\|\|null===\i\?\i:\i\}\(\{activeTab:(\i),open:(\i),requestedTab:(\i),hostedSection:(\i)\?\?(\i)\?\?null\}\)/,
                    replace: "$self._resolveShownTab({activeTab:$5,open:$6,requestedTab:$7,hostedSection:$8??$9??null,normalized:(0,$1.$2)($7),isHosted:e=>(0,$3.$4)(e)})",
                },
                {
                    match: /let (\i)=\(0,(\i)\.z\)\((\i)\);return (\i)&&\(0,(\i)\.K\)\(\1\)\?\1:\4\|\|null===(\i)\?(\i):\6/,
                    replace: "let $1=(0,$2.z)($3);return $self._resolveShownTab({activeTab:$7,open:$4,requestedTab:$3,hostedSection:$6,normalized:$1,isHosted:$5.K})",
                    noWarn: true,
                },
                {
                    match: /\[(\i),(\i)\]=\(0,(\i)\.useState\)\((\i)\);(\i)&&\1!==\4&&\2\(\4\)([\s\S]{0,1200}?)(\i)=(\i)=>(\i)\(\(\)=>(\i)\(\8\)\),(\i)\[34\]=\9,(\i)\[35\]=\10,(\i)\[36\]=\7/,
                    replace: "[$1,$2]=(0,$3.useState)($4);$5&&$1!==$4&&$2($4)$6$7=$8=>$9(()=>{$self._selectNavTab($8,$10);$2($8);}),$11[34]=$9,$12[35]=$10,$13[36]=$7",
                },
            ],
        },
        {
            find: '"grok-bot","data","billing","dev","dev-flags"',
            replacement: {
                match: /(\["home","account","appearance","notifications","personality","grok-bot","data","billing","dev","dev-flags","behavior","usage")/,
                replace: '$1,"voidpp_plugins_tab","voidpp_themes_tab","voidpp_css_tab","voidpp_experiments_tab"',
            },
        },
        {
            find: '["general","grok","payments","data","other","team-management"]',
            noWarn: true,
            replacement: {
                match: /(\["general","grok","payments","data","other"),("team-management"\])/,
                replace: '$1,"voidpp",$2',
            },
        },
        {
            find: '"SettingsTitle",0,',
            all: true,
            noWarn: true,
            replacement: [
                {
                    match: /("SettingsTitle",0,)(?!function)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsTitle",$2)',
                    noWarn: true,
                },
                {
                    match: /("SettingsTitle",0,)(function\(\i\)\{[\s\S]{0,800}?\})(?=\]\))/,
                    replace: '$1$self._setPrimitive("SettingsTitle",$2)',
                },
                {
                    match: /("SettingsDescription",0,)(?!function)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsDescription",$2)',
                    noWarn: true,
                },
                {
                    match: /("SettingsDescription",0,)(function\(\i\)\{[\s\S]{0,800}?\})(?=,"Settings)/,
                    replace: '$1$self._setPrimitive("SettingsDescription",$2)',
                },
                {
                    match: /("SettingsRow",0,)(?!function)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsRow",$2)',
                    noWarn: true,
                },
                {
                    match: /("SettingsRow",0,)(function\(\i\)\{[\s\S]{0,800}?\})(?=,"Settings)/,
                    replace: '$1$self._setPrimitive("SettingsRow",$2)',
                },
            ],
        },
        {
            find: '"SettingsSwitch",0,',
            noWarn: true,
            replacement: {
                match: /("SettingsSwitch",0,)(\i)/,
                replace: '$1$self._setPrimitive("SettingsSwitch",$2)',
            },
        },
    ],
});
