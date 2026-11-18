/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { type AnchorButton, isPanelLabel, isPreviewChromeLabel, pickHeaderMore } from "./anchor";

function btn(partial: Partial<AnchorButton> & Pick<AnchorButton, "label" | "left" | "right">): AnchorButton {
    return {
        top: 15,
        bottom: 47,
        width: 32,
        height: 32,
        skipped: false,
        previewCluster: false,
        ...partial,
    };
}

describe("header star labels", () => {
    test("panel labels include pane and hide pane", () => {
        expect(isPanelLabel("Toggle right pane")).toBe(true);
        expect(isPanelLabel("Toggle Right Panel")).toBe(true);
        expect(isPanelLabel("Hide pane")).toBe(true);
        expect(isPanelLabel("Conversation Actions")).toBe(false);
    });

    test("preview chrome includes Show files / New tab", () => {
        expect(isPreviewChromeLabel("Show files")).toBe(true);
        expect(isPreviewChromeLabel("New tab")).toBe(true);
        expect(isPreviewChromeLabel("Hide pane")).toBe(true);
        expect(isPreviewChromeLabel("Conversation Actions")).toBe(false);
    });
});

describe("header star anchor", () => {
    test("closed panel docks on Conversation Actions beside Toggle right pane", () => {
        const buttons = [
            btn({ label: "Conversation Actions", left: 1453, right: 1481 }),
            btn({ label: "Toggle right pane", left: 1485, right: 1513 }),
        ];
        expect(buttons[pickHeaderMore(buttons)].label).toBe("Conversation Actions");
    });

    test("closed panel docks on the labeled More beside the right panel", () => {
        const buttons = [
            btn({ label: "More", left: 1324, right: 1356 }),
            btn({ label: "Toggle Right Panel", left: 1362, right: 1394 }),
        ];
        expect(buttons[pickHeaderMore(buttons)].label).toBe("More");
    });

    test("open preview does not dock on Show files in the preview cluster", () => {
        const buttons = [
            btn({ label: "Conversation Actions", left: 659, right: 691 }),
            btn({ label: "Show files", left: 2218, right: 2246, previewCluster: true }),
            btn({ label: "New tab", left: 2188, right: 2216, previewCluster: true }),
            btn({ label: "Hide pane", left: 2248, right: 2276, previewCluster: true }),
            btn({ label: "Toggle right pane", left: 1485, right: 1513 }),
        ];
        expect(buttons[pickHeaderMore(buttons)].label).toBe("Conversation Actions");
    });

    test("open preview does not dock on Expand in the preview cluster", () => {
        const buttons = [
            btn({ label: "More", left: 659, right: 691 }),
            btn({ label: "Preview", left: 721, right: 753, previewCluster: false }),
            btn({ label: "Files", left: 757, right: 789 }),
            btn({ label: "Expand", left: 1330, right: 1362, previewCluster: true }),
            btn({ label: "Toggle Right Panel", left: 1362, right: 1394, previewCluster: true }),
        ];
        expect(buttons[pickHeaderMore(buttons)].label).toBe("More");
    });

    test("without a More label, an open preview does not steal Expand", () => {
        const buttons = [
            btn({ label: "Preview", left: 721, right: 753 }),
            btn({ label: "Files", left: 757, right: 789 }),
            btn({ label: "Expand", left: 1330, right: 1362, previewCluster: true }),
            btn({ label: "Toggle Right Panel", left: 1362, right: 1394, previewCluster: true }),
        ];
        expect(pickHeaderMore(buttons)).toBe(-1);
    });

    test("closed panel still accepts the neighbor when More has no label", () => {
        const buttons = [
            btn({ label: "", left: 1324, right: 1356 }),
            btn({ label: "Create share link", left: 1356, right: 1356, width: 0, height: 0 }),
            btn({ label: "Toggle Right Panel", left: 1362, right: 1394 }),
        ];
        expect(pickHeaderMore(buttons)).toBe(0);
    });

    test("ignores message More actions and sidebar More", () => {
        const buttons = [
            btn({ label: "More", left: 10, right: 235, width: 225, top: 400, bottom: 436 }),
            btn({ label: "More actions", left: 621, right: 653, top: 200, bottom: 232 }),
            btn({ label: "更多", left: 1286, right: 1318 }),
            btn({ label: "Toggle Right Panel", left: 1362, right: 1394 }),
        ];
        expect(buttons[pickHeaderMore(buttons)].label).toBe("更多");
    });
});
