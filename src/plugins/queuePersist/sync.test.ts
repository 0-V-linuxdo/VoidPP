/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import {
    applyRowText,
    bindPending,
    fileIdsOf,
    freshSnaps,
    projectQueue,
    type QueueSnap,
    shouldReplay,
    TTL_MS,
} from "./sync";

const NOW = 1_700_000_000_000;

function snap(partial: Partial<QueueSnap> & Pick<QueueSnap, "id" | "text">): QueueSnap {
    return {
        fileAttachmentIds: [],
        parentQuotedText: "",
        parentId: null,
        position: 0,
        savedAt: NOW,
        ...partial,
    };
}

describe("queue persist sync", () => {
    test("refreshed empty official queue should replay", () => {
        const saved = [snap({ id: "a", text: "one", position: 0 }), snap({ id: "b", text: "two", position: 1 })];
        expect(shouldReplay(0, saved, NOW)).toBe(true);
        expect(shouldReplay(1, saved, NOW)).toBe(false);
        expect(shouldReplay(0, [], NOW)).toBe(false);
    });

    test("expired snaps are not replayed", () => {
        const saved = [snap({ id: "a", text: "old", savedAt: NOW - TTL_MS - 1 })];
        expect(freshSnaps(saved, NOW)).toEqual([]);
        expect(shouldReplay(0, saved, NOW)).toBe(false);
    });

    test("pending enqueue binds onto the new official id", () => {
        const pending = [snap({ id: "pending:1", text: "follow up", position: 99, intent: { modeId: "expert", modelMode: "expert", activeModelId: "grok-4" } })];
        const official = [{ id: "q1", position: 0, parentId: "p", text: "", fileAttachmentIds: [], parentQuotedText: "" }];
        const bound = bindPending([], official, pending, NOW);
        expect(bound.pending).toEqual([]);
        expect(bound.saved[0]?.id).toBe("q1");
        expect(bound.saved[0]?.text).toBe("follow up");
        expect(bound.saved[0]?.intent?.modeId).toBe("expert");
    });

    test("before hydrate an empty official queue does not wipe the sidecar", () => {
        const saved = [snap({ id: "a", text: "keep" })];
        expect(projectQueue(saved, [], [], false, NOW)).toEqual(saved);
    });

    test("after hydrate a cleared official queue drops the sidecar", () => {
        const saved = [snap({ id: "a", text: "gone" })];
        expect(projectQueue(saved, [], [], true, NOW)).toEqual([]);
    });

    test("a live pending enqueue blocks the wipe", () => {
        const saved = [snap({ id: "a", text: "keep" })];
        const pending = [snap({ id: "pending:1", text: "new" })];
        expect(projectQueue(saved, [], pending, true, NOW)).toEqual(saved);
    });

    test("official order wins and keeps sidecar text when the node has none", () => {
        const saved = [
            snap({ id: "a", text: "first", position: 0 }),
            snap({ id: "b", text: "second", position: 1 }),
        ];
        const official = [
            { id: "b", position: 0, parentId: null, text: "", fileAttachmentIds: [], parentQuotedText: "" },
            { id: "a", position: 1, parentId: null, text: "", fileAttachmentIds: [], parentQuotedText: "" },
        ];
        const next = projectQueue(saved, official, [], true, NOW + 5);
        expect(next.map(item => item.id)).toEqual(["b", "a"]);
        expect(next.map(item => item.text)).toEqual(["second", "first"]);
        expect(next[0]?.savedAt).toBe(NOW + 5);
        expect(next.find(item => item.id === "a")?.savedAt).toBe(NOW + 5);
    });

    test("removed ids are dropped once hydrated", () => {
        const saved = [snap({ id: "a", text: "stay" }), snap({ id: "b", text: "sent" })];
        const official = [{ id: "a", position: 0, parentId: null, text: "", fileAttachmentIds: [], parentQuotedText: "" }];
        expect(projectQueue(saved, official, [], true, NOW).map(item => item.id)).toEqual(["a"]);
    });

    test("node text and dom edits update the sidecar", () => {
        const saved = [snap({ id: "a", text: "hello world" })];
        const official = [{ id: "a", position: 0, parentId: null, text: "hello there", fileAttachmentIds: [], parentQuotedText: "" }];
        expect(projectQueue(saved, official, [], true, NOW)[0]?.text).toBe("hello there");
        const shortened = applyRowText(saved, [{ id: "a", text: "hello" }], NOW);
        expect(shortened[0]?.text).toBe("hello world");
        const edited = applyRowText(saved, [{ id: "a", text: "hello there" }], NOW);
        expect(edited[0]?.text).toBe("hello there");
    });

    test("file ids stay strings", () => {
        expect(fileIdsOf([" a ", { fileId: "b" }, { id: 1 }, "", { assetId: "c" }])).toEqual(["a", "b", "c"]);
    });
});
