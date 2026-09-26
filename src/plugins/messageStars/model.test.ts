/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { clipSnippet, groupStars, type StarredMessage, starKey } from "./model";

function star(partial: Partial<StarredMessage> & Pick<StarredMessage, "conversationId" | "messageId">): StarredMessage {
    return {
        role: "assistant",
        snippet: partial.messageId,
        starredAt: 1,
        ...partial,
    };
}

describe("message stars", () => {
    test("key is conversation plus message, never an index", () => {
        expect(starKey("c1", "m2")).toBe("c1:m2");
    });

    test("snippet clips on a character boundary", () => {
        expect(clipSnippet("  hello   world ")).toBe("hello world");
        expect(clipSnippet("a".repeat(61)).endsWith("…")).toBe(true);
        expect(clipSnippet("a".repeat(61)).length).toBe(61);
    });

    test("current chat follows the leaf, other chats sort by newest star", () => {
        const groups = groupStars(
            [
                star({ conversationId: "cur", messageId: "late", starredAt: 10 }),
                star({ conversationId: "cur", messageId: "early", starredAt: 50 }),
                star({ conversationId: "cur", messageId: "off", starredAt: 40 }),
                star({ conversationId: "old", messageId: "a", starredAt: 5, conversationTitle: "Old" }),
                star({ conversationId: "new", messageId: "b", starredAt: 80, conversationTitle: "New" }),
                star({ conversationId: "gone", messageId: "c", starredAt: 3, conversationTitle: "Gone" }),
            ],
            "cur",
            ["early", "late"],
            { cur: "Now" },
            new Set(["cur", "old", "new"]),
        );
        expect(groups.map(group => group.conversationId)).toEqual(["cur", "new", "old", "gone"]);
        expect(groups[0].items.map(item => item.messageId)).toEqual(["early", "late", "off"]);
        expect(groups[0].title).toBe("Now");
        expect(groups[0].current).toBe(true);
        expect(groups[3].missing).toBe(true);
        expect(groups[1].missing).toBe(false);
    });
});
