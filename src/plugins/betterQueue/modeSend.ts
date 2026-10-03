/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface SendModeInput {
    selected: string;
    modelMode: string;
    incognito: boolean;
    conversationId: string;
    /** `userAdjustedSessionModeByConversationId[cid]`. Empty means this chat was not picked by you. */
    adjusted: string;
    /** Undefined when the conversation has no `lastModel` yet. `""` is a real value and is not Build. */
    lastModel: string | undefined;
    inflight: string;
    buildTurn: boolean;
    markedBuild: boolean;
}

function modeSlug(s: string): string {
    return s.replace(/^MODEL_MODE_/, "").replaceAll("_", "-").toLowerCase();
}

/** The mode Grok's `resolveGatewaySessionModel` will put on the session. */
export function gatewaySendMode(input: SendModeInput): string {
    const selected = modeSlug(input.selected);
    const model = modeSlug(input.modelMode);
    if (input.incognito) return selected === "build" ? "auto" : selected;
    if (selected === "build") return "build";
    const inflight = modeSlug(input.inflight);
    if (inflight === "build") return "build";
    const last = input.lastModel === undefined ? undefined : modeSlug(input.lastModel);
    const adjusted = modeSlug(input.adjusted);
    // "没被改过": no user pick on this conversation, or the pick equals the conversation's own last model.
    const userChanged = !!adjusted && adjusted !== (last ?? "");
    if (userChanged) return selected || adjusted;
    if (!input.conversationId) return selected || model;
    if (last !== undefined) return last === "build" ? "build" : selected || model;
    if (input.buildTurn || input.markedBuild) return "build";
    return selected || model;
}

/** Private chats rewrite Build to Auto. That substitution must not overwrite a stored Build preference. */
export function keepBuildPreference(privateChat: boolean, substituted: boolean, settled: string, stored: string): boolean {
    return privateChat && substituted && settled === "auto" && stored === "build";
}
