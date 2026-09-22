/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { BlendIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import { clamp } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_NAME = "composerOpacity";
const SHELL = ".query-bar";
const FRAME = "form:has(.query-bar),form:has(.query-bar)>:first-child";
const FRAME_KIDS = "form:has(.query-bar)>:first-child>*";
const BACKDROP = ".chat-input-backdrop,.pointer-events-none.absolute.bottom-0.z-0[class*=bg-gradient-to-t]";
const RADIUS = "var(--border-t-radius,10rem) var(--border-t-radius,10rem) var(--border-b-radius,10rem) var(--border-b-radius,10rem)";

const settings = definePluginSettings({
    opacity: {
        type: OptionType.SLIDER,
        description: "Background opacity of the chat input. 100 is fully opaque.",
        min: 0,
        max: 100,
        default: 100,
    },
    blur: {
        type: OptionType.SLIDER,
        description: "Backdrop blur in pixels. Helps when opacity is below 100.",
        min: 0,
        max: 40,
        default: 16,
    },
});

function apply() {
    const pct = clamp(settings.store.opacity, 0, 100);
    const blur = clamp(settings.store.blur, 0, 40);
    const alpha = pct / 100;
    const frost = pct < 100 && blur > 0
        ? `-webkit-backdrop-filter:blur(${blur}px)!important;backdrop-filter:blur(${blur}px)!important;`
        : "-webkit-backdrop-filter:none!important;backdrop-filter:none!important;";
    registerStyle(
        STYLE_NAME,
        `${FRAME}{background:transparent!important;background-image:none!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;pointer-events:none!important}`
        + `${FRAME_KIDS}{pointer-events:auto!important}`
        + `${BACKDROP}{display:none!important}`
        + `${SHELL}{`
        + "pointer-events:auto!important;"
        + `background-color:hsl(var(--surface-l1)/${alpha})!important;`
        + "background-image:none!important;"
        + `border-radius:${RADIUS}!important;`
        + "overflow:hidden!important;"
        + `clip-path:inset(0 round ${RADIUS})!important;`
        + frost
        + "}"
        + `${SHELL}:has([aria-label="Generation mode"]){overflow:visible!important;clip-path:none!important}`,
    );
}

export default definePlugin({
    name: "ComposerOpacity",
    icon: BlendIcon,
    description: "Customizable chat input background opacity so content behind the bar cannot show through.",
    authors: [Devs.p],
    tags: ["ui", "chat"],
    enabledByDefault: true,
    settings,

    start: apply,
    onSettingsChange: apply,
    stop() {
        unregisterStyle(STYLE_NAME);
    },
});
