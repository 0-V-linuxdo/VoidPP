/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TerminalIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const warnNoop = { match: /console\.warn\(\i\)/, replace: "void 0" } as const;

export default definePlugin({
    name: "ConsoleJanitor",
    icon: TerminalIcon,
    description: "Silences noisy warnings and info logs in the browser console.",
    authors: [Devs.Prism],
    tags: ["developer"],

    patches: [
        { find: "x.ai/careers", replacement: { match: /console\.info\("[^"]{0,3000}"\)/, replace: "void 0" } },
        { find: "useDrawerContext must be used within a Drawer.Root", all: true, replacement: warnNoop },
        { find: "DialogDescriptionWarning", all: true, replacement: warnNoop },
        { find: "window.PressureObserver", replacement: { match: /if\(!window\.PressureObserver\)return/, replace: "return" } },
        { find: "NO_I18NEXT_INSTANCE", all: true, replacement: { match: /console\.warn\(\.\.\.\i\)/, replace: "void 0" } },
    ],
});
