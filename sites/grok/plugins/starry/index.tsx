/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { ColorSettingRow } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { SparklesIcon } from "@components/icons";
import { React } from "@turbopack/common/react";
import { findExportedComponentLazy } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const DEFAULT_COLOR = "#ffffff";

const StarsBackground = findExportedComponentLazy("StarsBackground");

function hexToRgb(hex: string): [number, number, number] {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return [255, 255, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function ColorRow() {
    const { starColor } = settings.use(["starColor"]);
    return (
        <ColorSettingRow
            value={starColor}
            onChange={v => { settings.store.starColor = v; }}
            title="Star color"
            description="Color of the twinkling stars."
        />
    );
}

function StarryBackground() {
    const { starColor } = settings.use(["starColor"]);
    return (
        <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
            <StarsBackground starColor={hexToRgb(starColor)} />
        </div>
    );
}

const WrappedStarry = ErrorBoundary.wrap(StarryBackground);

const settings = definePluginSettings({
    starColor: {
        type: OptionType.COMPONENT,
        default: DEFAULT_COLOR,
        component: ColorRow,
    },
}).withPrivateSettings<{ starColor: string }>();

export default definePlugin({
    name: "Starry",
    icon: SparklesIcon,
    description: "Adds Grok's native twinkling starry background to the main page.",
    authors: [Devs.Prism],
    tags: ["appearance"],
    settings,

    _StarryBg() {
        return <WrappedStarry key="void-starry-bg" />;
    },

    patches: [
        {
            find: "\"chat-page\")",
            replacement: {
                match: /(children:\[)((?:\i,){2,8}\i\]\},"chat-page"\))/,
                replace: "$1$self._StarryBg(),$2",
            },
        },
    ],
});
