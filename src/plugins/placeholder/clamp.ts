/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ELLIPSIS = "…";

const BREAK_CHAR = /[\s\u00a0\u2000-\u200b\u2010-\u2015\u2212\u3000/,.;:!?…]/u;
const TRAILING_BREAK = /[\s\u00a0\u2000-\u200b\u2010-\u2015\u2212\u3000/,.;:!?…]+$/u;
const LAST_WORD = /[^\s\u00a0\u2000-\u200b\u2010-\u2015\u2212\u3000/,.;:!?…]+$/u;

function isBreak(ch: string | undefined): boolean {
    return !ch || BREAK_CHAR.test(ch);
}

export function clampToWidth(text: string, maxPx: number, measure: (s: string) => number): string {
    if (!(maxPx > 0) || measure(text) <= maxPx) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measure(text.slice(0, mid) + ELLIPSIS) <= maxPx) lo = mid;
        else hi = mid - 1;
    }
    if (lo <= 0) return ELLIPSIS;
    const cut = text.slice(0, lo);
    let kept = cut;
    if (!isBreak(cut.at(-1)) && !isBreak(text[lo])) kept = cut.replace(LAST_WORD, "");
    kept = kept.replace(TRAILING_BREAK, "");
    if (kept) return kept + ELLIPSIS;
    return cut.replace(/\s+$/u, "") + ELLIPSIS;
}
