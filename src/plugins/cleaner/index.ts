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
        description: "Hide the \"Connect your 𝕏 account\" upsell popout.",
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
    tags: ["ui"],
    enabledByDefault: true,
    settings,

    start: applyImagineUpgrade,
    onSettingsChange: applyImagineUpgrade,
    stop() {
        unregisterStyle(IMAGINE_UPGRADE_STYLE);
    },

    patches: [
        {
            find: '"user-dropdown.upgrade","Upgrade plan"',
            all: true,
            replacement: {
                match: /,(\i)(?=\?null:.{0,160}"user-dropdown\.upgrade")/,
                replace: ",$self.settings.store.hideUpgradePlan||$1",
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
            replacement: {
                match: /\.ENABLE_X_INTEGRATION&&(\i\.SHOW_CONNECT_X_UPSELL)/,
                replace: ".ENABLE_X_INTEGRATION&&!$self.settings.store.hideConnectX&&$1",
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
