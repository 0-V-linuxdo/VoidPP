/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { keepHarvestedGlyph } from "./glyphs";

const CONNECTORS = '<svg viewBox="0 0 24 24"><path d="M12 12H19V16C19 16.6836 19.0011 17.2566 18.9629 17.7236"/></svg>';
const HEAVY = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="5" height="5"/><path d="M11 18H10C7.79086 18 6 16.2091 6 14V13"/></svg>';

describe("keepHarvestedGlyph", () => {
    test("drops the connectors mark harvested for Heavy", () => {
        expect(keepHarvestedGlyph("heavy", CONNECTORS)).toBe(false);
        expect(keepHarvestedGlyph("heavy", '<path d="M1 2 17.7236 3"/>')).toBe(false);
    });

    test("keeps the three-square Heavy glyph", () => {
        expect(keepHarvestedGlyph("heavy", HEAVY)).toBe(true);
    });

    test("still harvests other modes even if a row contains the connectors path", () => {
        expect(keepHarvestedGlyph("build", CONNECTORS)).toBe(true);
        expect(keepHarvestedGlyph("auto", CONNECTORS)).toBe(true);
    });
});
