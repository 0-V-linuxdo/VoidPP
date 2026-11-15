/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MORE_RE = /^(more|更多|conversation actions|对话操作|会话操作)$/i;
const SHARE_RE = /^(create share link|share project)$/i;
const PANEL_RE = /\bright pane(?:l)?\b|\bhide pane\b|右侧(面板|栏)|隐藏(面板|栏|窗格)/i;
const PREVIEW_RE = /^(expand|preview|files|show files|new tab|hide pane|pane actions)$/i;

export function isPanelLabel(label: string): boolean {
    return PANEL_RE.test(label);
}

export function isPreviewChromeLabel(label: string): boolean {
    return PREVIEW_RE.test(label.trim());
}

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
    /** Sits in the open preview overlay, beside Expand / Preview / Files / Show files / New tab. */
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
