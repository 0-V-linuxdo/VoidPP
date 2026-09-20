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

    test("replaces the last overflowing word with an ellipsis", () => {
        expect(clampToWidth("do for your country", 7, len)).toBe(`do ${ELLIPSIS}`);
    });

    test("keeps a complete last word and replaces the next", () => {
        expect(clampToWidth("do for your", 10, len)).toBe(`do for ${ELLIPSIS}`);
    });

    test("replaces Kennedy's trailing for with an ellipsis", () => {
        const text = "Ask not what your country can do for you — ask what you can do for your country.";
        const prefix = "Ask not what your country can do for you — ask what you can do";
        const max = `${prefix} for`.length;
        expect(clampToWidth(text, max, len)).toBe(`${prefix} ${ELLIPSIS}`);
    });

    test("replaces a single overflowing word with an ellipsis", () => {
        expect(clampToWidth("Supercalifragilistic", 8, len)).toBe(ELLIPSIS);
    });

    test("returns the original when max is not positive", () => {
        expect(clampToWidth("hello world", 0, len)).toBe("hello world");
    });
});
