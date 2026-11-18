/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { U } from "../../sites/grok/u.js";

export const patchStats = new Proxy({}, {
    get(_, key) { return U?.patchStats?.[key]; },
});
export const patchResults = new Proxy([], {
    get(_, key) { return U?.patchResults?.[key]; },
});
export function patchReport() { return U?.patchReport?.() ?? { stats: {}, results: [], orphaned: [] }; }
export function reportOrphanedPatches() {}
export function getChunkFingerprint() { return []; }
