/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const SNIPPET_MAX = 60;

export interface StarredMessage {
    conversationId: string;
    messageId: string;
    role: "user" | "assistant";
    snippet: string;
    conversationTitle?: string;
    workspaceId?: string;
    starredAt: number;
}

export interface StarGroup {
    conversationId: string;
    title: string;
    current: boolean;
    missing: boolean;
    items: StarredMessage[];
}

export function starKey(conversationId: string, messageId: string): string {
    return `${conversationId}:${messageId}`;
}

export function clipSnippet(raw: string): string {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
}

export function groupStars(
    stars: readonly StarredMessage[],
    currentCid: string,
    leafIds: readonly string[],
    titles: Readonly<Record<string, string | undefined>>,
    knownIds: ReadonlySet<string> | null,
): StarGroup[] {
    const byCid = new Map<string, StarredMessage[]>();
    for (const star of stars) {
        if (!star.conversationId || !star.messageId) continue;
        const list = byCid.get(star.conversationId);
        if (list) list.push(star);
        else byCid.set(star.conversationId, [star]);
    }

    const leafIndex = new Map<string, number>();
    for (let i = 0; i < leafIds.length; i++) leafIndex.set(leafIds[i], i);

    const groups: StarGroup[] = [];
    for (const [cid, items] of byCid) {
        const current = !!currentCid && cid === currentCid;
        const sorted = items.slice().sort((a, b) => {
            if (current) {
                const ai = leafIndex.get(a.messageId);
                const bi = leafIndex.get(b.messageId);
                if (ai != null && bi != null) return ai - bi;
                if (ai != null) return -1;
                if (bi != null) return 1;
            }
            return b.starredAt - a.starredAt;
        });
        const stored = sorted.find(item => item.conversationTitle)?.conversationTitle;
        const title = titles[cid] || stored || "Chat";
        const missing = !current && knownIds != null && knownIds.size > 0 && !knownIds.has(cid);
        groups.push({ conversationId: cid, title, current, missing, items: sorted });
    }

    groups.sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        const at = a.items.reduce((max, item) => Math.max(max, item.starredAt), 0);
        const bt = b.items.reduce((max, item) => Math.max(max, item.starredAt), 0);
        return bt - at;
    });
    return groups;
}
