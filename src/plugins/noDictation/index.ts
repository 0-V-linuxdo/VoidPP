/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { MicOffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_NAME = "noDictation";
const REFINEMENT_MARK = "void-no-dictation-refinement";

const BUTTON_CSS = `
button[aria-label="Dictation"]:not([role="dialog"] *),
button[aria-label^="Dictation ("]:not([role="dialog"] *),
div:has(> button[aria-label="Dictation"]):not([role="dialog"] *),
div:has(> button[aria-label^="Dictation ("]):not([role="dialog"] *),
div:has(> span > button[aria-label="Dictation"]):not([role="dialog"] *),
div:has(> span > button[aria-label^="Dictation ("]):not([role="dialog"] *),
.h-10.w-10:has(button[aria-label="Dictation"]):not([role="dialog"] *),
.h-10.w-10:has(button[aria-label^="Dictation ("]):not([role="dialog"] *),
div[style*="filter: blur"]:has(> .h-10.w-10.rounded-full.shrink-0):not([role="dialog"] *) {
    display: none !important;
}
`;

const REFINEMENT_CSS = `.${REFINEMENT_MARK}{display:none!important}`;

const settings = definePluginSettings({
    hideDictationRefinement: {
        type: OptionType.BOOLEAN,
        description: 'Hide "Dictation Refinement" in the Grok Settings dialog (Behavior tab).',
        default: true,
    },
});

function apply() {
    const rules = [BUTTON_CSS];
    if (settings.store.hideDictationRefinement) rules.push(REFINEMENT_CSS);
    registerStyle(STYLE_NAME, rules.join("\n"));
}

export default definePlugin({
    name: "NoDictation",
    icon: MicOffIcon,
    description: "Hide the Dictation (voice input) button from the chat input bar, and optionally Dictation Refinement in Settings.",
    authors: [Devs.p],
    tags: ["declutter"],
    enabledByDefault: true,
    settings,

    patches: [
        {
            find: 'settings.behavior.dictation-refinement.description","How much Grok refines your speech-to-text transcriptions',
            replacement: {
                match: /DISABLE_VOICE_MODE&&\(0,(\i)\.jsxs\)\(\i\.Fragment,\{/,
                replace: `DISABLE_VOICE_MODE&&(0,$1.jsxs)("div",{className:"${REFINEMENT_MARK}",style:{display:"contents"},`,
            },
        },
    ],

    start: apply,
    onSettingsChange: apply,
    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
