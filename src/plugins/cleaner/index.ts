/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
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

function applyImagineUpgrade() {
    if (settings.store.hideImagineUpgrade) registerStyle(IMAGINE_UPGRADE_STYLE, IMAGINE_UPGRADE_CSS);
    else unregisterStyle(IMAGINE_UPGRADE_STYLE);
}

export default definePlugin({
    name: "Cleaner",
    icon: BrushCleaningIcon,
    description: "Hides upgrade nags and upsell banners.",
    authors: [Devs.Prism, Devs.p],
    tags: ["declutter"],
    enabledByDefault: true,
    settings,

    start: applyImagineUpgrade,
    onSettingsChange: applyImagineUpgrade,
    stop() {
        unregisterStyle(IMAGINE_UPGRADE_STYLE);
    },

    patches: [
        {
            find: 'overflow-hidden rounded-full bg-surface border border-border-l1',
            all: true,
            replacement: {
                match: /!\i&&"overflow-hidden rounded-full bg-surface border border-border-l1"/,
                replace: '!1&&""',
            },
        },
        {
            find: '"rounded-full cursor-pointer","bg-surface-l1 border border-border-l1"',
            all: true,
            replacement: {
                match: /"rounded-full cursor-pointer","bg-surface-l1 border border-border-l1"/,
                replace: '"cursor-pointer","bg-surface-l1"',
            },
        },
        {
            find: "radial-gradient(circle 12px at -3px 50%, transparent 99%, black 100%)",
            all: true,
            replacement: {
                match: /,mask:"radial-gradient\(circle 12px at -3px 50%, transparent 99%, black 100%\)",WebkitMask:"radial-gradient\(circle 12px at -3px 50%, transparent 99%, black 100%\)"/,
                replace: "",
            },
        },
        {
            find: '"user-dropdown.upgrade","Upgrade plan"',
            all: true,
            replacement: [
                {
                    // `(a||b||c||d||e||null!==x&&"pending"!==x)?null:(0,t.jsxs)(d.r,{onClick,…"Upgrade plan")`
                    match: /(\i(?:\|\|\i){2,8}\|\|null!==\i&&"pending"!==\i)\?null:(?=\(0,\i\.jsxs?\)\(\i(?:\.\i)?,\{on(?:Select|Click):\i,children:\[[\s\S]{0,360}?"user-dropdown\.upgrade","Upgrade plan")/,
                    replace: "($self.settings.store.hideUpgradePlan||($1))?null:",
                },
                {
                    match: /(\i(?:\|\|\i){3}\|\|null!==\i&&"pending"!==\i)\?null:(?=\jsx{\i\.DropdownMenuItem}\{.{0,260}"user-dropdown\.upgrade","Upgrade plan")/,
                    replace: "($self.settings.store.hideUpgradePlan||($1))?null:",
                    noWarn: true,
                },
            ],
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
