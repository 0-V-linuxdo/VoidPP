/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MORE_RE = /^(more|更多)$/i;
const SHARE_RE = /^(create share link|share project)$/i;
const PANEL_RE = /\bright panel\b/i;

export type AnchorButton = {
    label: string;
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
    /** Sidebar, dialog, message chrome, hidden, or our own star. */
    skipped: boolean;
    /** Sits in the open preview overlay, beside Expand / Preview / Files. */
    previewCluster: boolean;
};

/** Index of the chat More button, or -1 when the star should stay on the navigator. */
export function pickHeaderMore(buttons: readonly AnchorButton[]): number {
    const visible = buttons
        .map((button, index) => ({ button, index }))
        .filter(({ button }) => !button.skipped && button.width >= 16 && button.width <= 64 && button.height >= 16 && button.height <= 64 && button.top <= 160);

    let panel: { button: AnchorButton; index: number } | null = null;
    for (const item of visible) {
        if (!PANEL_RE.test(item.button.label)) continue;
        if (!panel || item.button.top < panel.button.top) panel = item;
    }

    const labeled = visible.filter(item => item !== panel && MORE_RE.test(item.button.label.trim()));
    if (labeled.length) {
        const mid = panel ? (panel.button.top + panel.button.bottom) / 2 : labeled[0].button.top + 16;
        const row = labeled.filter(item => Math.abs((item.button.top + item.button.bottom) / 2 - mid) <= 24);
        const pool = row.length ? row : labeled;
        pool.sort((a, b) => b.button.right - a.button.right);
        return pool[0].index;
    }

    if (!panel || panel.button.top > 160) return -1;
    const mid = (panel.button.top + panel.button.bottom) / 2;
    let best: { button: AnchorButton; index: number } | null = null;
    for (const item of visible) {
        if (item === panel) continue;
        const { button } = item;
        if (SHARE_RE.test(button.label.trim().toLowerCase())) continue;
        if (button.previewCluster) continue;
        if (Math.abs((button.top + button.bottom) / 2 - mid) > 14) continue;
        const gap = panel.button.left - button.right;
        if (gap < -4 || gap > 48) continue;
        if (!best || button.right > best.button.right) best = item;
    }
    return best ? best.index : -1;
}
