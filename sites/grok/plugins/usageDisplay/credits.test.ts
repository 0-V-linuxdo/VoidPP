/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { decodeCreditsConfig, formatPercent, normalizeBotUsage, readNativeUsage } from "./credits";

function encodeVarint(value: number): number[] {
    const bytes: number[] = [];
    let remaining = value;
    while (remaining >= 0x80) {
        bytes.push((remaining & 0x7f) | 0x80);
        remaining >>>= 7;
    }
    bytes.push(remaining);
    return bytes;
}

function grpcFrame(payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(5 + payload.length);
    out[1] = (payload.length >>> 24) & 0xff;
    out[2] = (payload.length >>> 16) & 0xff;
    out[3] = (payload.length >>> 8) & 0xff;
    out[4] = payload.length & 0xff;
    out.set(payload, 5);
    return out;
}

function creditsPayload(opts: { percent?: number; resetSeconds?: number }): Uint8Array {
    const inner: number[] = [];
    if (opts.percent !== undefined) {
        inner.push(0x0d);
        const buf = new ArrayBuffer(4);
        new DataView(buf).setFloat32(0, opts.percent, true);
        inner.push(...new Uint8Array(buf));
    }
    if (opts.resetSeconds !== undefined) {
        inner.push(0x10);
        inner.push(...encodeVarint(opts.resetSeconds));
    }
    const innerBytes = new Uint8Array(inner);
    return grpcFrame(new Uint8Array([0x0a, ...encodeVarint(innerBytes.length), ...inner]));
}

describe("decodeCreditsConfig", () => {
    test("treats a missing proto3 percent field as 0", () => {
        const usage = decodeCreditsConfig(creditsPayload({ resetSeconds: 1_787_529_600 }));
        expect(usage?.weekly.usedPercent).toBe(0);
        expect(usage?.weekly.resetAt).toBe(1_787_529_600_000);
    });

    test("reads an explicit percent float", () => {
        const usage = decodeCreditsConfig(creditsPayload({ percent: 12.5, resetSeconds: 1_787_529_600 }));
        expect(usage?.weekly.usedPercent).toBe(12.5);
    });
});

describe("readNativeUsage", () => {
    test("reads SuperGrok Heavy 0% used", () => {
        const usage = readNativeUsage([
            "Weekly SuperGrok Heavy Limit",
            "0% used",
            "Resets August 24, 2026 at 12:20 AM",
        ]);
        expect(usage?.weekly.usedPercent).toBe(0);
        expect(usage?.weekly.resetAt).not.toBeNull();
    });
});

describe("formatPercent", () => {
    test("formats zero", () => {
        expect(formatPercent(0)).toBe("0%");
    });
});

describe("normalizeBotUsage", () => {
    test("maps usagePercent and nextResetAtMs", () => {
        const usage = normalizeBotUsage({
            usagePercent: 14.799767,
            nextResetAtMs: 1_789_330_762_805,
        });
        expect(usage?.weekly.label).toBe("Weekly Grok Bot Limit");
        expect(usage?.weekly.usedPercent).toBe(15);
        expect(usage?.weekly.resetAt).toBe(1_789_330_762_805);
        expect(usage?.weekly.resetText.length).toBeGreaterThan(0);
    });

    test("rejects missing percent", () => {
        expect(normalizeBotUsage({ nextResetAtMs: 1 })).toBeNull();
        expect(normalizeBotUsage(null)).toBeNull();
    });
});
