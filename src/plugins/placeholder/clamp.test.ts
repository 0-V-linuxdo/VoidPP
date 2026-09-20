/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { clampToWidth, ELLIPSIS } from "./clamp";

const len = (s: string) => s.length;

describe("clampToWidth", () => {
    test("leaves text that already fits", () => {
        expect(clampToWidth("hello", 10, len)).toBe("hello");
    });

    test("drops a partial last word", () => {
        expect(clampToWidth("do for your country", 5, len)).toBe(`do${ELLIPSIS}`);
    });

    test("keeps a complete last word", () => {
        expect(clampToWidth("do for your", 10, len)).toBe(`do for${ELLIPSIS}`);
    });

    test("does not cut Kennedy's for into f", () => {
        const text = "Ask not what your country can do for you — ask what you can do for your country.";
        const idx = text.lastIndexOf("do for");
        const max = idx + 4 + ELLIPSIS.length;
        expect(clampToWidth(text, max, len)).toBe(`${text.slice(0, idx + 2)}${ELLIPSIS}`);
    });

    test("falls back to characters when one token is too long", () => {
        expect(clampToWidth("Supercalifragilistic", 8, len)).toBe(`Superca${ELLIPSIS}`);
    });

    test("returns the original when max is not positive", () => {
        expect(clampToWidth("hello world", 0, len)).toBe("hello world");
    });
});
