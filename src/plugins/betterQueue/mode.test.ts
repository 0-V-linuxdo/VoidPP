/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { gatewaySendMode, keepBuildPreference, sessionNeedsUpdate, type SendModeInput } from "./modeSend";

function input(partial: Partial<SendModeInput>): SendModeInput {
    return {
        selected: "heavy",
        modelMode: "build",
        incognito: false,
        conversationId: "",
        adjusted: "",
        lastModel: undefined,
        inflight: "",
        buildTurn: false,
        markedBuild: false,
        ...partial,
    };
}

describe("gatewaySendMode", () => {
    test("a new chat sends the chip, not a stale modelMode", () => {
        expect(gatewaySendMode(input({ selected: "heavy", modelMode: "build" }))).toBe("heavy");
    });

    test("an untouched build conversation sends Build even when the chip says Heavy", () => {
        expect(gatewaySendMode(input({
            conversationId: "c1",
            selected: "heavy",
            modelMode: "heavy",
            lastModel: "build",
        }))).toBe("build");
    });

    test("a user pick on that conversation is what gets sent", () => {
        expect(gatewaySendMode(input({
            conversationId: "c1",
            selected: "heavy",
            adjusted: "heavy",
            lastModel: "build",
        }))).toBe("heavy");
    });

    test("a marked build chat with no lastModel yet still sends Build", () => {
        expect(gatewaySendMode(input({
            conversationId: "c1",
            selected: "heavy",
            markedBuild: true,
        }))).toBe("build");
    });

    test("a defined non-build lastModel keeps the chip", () => {
        expect(gatewaySendMode(input({
            conversationId: "c1",
            selected: "heavy",
            lastModel: "",
        }))).toBe("heavy");
    });

    test("incognito never sends Build", () => {
        expect(gatewaySendMode(input({ selected: "build", incognito: true }))).toBe("auto");
        expect(gatewaySendMode(input({ selected: "heavy", incognito: true, modelMode: "build" }))).toBe("heavy");
    });

    test("a private Build to Auto substitution keeps the stored Build preference", () => {
        expect(keepBuildPreference(true, true, "auto", "build")).toBe(true);
        expect(keepBuildPreference(true, false, "auto", "build")).toBe(false);
        expect(keepBuildPreference(true, true, "heavy", "build")).toBe(false);
        expect(keepBuildPreference(false, true, "auto", "build")).toBe(false);
    });
});

describe("sessionNeedsUpdate", () => {
    test("a known ack that is not the chip must update before send", () => {
        expect(sessionNeedsUpdate("build", "heavy", true)).toBe(true);
        expect(sessionNeedsUpdate("expert", "fast", true)).toBe(true);
    });

    test("a matching ack, a missing session, or an unknown ack does not wait", () => {
        expect(sessionNeedsUpdate("heavy", "heavy", true)).toBe(false);
        expect(sessionNeedsUpdate("MODEL_MODE_BUILD", "build", true)).toBe(false);
        expect(sessionNeedsUpdate("MODEL_MODE_BUILD", "heavy", true)).toBe(true);
        expect(sessionNeedsUpdate("build", "heavy", false)).toBe(false);
        expect(sessionNeedsUpdate(undefined, "heavy", true)).toBe(false);
        expect(sessionNeedsUpdate("", "heavy", true)).toBe(false);
        expect(sessionNeedsUpdate("heavy", "", true)).toBe(false);
    });
});
