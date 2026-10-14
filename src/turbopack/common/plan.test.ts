/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { getPlanName } from "./plan";

describe("getPlanName", () => {
    test("legacy SuperGrok Pro is Heavy after the product merge", () => {
        expect(getPlanName("SUBSCRIPTION_TIER_SUPER_GROK_PRO")).toBe("SuperGrok Heavy");
    });

    test("legacy SuperGrok Plus keeps its name", () => {
        expect(getPlanName("SUBSCRIPTION_TIER_SUPER_GROK_PLUS")).toBe("SuperGrok Plus");
    });

    test("commerce billing uses the unified X names", () => {
        expect(getPlanName("SUBSCRIPTION_TIER_SUPER_GROK_PRO", undefined, true)).toBe("Ultra");
        expect(getPlanName("SUBSCRIPTION_TIER_GROK_PRO", undefined, true)).toBe("Premium");
        expect(getPlanName("SUBSCRIPTION_TIER_SUPER_GROK_PLUS", undefined, true)).toBe("Super");
        expect(getPlanName("SUBSCRIPTION_TIER_SUPER_GROK_LITE", undefined, true)).toBe("Plus");
    });

    test("missing subscription is Free", () => {
        expect(getPlanName(undefined, "")).toBe("Free");
    });

    test("x subscription still names a plan when grok tier is absent", () => {
        expect(getPlanName(undefined, "Premium")).toBe("X Premium");
    });
});
