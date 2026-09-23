/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ELLIPSIS = "…";

function tokens(text: string): string[] {
    return text.trim().split(/\s+/).filter(Boolean);
}

export function clampToWidth(text: string, maxPx: number, measure: (s: string) => number): string {
    if (!(maxPx > 0) || measure(text) <= maxPx) return text;
    const words = tokens(text);
    for (let n = words.length - 1; n >= 1; n--) {
        const candidate = `${words.slice(0, n).join(" ")} ${ELLIPSIS}`;
        if (measure(candidate) <= maxPx) return candidate;
    }
    return ELLIPSIS;
}
