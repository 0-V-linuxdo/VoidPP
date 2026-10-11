/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { BrushCleaningIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    hideUpgradePlan: {
        type: OptionType.BOOLEAN,
        description: "Hide the upgrade plan button in the user menu.",
        default: true,
    },
    hideUpsellCard: {
        type: OptionType.BOOLEAN,
        description: "Hide the upsell card banner.",
        default: true,
    },
    hideUpsellSmall: {
        type: OptionType.BOOLEAN,
        description: "Hide the small SuperGrok upsell banner.",
        default: true,
    },
    hideModelUpsell: {
        type: OptionType.BOOLEAN,
        description: "Hide the upgrade prompt in the model selector.",
        default: true,
    },
    hideInaccessibleModels: {
        type: OptionType.BOOLEAN,
        description: "Hide locked/inaccessible models in the model selector.",
        default: true,
    },
    hideNotificationBanner: {
        type: OptionType.BOOLEAN,
        description: "Hide the \"Get notified when Grok finishes answering\" banner.",
        default: true,
    },
    hideConnectX: {
        type: OptionType.BOOLEAN,
        description: "Hide the Connect X upsell and the X connector ready banner.",
        default: true,
    },
    hideImagineUpgrade: {
        type: OptionType.BOOLEAN,
        description: "Hide the Upgrade button on the Imagine page.",
        default: true,
    },
    flatSourceChips: {
        type: OptionType.BOOLEAN,
        description: "Drop the circle around citation favicons and the sources chip border.",
        default: true,
    },
});

const hideComponentPatch = (name: string, setting: keyof typeof settings.store, all = true) => ({
    find: `"${name}",0,`,
    all,
    replacement: {
        match: new RegExp(`"${name}",0,`),
        replace: `"${name}",0,$self.settings.store.${setting}?()=>null:`,
    },
});

const IMAGINE_UPGRADE_STYLE = "cleanerImagineUpgrade";
const IMAGINE_UPGRADE_CSS = 'form:has([aria-label="Generation mode"]) a[href*="upgrade"],form:has([aria-label="Generation mode"]) button[aria-label="Upgrade"],form:has([aria-label="Generation mode"]) button[aria-label*="Upgrade plan"],[data-wd-toolbar] a[href*="upgrade"],[data-wd-toolbar] button[aria-label="Upgrade"]{display:none!important}';

/* The sources chip is a pill (`border border-border-l1`). Each favicon sits
 * in a 20px rounded plate around a 16px image. Keep the pill fill, the label,
 * and the overlap mask. Do not restyle avatars. */
const SOURCE_CHIPS_STYLE = "cleanerSourceChips";
const SOURCE_CHIPS_CSS = `
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) {
    border: 0 !important;
    box-shadow: none !important;
}
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) > div:has(> img[src*="favicon" i]) {
    border: 0 !important;
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    border-radius: 0 !important;
}
div[role="button"].rounded-full:has(> .truncate):has(> div > img[src*="favicon" i]) img[src*="favicon" i] {
    border-radius: 0 !important;
}
`;

function dropName(list: unknown): string[] | undefined {
    if (!Array.isArray(list)) return undefined;
    const next = list.filter((n): n is string => typeof n === "string" && n !== "SourceChips");
    return next.length === list.length ? undefined : next;
}

function migrateSourceChips() {
    const plugins = PlainSettings.plugins;
    const old = plugins.SourceChips;
    if (!old) return;
    const target = plugins.Cleaner ??= {};
    if (old.enabled === false && !("flatSourceChips" in target)) target.flatSourceChips = false;
    delete plugins.SourceChips;
    const meta = plugins.Settings;
    if (meta) {
        const pinned = dropName(meta.pinnedPlugins);
        const starred = dropName(meta.starredPlugins);
        if (pinned) meta.pinnedPlugins = pinned;
        if (starred) meta.starredPlugins = starred;
        const known = meta.knownPlugins;
        if (known && typeof known === "object") delete (known as Record<string, unknown>).SourceChips;
    }
    SettingsStore.markAsChanged();
}

function applyImagineUpgrade() {
    if (settings.store.hideImagineUpgrade) registerStyle(IMAGINE_UPGRADE_STYLE, IMAGINE_UPGRADE_CSS);
    else unregisterStyle(IMAGINE_UPGRADE_STYLE);
}

function applySourceChips() {
    if (settings.store.flatSourceChips) registerStyle(SOURCE_CHIPS_STYLE, SOURCE_CHIPS_CSS);
    else unregisterStyle(SOURCE_CHIPS_STYLE);
}

function apply() {
    migrateSourceChips();
    applyImagineUpgrade();
    applySourceChips();
}

export default definePlugin({
    name: "Cleaner",
    icon: BrushCleaningIcon,
    description: "Hides upgrade nags, upsell banners, and the circle around citation favicons.",
    authors: [Devs.Prism, Devs.p],
    tags: ["declutter"],
    enabledByDefault: true,
    settings,

    start: apply,
    onSettingsChange: apply,
    stop() {
        unregisterStyle(IMAGINE_UPGRADE_STYLE);
        unregisterStyle(SOURCE_CHIPS_STYLE);
    },

    patches: [
        {
            find: '"user-dropdown.upgrade","Upgrade plan"',
            all: true,
            replacement: {
                match: /(\i(?:\|\|\i){3}\|\|null!==\i&&"pending"!==\i)\?null:(?=\jsx{\i\.DropdownMenuItem}\{.{0,260}"user-dropdown\.upgrade","Upgrade plan")/,
                replace: "($self.settings.store.hideUpgradePlan||($1))?null:",
            },
        },
        {
            find: "UPSELL_CARD_PRIORITY)",
            all: true,
            replacement: {
                match: /(\(0,\i\.useIsUpsellLayerVisible\)\(\i\.UPSELL_CARD_PRIORITY\))/,
                replace: "$1&&!$self.settings.store.hideUpsellCard",
            },
        },
        hideComponentPatch("UpsellSuperGrokSmall", "hideUpsellSmall"),
        hideComponentPatch("UpsellButton", "hideUpsellSmall", false),
        {
            find: "connect-x-upsell-dismissed",
            noWarn: true,
            replacement: {
                match: /\.ENABLE_X_INTEGRATION&&(\i\.SHOW_CONNECT_X_UPSELL)/,
                replace: ".ENABLE_X_INTEGRATION&&!$self.settings.store.hideConnectX&&$1",
            },
        },
        {
            find: "x-connector-ready-dismissed",
            replacement: {
                match: /(\i)\.SHOW_X_CONNECTOR_READY_BANNER&&/,
                replace: "$1.SHOW_X_CONNECTOR_READY_BANNER&&!$self.settings.store.hideConnectX&&",
            },
        },
        hideComponentPatch("BrowserNotificationBanner", "hideNotificationBanner"),
        {
            find: ["mode-select.search-placeholder", "UPSELL_MODEL_SELECT_PRIORITY"],
            all: true,
            group: true,
            replacement: [
                {
                    match: /UPSELL_MODEL_SELECT_PRIORITY\),.{0,200}?if\(/,
                    replace: "$&$self.settings.store.hideModelUpsell||",
                },
                {
                    match: /upgradePrimaryModes:(\i),unavailablePrimaryModes:(\i)\}/,
                    replace: "upgradePrimaryModes:$self.settings.store.hideInaccessibleModels?[]:$1,unavailablePrimaryModes:$self.settings.store.hideInaccessibleModels?[]:$2}",
                },
            ],
        },
    ],
});
