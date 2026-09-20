/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { pageWindow } from "@utils/misc";

import { bootstrapPreviewFrame, isGrokPreviewFrame } from "./plugins/betterCanvas";
import * as VoidPP from "./VoidPP";

if (isGrokPreviewFrame()) {
    bootstrapPreviewFrame();
} else if (window === window.top && !(pageWindow as { VoidPP?: unknown; Void?: unknown }).VoidPP && !(pageWindow as { Void?: unknown }).Void) {
    Object.defineProperty(pageWindow, "VoidPP", {
        value: VoidPP,
        writable: false,
        configurable: true,
    });
    Object.defineProperty(pageWindow, "Void", {
        value: VoidPP,
        writable: false,
        configurable: true,
    });

    VoidPP.initSettings().then(() => VoidPP.init()).catch(e => console.error("[Void++] Fatal init error:", e));
}
