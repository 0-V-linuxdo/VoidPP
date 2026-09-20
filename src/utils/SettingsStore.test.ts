/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { LEGACY_WRITE_STOPPED } from "./constants";
import { LEGACY_STORAGE_KEY, parseStoredSettings, STORAGE_KEY } from "./SettingsStore";

describe("parseStoredSettings", () => {
    test("returns objects as-is", () => {
        const raw = { plugins: { NoDictation: { enabled: true } } };
        expect(parseStoredSettings(raw)).toEqual(raw);
    });

    test("parses a JSON string", () => {
        const raw = { plugins: { UsageDisplay: { enabled: true, usageStats: false } } };
        expect(parseStoredSettings(JSON.stringify(raw))).toEqual(raw);
    });

    test("parses a double-encoded JSON string", () => {
        const raw = { plugins: { Settings: { enabled: true } } };
        expect(parseStoredSettings(JSON.stringify(JSON.stringify(raw)))).toEqual(raw);
    });

    test("returns null for empty, invalid, or non-object values", () => {
        expect(parseStoredSettings(null)).toBe(null);
        expect(parseStoredSettings()).toBe(null);
        expect(parseStoredSettings("")).toBe(null);
        expect(parseStoredSettings("not json")).toBe(null);
        expect(parseStoredSettings("[]")).toBe(null);
        expect(parseStoredSettings(42)).toBe(null);
    });
});

describe("storage keys", () => {
    test("writes VoidPPSettings only after LEGACY_WRITE_STOPPED", () => {
        expect(STORAGE_KEY).toBe("VoidPPSettings");
        expect(LEGACY_STORAGE_KEY).toBe("VoidSettings");
        expect(LEGACY_WRITE_STOPPED).toBe("[20260912]");
    });

    test("save() never writes the legacy key", async () => {
        const src = await Bun.file(new URL("./SettingsStore.ts", import.meta.url)).text();
        const start = src.indexOf("private save()");
        const end = src.indexOf("public markAsChanged");
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const save = src.slice(start, end);
        expect(save).toContain("STORAGE_KEY");
        expect(save).not.toContain("LEGACY_STORAGE_KEY");
        expect(save).not.toContain("VoidSettings");
    });
});
