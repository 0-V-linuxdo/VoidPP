import type { ZustandStore } from "../zustand";

import type { GrokResponse } from "./ResponseStore";

export type GatewayNodeStatus =
    | "skeleton"
    | "send-queued"
    | "send-sent"
    | "ack-pending"
    | "streaming"
    | "complete"
    | "stream-error"
    | "send-error"
    | "unloaded";

export interface GatewayNode {
    id: string;
    parentId: string | null;
    role: "user" | "assistant";
    status: GatewayNodeStatus;
    childIds: string[];
    createdAt: number;
    content?: GrokResponse & { conversationId: string };
}

export interface GatewayQueueItem {
    queue_item_id: string;
    position: number;
    parent_response_id: string | null;
    item: unknown;
}

export interface GatewayActiveGeneration {
    userId: string;
    assistantId: string;
    responseId: string | null;
    sentModeId?: string;
}

export interface GatewayConversation {
    nodes: Record<string, GatewayNode>;
    rootChildIds: string[];
    defaultLeafId: string | null;
    queue: GatewayQueueItem[];
    activeGeneration: GatewayActiveGeneration | null;
    lastModel?: string;
    history: { hasMore: boolean; nextBeforeId: string | null };
}

export interface GatewayTurnArgs {
    convId: string;
    parentId: string | null;
    text: string;
    fileAttachmentIds?: string[];
    botMentions?: unknown;
    parentQuotedText?: string;
    parentQuoteSource?: unknown;
    linkQuery?: unknown;
}

export interface MessageStoreState {
    conversations: Record<string, GatewayConversation>;
    queueMessage: (args: GatewayTurnArgs) => void;
    sendMessage: (args: GatewayTurnArgs) => { userId: string; assistantId: string };
    removeQueuedMessage: (args: { convId: string; queueItemId: string }) => void;
    loadOlderHistory: (args: { convId: string; leafId: string; limit?: number }) => void;
}

export interface MessageStoreModule {
    useMessageStore: ZustandStore<MessageStoreState>;
    nodeToResponse: (conversationId: string, node: GatewayNode) => GrokResponse | undefined;
}
