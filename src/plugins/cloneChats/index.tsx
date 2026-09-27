/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { type ContextMenuLocationMap, MenuItem } from "@api/ContextMenus";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { CopyIcon } from "@components/icons";
import { React } from "@turbopack/common/react";
import { ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { ApiClients } from "@turbopack/common/utils";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { useIsStreaming } from "@utils/react";
import definePlugin from "@utils/types";

const logger = new Logger("CloneChats");

async function cloneChat(conversationId: string) {
    const lastResponseId = ResponseStore.useResponseStore.getState().nodesByConversationId[conversationId]?.at(-1)?.responseId;
    if (!lastResponseId) throw new Error("No responses found in conversation.");

    const { shareLinkId } = await ApiClients.chatApi.chatShareConversation({
        conversationId,
        body: { responseId: lastResponseId, allowIndexing: false },
    });

    if (!shareLinkId) throw new Error("Failed to create share link.");

    try {
        const { conversation } = await ApiClients.chatApi.chatCloneConversation({ shareLinkId, body: {} });
        if (conversation?.conversationId) {
            RoutingStore.useRoutingStore.getState().push({ page: "chat", conversationId: conversation.conversationId });
        }
    } finally {
        ApiClients.chatApi.chatDeleteShareLink({ shareLinkId }).catch(() => {});
    }
}

function CloneItem({ conversationId }: ContextMenuLocationMap["conversation"]) {
    const streaming = useIsStreaming(conversationId);

    return (
        <MenuItem onSelect={() => cloneChat(conversationId).catch(e => logger.error("Failed to clone chat:", e))} disabled={streaming}>
            <CopyIcon size={16} className="void-clone-icon" />
            Clone
        </MenuItem>
    );
}

export default definePlugin({
    name: "CloneChats",
    icon: CopyIcon,
    description: "Clone conversations from the context-menu.",
    authors: [Devs.Prism],
    tags: ["chats"],

    contextMenuItems: {
        conversation: {
            label: "Clone",
            render: ErrorBoundary.wrap(CloneItem),
        },
    },
});
