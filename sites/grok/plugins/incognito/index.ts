/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GhostFilledIcon } from "@components/icons";
import { SettingsStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";

const store = () => SettingsStore.useSettingsStore.getState();

let unsubscribe: (() => void) | null = null;

function enforce() {
    if (!store().isIncognito) store().setIsIncognito(true);
}

export default definePlugin({
    name: "Incognito",
    icon: GhostFilledIcon,
    description: "Force private chat mode for new conversations.",
    authors: [Devs.Prism],
    tags: ["privacy"],
    startAt: StartAt.TurbopackReady,

    start() {
        enforce();
        unsubscribe = SettingsStore.useSettingsStore.subscribe(enforce);
    },

    stop() {
        unsubscribe?.();
        unsubscribe = null;
        store().setIsIncognito(false);
    },
});
