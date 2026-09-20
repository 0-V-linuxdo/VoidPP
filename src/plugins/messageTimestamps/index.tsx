/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { ClockIcon } from "@components/icons";
import { Text } from "@components/Text";
import type { GrokResponse } from "@grok-types";
import type { MessageStoreState } from "@grok-types/stores/MessageStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import { React } from "@turbopack/common/react";
import { ConversationStore, MessageStore, ResponseStore } from "@turbopack/common/stores";
import { ApiClients } from "@turbopack/common/utils";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { createExternalStore, debounce, pageWindow } from "@utils/misc";
import { useExternalStore } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";

import {
    asRecord,
    childTime,
    childTimeFromNodes,
    chooseTime,
    harvestResponses,
    isFresh,
    isHumanSender,
    isOptimisticState,
    neighborTime,
    parseTime,
    pickTimes,
    preferHumanTime,
    recordId,
    shouldPersistStamp,
    textKey,
    uuidTime,
} from "./time";

const logger = new Logger("MessageTimestamps");
const STAMP_MAX = 5000;
const RESPONSE_URL = /\/(?:load-responses|share_links|response-node)(?:\/|\?|$)/i;

const settings = definePluginSettings({
    showDate: {
        type: OptionType.BOOLEAN,
        description: "Show the full date for messages older than today.",
        default: true,
    },
    hideOwnMessages: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Hide timestamps on your own messages.",
    },
}).withPrivateSettings<{ stamps: Record<string, number> }>();

const tick = createExternalStore();
let cache: Map<string, number> | null = null;
let origFetch: typeof fetch | null = null;
let origXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let origXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
let origList: typeof ApiClients.chatApi.chatListResponses | null = null;
const xhrMeta = new WeakMap<XMLHttpRequest, string>();

function stamps(): Map<string, number> {
    if (cache) return cache;
    cache = new Map();
    const raw = settings.plain.stamps;
    if (raw && typeof raw === "object") {
        for (const [id, ms] of Object.entries(raw)) {
            if (typeof ms === "number" && Number.isFinite(ms)) cache.set(id, ms);
        }
    }
    return cache;
}

function persistNow() {
    const next: Record<string, number> = {};
    for (const [id, ms] of stamps()) next[id] = ms;
    settings.store.stamps = next;
}

const persist = debounce(persistNow, 400);

function remember(id: string, ms: number, sender?: unknown, state?: unknown, force = false): boolean {
    if (!id) return false;
    const map = stamps();
    const prev = map.get(id) ?? null;
    if (!force && !shouldPersistStamp(sender, ms, prev, Date.now(), state)) return false;
    if (map.has(id)) map.delete(id);
    map.set(id, ms);
    while (map.size > STAMP_MAX) {
        const oldest = map.keys().next().value;
        if (oldest == null) break;
        map.delete(oldest);
    }
    persist();
    return prev !== ms;
}

function conversationIdOf(id: string, rec: Record<string, unknown>): string {
    if (typeof rec.conversationId === "string") return rec.conversationId;
    try {
        const { byConversationId, nodesByConversationId } = ResponseStore.useResponseStore.getState();
        for (const [cid, list] of Object.entries(byConversationId ?? {})) {
            if (list?.some(r => r.responseId === id)) return cid;
        }
        for (const [cid, nodes] of Object.entries(nodesByConversationId ?? {})) {
            if (nodes?.some(n => n.responseId === id)) return cid;
        }
    } catch (e) {
        logger.debug("conversation id lookup failed", e);
    }
    return "";
}

function userKeys(rec: Record<string, unknown>, id: string): string[] {
    const keys: string[] = [];
    if (id) keys.push(`u:${id}`);
    const { parentResponseId } = rec;
    if (typeof parentResponseId === "string" && parentResponseId) keys.push(`u:p:${parentResponseId}`);
    const text = typeof rec.message === "string" && rec.message
        ? rec.message
        : (typeof rec.query === "string" ? rec.query : "");
    const fp = textKey(text);
    if (fp) {
        const cid = conversationIdOf(id, rec);
        keys.push(cid ? `u:t:${cid}:${fp}` : `u:t:${fp}`);
    }
    return keys;
}

function gatewayRecords(cid: string): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    try {
        const { conversations } = MessageStore.useMessageStore.getState();
        const slices = cid ? [conversations?.[cid]] : Object.values(conversations ?? {});
        for (const slice of slices) {
            for (const { status, content } of Object.values(slice?.nodes ?? {})) {
                if (!content) continue;
                const { responseId, sender, parentResponseId, createTime, thinkingStartTime, state } = content;
                out.push({
                    responseId,
                    sender,
                    parentResponseId,
                    thinkingStartTime,
                    createTime: status === "complete" ? undefined : createTime,
                    state: status === "ack-pending" ? "optimistic" : state,
                });
            }
        }
    } catch (e) {
        logger.debug("message store unavailable", e);
    }
    return out;
}

function gatewaySettled(cid: string, id: string): boolean {
    if (!cid) return false;
    try {
        return MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes?.[id]?.status === "complete";
    } catch (e) {
        logger.debug("message store unavailable", e);
        return false;
    }
}

function extraKeys(rec: Record<string, unknown>, id: string): string[] {
    const keys: string[] = [];
    if (id) keys.push(`h:${id}`);
    const { parentResponseId } = rec;
    if (typeof parentResponseId === "string" && parentResponseId) keys.push(`h:${parentResponseId}`);
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const [cid, list] of Object.entries(byConversationId ?? {})) {
            const index = list?.findIndex(r => r.responseId === id) ?? -1;
            if (index < 0) continue;
            keys.push(`h:${cid}:${index}`);
            break;
        }
    } catch (e) {
        logger.debug("stable key lookup failed", e);
    }
    return keys;
}

function storedMs(id: string, rec: Record<string, unknown>, user: boolean): number | null {
    const map = stamps();
    const keys = user ? userKeys(rec, id) : [id, ...extraKeys(rec, id)];
    for (const key of keys) {
        const ms = map.get(key);
        if (ms != null) return ms;
    }
    return null;
}

function rememberKeys(id: string, rec: Record<string, unknown>, ms: number, sender: unknown, user: boolean, force = false): boolean {
    const { state } = rec;
    let changed = false;
    if (user) {
        for (const key of userKeys(rec, id)) {
            if (remember(key, ms, "human", state, force)) changed = true;
        }
        return changed;
    }
    if (remember(id, ms, sender, state, force)) changed = true;
    for (const key of extraKeys(rec, id)) {
        if (remember(key, ms, sender, state, force)) changed = true;
    }
    return changed;
}

function storeRecords(id: string): Record<string, unknown>[] {
    try {
        const { byId, byConversationId } = ResponseStore.useResponseStore.getState();
        for (const list of Object.values(byConversationId ?? {})) {
            if (list?.some(r => r.responseId === id)) return list as unknown as Record<string, unknown>[];
        }
        return Object.values(byId ?? {}) as unknown as Record<string, unknown>[];
    } catch (e) {
        logger.debug("response store unavailable", e);
        return [];
    }
}

function borrowedMs(id: string, cid: string): number | null {
    if (cid) {
        const ms = neighborTime(id, gatewayRecords(cid));
        if (ms != null) return ms;
    }
    try {
        const { byId, nodesByConversationId } = ResponseStore.useResponseStore.getState();
        const lookup = byId as unknown as Record<string, Record<string, unknown> | undefined>;
        for (const nodes of Object.values(nodesByConversationId ?? {})) {
            const ms = childTimeFromNodes(id, (nodes ?? []) as unknown as Record<string, unknown>[], lookup);
            if (ms != null) return ms;
        }
        const records = [
            ...storeRecords(id),
            ...Object.values(lookup).filter((r): r is Record<string, unknown> => r != null),
        ];
        return neighborTime(id, records) ?? conversationCreateTime(id);
    } catch (e) {
        logger.debug("node neighbor lookup failed", e);
    }
    return neighborTime(id, storeRecords(id)) ?? conversationCreateTime(id);
}

function conversationCreateTime(id: string): number | null {
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const [cid, list] of Object.entries(byConversationId ?? {})) {
            const first = list?.find(r => isHumanSender(r.sender));
            if (first?.responseId !== id) continue;
            const conv = ConversationStore.useConversationStore.getState().byId?.[cid];
            const ms = parseTime(conv?.createTime);
            return ms != null && !isFresh(ms) ? ms : null;
        }
    } catch (e) {
        logger.debug("conversation time lookup failed", e);
    }
    return null;
}

function fullRecord(id: string, rec: Record<string, unknown>): Record<string, unknown> {
    if (!id) return rec;
    try {
        const hit = asRecord(ResponseStore.useResponseStore.getState().byId?.[id]);
        if (hit) return { ...rec, ...hit };
    } catch (e) {
        logger.debug("byId lookup failed", e);
    }
    return rec;
}

function resolveMs(response: GrokResponse, isUser?: boolean): number | null {
    const rec = asRecord(response);
    if (!rec) return null;
    const id = recordId(rec);
    const full = fullRecord(id, rec);
    const human = isUser === true || isHumanSender(full.sender);
    const sender = human ? "human" : full.sender;
    const cid = id ? conversationIdOf(id, full) : "";
    let authoritative: number | null = null;
    if (id) authoritative = human ? childTime(id, [...gatewayRecords(cid), ...storeRecords(id)]) : parseTime(full.thinkingStartTime);
    if (authoritative != null) {
        rememberKeys(id, full, authoritative, sender, human, true);
        return authoritative;
    }
    const stored = id ? storedMs(id, full, human) : null;
    const fieldTimes = (human && !isOptimisticState(full.state)) || gatewaySettled(cid, id) ? [] : pickTimes(full);
    let ms = chooseTime({
        fieldTimes,
        stored,
        uuid: uuidTime(id),
    });
    if (human && id) ms = preferHumanTime(ms, borrowedMs(id, cid));
    if (id && ms != null) rememberKeys(id, full, ms, sender, human);
    return ms;
}

function ingest(value: unknown) {
    let changed = false;
    for (const { id, ms, rec, authoritative } of harvestResponses(value)) {
        const human = isHumanSender(rec.sender);
        if (rememberKeys(id, rec, ms, rec.sender, human, authoritative)) changed = true;
    }
    if (changed) tick.notify();
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    try {
        return input.url;
    } catch {
        return "";
    }
}

function hookFetch() {
    if (origFetch) return;
    origFetch = pageWindow.fetch;
    pageWindow.fetch = function voidMessageTimestampsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = requestUrl(input);
        const promise = origFetch!.call(pageWindow, input, init);
        if (!RESPONSE_URL.test(url)) return promise;
        return promise.then(res => {
            try {
                res.clone().json().then(ingest, () => {});
            } catch (e) {
                logger.debug("fetch ingest failed", e);
            }
            return res;
        });
    } as typeof fetch;
}

function unhookFetch() {
    if (!origFetch) return;
    pageWindow.fetch = origFetch;
    origFetch = null;
}

function ingestXhr(xhr: XMLHttpRequest) {
    if (xhr.status < 200 || xhr.status >= 300) return;
    const { responseType } = xhr;
    if (responseType === "json") {
        ingest(xhr.response);
        return;
    }
    if (responseType !== "" && responseType !== "text") return;
    const text = xhr.responseText;
    if (!text) return;
    ingest(JSON.parse(text));
}

function hookXhr() {
    if (origXhrOpen) return;
    const XHR = pageWindow.XMLHttpRequest;
    origXhrOpen = XHR.prototype.open;
    origXhrSend = XHR.prototype.send;
    XHR.prototype.open = function voidMessageTimestampsOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
        try {
            xhrMeta.set(this, requestUrl(url));
        } catch (e) {
            logger.debug("xhr open failed", e);
        }
        return (origXhrOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    };
    XHR.prototype.send = function voidMessageTimestampsSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
        const url = xhrMeta.get(this) ?? "";
        if (RESPONSE_URL.test(url)) {
            this.addEventListener("load", () => {
                try {
                    ingestXhr(this);
                } catch (e) {
                    logger.debug("xhr ingest failed", e);
                }
            }, { once: true });
        }
        return origXhrSend!.call(this, body);
    };
}

function unhookXhr() {
    if (!origXhrOpen || !origXhrSend) return;
    const XHR = pageWindow.XMLHttpRequest;
    XHR.prototype.open = origXhrOpen;
    XHR.prototype.send = origXhrSend;
    origXhrOpen = null;
    origXhrSend = null;
}

function hookListResponses() {
    if (origList) return;
    try {
        const { chatApi } = ApiClients;
        origList = chatApi.chatListResponses;
        chatApi.chatListResponses = function voidMessageTimestampsList(a: { conversationId: string }) {
            return origList!.call(chatApi, a).then(data => {
                ingest(data);
                return data;
            });
        };
    } catch (e) {
        origList = null;
        logger.debug("chatListResponses wrap skipped", e);
    }
}

function unhookListResponses() {
    if (!origList) return;
    try {
        ApiClients.chatApi.chatListResponses = origList;
    } catch (e) {
        logger.debug("chatListResponses unwrap skipped", e);
    }
    origList = null;
}

function formatTimestamp(ms: number, showDate: boolean) {
    const date = new Date(ms);
    const now = new Date();
    const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!showDate || today) return time;
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

export default definePlugin({
    name: "MessageTimestamps",
    icon: ClockIcon,
    description: "Shows timestamps on chat messages.",
    authors: [Devs.Prism, Devs.p],
    tags: ["chat"],
    settings,

    start() {
        try {
            hookFetch();
            hookXhr();
            hookListResponses();
        } catch (e) {
            logger.warn("Failed to hook network", e);
        }
    },

    stop() {
        unhookFetch();
        unhookXhr();
        unhookListResponses();
        persistNow();
    },

    zustand: {
        ResponseStore: {
            selector: (s: ResponseStoreState) => {
                let n = 0;
                for (const list of Object.values(s.nodesByConversationId ?? {})) n += list?.length ?? 0;
                return `${Object.keys(s.byId ?? {}).length}:${n}`;
            },
            handler() {
                try {
                    const { byId, nodesByConversationId } = ResponseStore.useResponseStore.getState();
                    ingest({
                        responses: Object.values(byId ?? {}),
                        nodes: Object.values(nodesByConversationId ?? {}).flat(),
                    });
                } catch (e) {
                    logger.debug("store ingest failed", e);
                }
            },
        },
        MessageStore: {
            selector: (s: MessageStoreState) => {
                let n = 0;
                for (const slice of Object.values(s.conversations ?? {})) n += Object.keys(slice?.nodes ?? {}).length;
                return n;
            },
            handler() {
                ingest({ responses: gatewayRecords("") });
            },
        },
    },

    _renderTimestamp: ErrorBoundary.wrap(({ response, isUser }: { response: GrokResponse; isUser?: boolean }) => {
        useExternalStore(tick);
        const human = isUser === true || isHumanSender(response.sender);
        if (settings.store.hideOwnMessages && human) return null;
        const ms = resolveMs(response, isUser);
        if (ms == null) return null;
        return (
            <Text as="span" size="xs" color="muted" className="void-timestamp">
                {formatTimestamp(ms, settings.store.showDate)}
            </Text>
        );
    }),

    patches: [
        {
            find: "response-family:handleEditSave",
            all: true,
            replacement: {
                match: /\(0,\i\.jsx\)\(\i\.MessageBubble,\{isUser:(\i),isIncognito:\i,responseId:(\i)\.responseId/,
                replace: "$self._renderTimestamp({response:$2,isUser:$1}),$&",
            },
        },
    ],
});
