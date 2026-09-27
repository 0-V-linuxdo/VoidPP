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

const CID_RE = /^[a-z0-9_-]{8,}$/i;

export interface ConversationHint {
    routeId?: string | null;
    routePage?: string | null;
    href?: string;
    pageId?: string | null;
    optimisticId?: string | null;
}

function cleanId(value: string | null | undefined): string {
    const id = String(value ?? "").trim();
    return CID_RE.test(id) ? id : "";
}

/** Conversation id from `/c/{id}`, `/chat/{id}`, or `?chat=`. Project ids are not conversations. */
export function conversationIdFromHref(href: string): string {
    let url: URL;
    try {
        url = new URL(href, "https://grok.com");
    } catch {
        return "";
    }
    const query = url.searchParams.get("chat")
        ?? url.searchParams.get("conversationId")
        ?? url.searchParams.get("conversation_id")
        ?? "";
    let decoded = query;
    try {
        decoded = decodeURIComponent(query);
    } catch { /* keep raw */ }
    const fromQuery = cleanId(decoded);
    if (fromQuery) return fromQuery;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "c" || parts[0] === "chat")) {
        let segment = parts[1];
        try {
            segment = decodeURIComponent(parts[1]);
        } catch { /* keep raw */ }
        return cleanId(segment);
    }
    return "";
}

/**
 * The open chat. A conversation in the URL beats a sticky store.
 * A location with no conversation id is empty, except an in-flight `chat`
 * route whose URL has not been rewritten yet.
 */
export function resolveConversationId(hint: ConversationHint): string {
    const fromUrl = hint.href ? conversationIdFromHref(hint.href) : "";
    if (fromUrl) return fromUrl;
    if (hint.href) {
        if (hint.routePage === "chat") return cleanId(hint.routeId) || cleanId(hint.optimisticId);
        return "";
    }
    return cleanId(hint.routeId) || cleanId(hint.pageId) || cleanId(hint.optimisticId);
}

/** Header list is this chat only. No cid means show nothing, not the whole library. */
export function starsForConversation(list: readonly StarredMessage[], cid: string): StarredMessage[] {
    if (!cid) return [];
    return list.filter(star => star.conversationId === cid);
}
