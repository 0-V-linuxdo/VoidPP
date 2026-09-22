/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { VoidPPEventMap } from "@api/Events";
import { definePluginSettings, mergePluginSettings } from "@api/Settings";
import { CircleCheckIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { GrokConversation } from "@grok-types/stores/ConversationStore";
import type { MediaItem, MediaStoreState } from "@grok-types/stores/MediaStore";
import type { GatewayConversation, GatewayNode, MessageStoreState } from "@grok-types/stores/MessageStore";
import type { GrokResponse, ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { GrokRoute, RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, ConversationStore, MediaStore, MessageStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { clamp } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const logger = new Logger("CompleteToast");
const cl = classNameFactory("void-ct-");
const HOST = "void-ct-host";
const NS = "http://www.w3.org/2000/svg";
const LIVE_RESP = new Set(["streaming", "optimistic", "reconnecting"]);
const LIVE_PHASE = new Set(["sending", "streaming"]);
const LIVE_NODE = new Set(["skeleton", "send-queued", "send-sent", "ack-pending", "streaming"]);
const DEAD_ERR = new Set(["error", "stream-error", "send-error"]);
const USER_INTERRUPT = /interrupted by the user|user[- ]interrupt|aborted by the user|cancelled by the user|canceled by the user|请求被用户中断|被用户打断/i;
const SKIP_NOISE = /^(copy|share|retry|edit|more|thinking|analyzing|searching|continue from here|what can i help with\??|files|add files for grok to use in this project)$/i;
const FILES_CHROME = /add files for grok to use in this project/i;
const MD_FENCE = /```[\s\S]{0,4000}```/g;
const MD_LINK = /!?\[([^\]]{0,80})\]\([^)]{0,200}\)/g;
const MD_MARK = /[#*_>~`|-]+/g;
const WS_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|deepsearch)$/i;
const RETRY_MS = 80;
const PREVIEW_MAX = 120;
const TOASTED_MAX = 80;
const DURATION_MAX = 20;

const settings = definePluginSettings({
    keepUntilDismissed: {
        type: OptionType.BOOLEAN,
        description: "Don't auto-close the toast. Dismiss with X, or by opening the chat.",
        default: false,
    },
    duration: {
        type: OptionType.SLIDER,
        description: "Seconds before the toast closes. Ignored when Keep Until Dismissed is on.",
        min: 0,
        max: DURATION_MAX,
        default: 6,
    },
    showPreview: {
        type: OptionType.BOOLEAN,
        description: "Show a short preview of the finished reply.",
        default: true,
    },
    imagineGeneration: {
        type: OptionType.BOOLEAN,
        description: "Toast when an Imagine generation finishes while you are not on Imagine.",
        default: false,
    },
});

interface Toast {
    cid: string;
    rid: string;
    kind: "chat" | "imagine";
}

const live = new Set<string>();
const toasted = new Set<string>();
const toastedOrder: string[] = [];
let started = false;
let toast: Toast | null = null;
let host: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let hideAt = 0;
let remain = 0;
let paused = false;
let keys: AbortController | null = null;

function isConvId(value: unknown): value is string {
    return typeof value === "string" && value.length >= 8 && /^[a-z0-9_-]+$/i.test(value);
}

function asWorkspaceId(value: unknown): string {
    if (typeof value === "string") {
        const s = value.trim();
        return WS_ID.test(s) ? s : "";
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const id = asWorkspaceId(item);
            if (id) return id;
        }
        return "";
    }
    if (value && typeof value === "object") {
        const rec = value as Record<string, unknown>;
        return asWorkspaceId(rec.workspaceId ?? rec.id ?? rec.projectId);
    }
    return "";
}

function onBotPage(): boolean {
    try {
        if (RoutingStore.useRoutingStore.getState().route.page === "bot") return true;
    } catch { /* route not ready */ }
    try {
        const path = location.pathname.replace(/\/+$/, "") || "/";
        if (path === "/bot" || path.startsWith("/bot/")) return true;
    } catch { /* */ }
    return false;
}

function onImaginePage(): boolean {
    try {
        const page = String(RoutingStore.useRoutingStore.getState().route?.page ?? "");
        if (page.startsWith("imagine")) return true;
    } catch { /* route not ready */ }
    try {
        return (location.pathname.replace(/\/+$/, "") || "/").startsWith("/imagine");
    } catch {
        return false;
    }
}

function currentIds(): string[] {
    if (onBotPage()) return [];
    const ids: string[] = [];
    const add = (value: unknown) => {
        if (isConvId(value) && !ids.includes(value)) ids.push(value);
    };
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        add(page.conversationId);
        add(page.optimisticConversationId);
    } catch (e) {
        logger.debug("page ids unavailable:", e);
    }
    try {
        const { route } = RoutingStore.useRoutingStore.getState();
        add(route.conversationId);
        add(route.chat);
    } catch (e) {
        logger.debug("route ids unavailable:", e);
    }
    try {
        const url = new URL(location.href);
        add(url.searchParams.get("chat"));
        add(url.searchParams.get("conversationId"));
        add(url.pathname.match(/^\/(?:c|chat)\/([^/?#]+)/i)?.[1]);
    } catch (e) {
        logger.debug("url ids unavailable:", e);
    }
    return ids;
}

function errorBlob(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);
    const rec = value as Record<string, unknown>;
    return [rec.message, rec.code, rec.type, rec.name].filter(Boolean).map(String).join(" ");
}

function isUserInterrupt(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    const state = (r.state ?? "").trim().toLowerCase();
    if (state === "interrupted" || state === "stopped") return true;
    return USER_INTERRUPT.test(errorBlob(r.error)) || USER_INTERRUPT.test(String(r.message ?? ""));
}

function isLiveResponse(r: GrokResponse | undefined): boolean {
    if (!r || isUserInterrupt(r)) return false;
    if (r.partial) return true;
    const state = (r.state ?? "").trim().toLowerCase();
    return !!state && LIVE_RESP.has(state);
}

function isErrorResponse(r: GrokResponse | undefined): boolean {
    return !!r && !isUserInterrupt(r) && (r.state === "error" || r.error != null);
}

function lastAssistant(id: string, byConversationId: Record<string, GrokResponse[] | undefined>): GrokResponse | undefined {
    const list = byConversationId[id];
    if (!list?.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
        if (String(list[i].sender ?? "").toLowerCase() !== "human") return list[i];
    }
    return;
}

function lastHuman(id: string, byConversationId: Record<string, GrokResponse[] | undefined>): GrokResponse | undefined {
    const list = byConversationId[id];
    if (!list?.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
        if (String(list[i].sender ?? "").toLowerCase() === "human") return list[i];
    }
    return;
}

function lastAssistantNode(gw: GatewayConversation | undefined): GatewayNode | undefined {
    if (!gw) return;
    const leaf = gw.defaultLeafId ? gw.nodes?.[gw.defaultLeafId] : undefined;
    if (leaf?.role === "assistant") return leaf;
    let best: GatewayNode | undefined;
    for (const node of Object.values(gw.nodes ?? {})) {
        if (node.role !== "assistant") continue;
        if (!best || (node.createdAt ?? 0) > (best.createdAt ?? 0)) best = node;
    }
    return best;
}

function gatewayOf(cid: string): GatewayConversation | undefined {
    try {
        return MessageStore.useMessageStore.getState().conversations?.[cid];
    } catch (e) {
        logger.debug("MessageStore unavailable:", e);
        return;
    }
}

function isLiveCid(cid: string): boolean {
    const gw = gatewayOf(cid);
    const phase = String((gw?.activeGeneration as { phase?: string } | null | undefined)?.phase ?? "").trim().toLowerCase();
    if (LIVE_PHASE.has(phase)) return true;
    const node = lastAssistantNode(gw);
    if (node && LIVE_NODE.has(node.status)) return true;
    if (isLiveResponse(node?.content)) return true;
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        if (isLiveResponse(lastAssistant(cid, byConversationId))) return true;
    } catch (e) {
        logger.debug("ResponseStore live lookup failed:", e);
    }
    return false;
}

function isBadFinish(cid: string, rid: string): boolean {
    try {
        const response = rid ? ResponseStore.useResponseStore.getState().byId[rid] : lastAssistant(cid, ResponseStore.useResponseStore.getState().byConversationId);
        if (isUserInterrupt(response) || isErrorResponse(response)) return true;
    } catch { /* store */ }
    const node = lastAssistantNode(gatewayOf(cid));
    if (node && (DEAD_ERR.has(node.status) || isUserInterrupt(node.content) || isErrorResponse(node.content))) return true;
    if (node && USER_INTERRUPT.test(String(node.content?.message ?? ""))) return true;
    return false;
}

function cidOf(responseId: string): string {
    if (!responseId) return "";
    try {
        const { conversations } = MessageStore.useMessageStore.getState();
        for (const [id, gw] of Object.entries(conversations ?? {})) {
            const node = gw.nodes?.[responseId];
            const fromNode = node?.content?.conversationId;
            if (isConvId(fromNode)) return fromNode;
            if (node) return id;
            if (gw.activeGeneration?.assistantId === responseId || gw.activeGeneration?.responseId === responseId) return id;
        }
    } catch (e) {
        logger.debug("gateway cid lookup failed:", e);
    }
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const [id, list] of Object.entries(byConversationId ?? {})) {
            if (list?.some(r => r.responseId === responseId)) return id;
        }
    } catch (e) {
        logger.debug("response cid lookup failed:", e);
    }
    return "";
}

function convOf(cid: string): GrokConversation | undefined {
    try {
        const { byId, byIdWithWorkspaces } = ConversationStore.useConversationStore.getState();
        return byId[cid] ?? byIdWithWorkspaces[cid];
    } catch (e) {
        logger.debug("conversation lookup failed:", e);
        return;
    }
}

function workspaceOf(cid: string): string {
    try {
        const { byId, byIdWithWorkspaces } = ConversationStore.useConversationStore.getState();
        const resolved = ConversationStore.resolveConversationProjectWorkspaceId?.(byId[cid], byIdWithWorkspaces[cid]);
        const fromResolver = asWorkspaceId(resolved);
        if (fromResolver) return fromResolver;
        const conv = byId[cid] ?? byIdWithWorkspaces[cid];
        return asWorkspaceId(conv?.workspaceId) || asWorkspaceId(conv?.workspaces);
    } catch (e) {
        logger.debug("workspace lookup failed:", e);
        return "";
    }
}

function titleOf(cid: string): string {
    const title = String(convOf(cid)?.title ?? "").trim();
    if (title) return title;
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        const query = String(lastHuman(cid, byConversationId)?.query ?? lastHuman(cid, byConversationId)?.message ?? "").replaceAll(/\s+/g, " ").trim();
        if (query) return query.length > 48 ? `${query.slice(0, 47)}…` : query;
    } catch { /* store */ }
    return "Chat";
}

function stripPreview(text: string): string {
    const clean = text
        .replace(MD_FENCE, " ")
        .replace(MD_LINK, "$1")
        .replace(MD_MARK, " ")
        .replaceAll(/\s+/g, " ")
        .trim();
    if (!clean || SKIP_NOISE.test(clean) || FILES_CHROME.test(clean)) return "";
    return clean.length > PREVIEW_MAX ? `${clean.slice(0, PREVIEW_MAX - 1)}…` : clean;
}

function previewOf(cid: string, rid: string): string {
    if (!settings.store.showPreview) return "";
    try {
        const { byId, byConversationId } = ResponseStore.useResponseStore.getState();
        const fromId = rid ? byId[rid] : undefined;
        const last = fromId ?? lastAssistant(cid, byConversationId);
        const text = stripPreview(String(last?.message ?? ""));
        if (text) return text;
    } catch { /* store */ }
    try {
        const node = lastAssistantNode(gatewayOf(cid));
        if (node) {
            const mapped = MessageStore.nodeToResponse?.(cid, node);
            const text = stripPreview(String(mapped?.message ?? node.content?.message ?? ""));
            if (text) return text;
        }
    } catch { /* store */ }
    return "";
}

function markToasted(key: string) {
    if (!key || toasted.has(key)) return;
    toasted.add(key);
    toastedOrder.push(key);
    if (toastedOrder.length > TOASTED_MAX) {
        const old = toastedOrder.shift();
        if (old) toasted.delete(old);
    }
}

function hrefFor(id: string, ws: string): string {
    return ws ? `/project/${ws}?chat=${encodeURIComponent(id)}` : `/c/${encodeURIComponent(id)}`;
}

function applyChatPage(id: string, ws: string) {
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        chat.setConversationId(id || undefined);
        if (!id) chat.setOptimisticConversationId(undefined);
        chat.setProjectId(ws || undefined);
    } catch (e) {
        logger.debug("ChatPageStore update failed:", e);
    }
}

function navigateTo(id: string) {
    const cid = isConvId(id) ? id : "";
    if (!cid) return;
    const ws = workspaceOf(cid);
    try {
        const routing = RoutingStore.useRoutingStore.getState();
        const teamId = routing.route.teamId ?? null;
        const dest: GrokRoute = ws
            ? { page: "workspace", workspaceId: ws, tab: "conversations", conversationId: cid, teamId }
            : { page: "chat", conversationId: cid, temporary: convOf(cid)?.temporary ?? false, teamId };
        routing.push(dest);
        applyChatPage(cid, ws);
    } catch (e) {
        logger.error("Failed to navigate:", e);
        try {
            location.assign(hrefFor(cid, ws));
        } catch (navErr) {
            logger.error("Fallback navigation failed:", navErr);
        }
    }
}

function svgIcon(kind: "check" | "x"): SVGSVGElement {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", kind === "check" ? "0 0 24 24" : "0 0 15 15");
    svg.setAttribute("width", kind === "check" ? "16" : "14");
    svg.setAttribute("height", kind === "check" ? "16" : "14");
    svg.setAttribute("aria-hidden", "true");
    if (kind === "check") {
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "10");
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", "m9 12 2 2 4-4");
        svg.append(circle, path);
        return svg;
    }
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("clip-rule", "evenodd");
    path.setAttribute("d", "M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z");
    svg.append(path);
    return svg;
}

function clearTimer() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = undefined;
    paused = false;
    remain = 0;
}

function hide() {
    clearTimer();
    keys?.abort();
    keys = null;
    toast = null;
    host?.remove();
    host = null;
}

function isCurrentToast(): boolean {
    if (!toast) return false;
    const ids = currentIds();
    if (ids.includes(toast.cid)) return true;
    if (!toast.rid) return false;
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        return page.streamedMessageId === toast.rid || page.lastMessageId === toast.rid;
    } catch {
        return false;
    }
}

function dismissIfCurrent() {
    if (!toast) return;
    if (toast.kind === "imagine") {
        if (onImaginePage()) hide();
        return;
    }
    if (onBotPage() || isCurrentToast()) hide();
}

function shouldPersist() {
    return !!settings.store.keepUntilDismissed
        || clamp(settings.store.duration, 0, DURATION_MAX) <= 0;
}

function armTimer() {
    clearTimer();
    if (shouldPersist()) return;
    const ms = clamp(settings.store.duration, 0, DURATION_MAX) * 1000;
    hideAt = Date.now() + ms;
    hideTimer = setTimeout(hide, ms);
}

function migratePersist() {
    if (settings.store.duration !== 0 || settings.store.keepUntilDismissed) return;
    mergePluginSettings("CompleteToast", {
        keepUntilDismissed: true,
        duration: 6,
    });
}

function pauseTimer() {
    if (!hideTimer) return;
    remain = Math.max(0, hideAt - Date.now());
    clearTimeout(hideTimer);
    hideTimer = undefined;
    paused = true;
}

function resumeTimer() {
    if (!paused) return;
    paused = false;
    if (remain <= 0) {
        hide();
        return;
    }
    hideAt = Date.now() + remain;
    hideTimer = setTimeout(hide, remain);
}

function show(cid: string, rid: string, kind: "chat" | "imagine" = "chat", previewText = "") {
    hide();
    if (kind === "chat" && onBotPage()) return;
    if (kind === "imagine" && onImaginePage()) return;
    toast = { cid, rid, kind };
    const root = document.createElement("div");
    root.id = HOST;
    root.className = cl("host");
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    const card = document.createElement("div");
    card.className = cl("card");
    const main = document.createElement("button");
    main.type = "button";
    main.className = cl("main");
    const icon = document.createElement("span");
    icon.className = cl("icon");
    icon.append(svgIcon("check"));
    const body = document.createElement("span");
    body.className = cl("body");
    const title = document.createElement("span");
    title.className = cl("title");
    title.textContent = kind === "imagine" ? "Imagine ready" : titleOf(cid);
    body.append(title);
    const preview = kind === "imagine" ? previewText : previewOf(cid, rid);
    const sub = document.createElement("span");
    sub.className = cl("preview");
    sub.textContent = preview || (kind === "imagine" ? "Generation ready" : "Response ready");
    body.append(sub);
    main.append(icon, body);
    const x = document.createElement("button");
    x.type = "button";
    x.className = cl("x");
    x.setAttribute("aria-label", "Dismiss");
    x.append(svgIcon("x"));
    card.append(main, x);
    root.append(card);
    keys = new AbortController();
    const { signal } = keys;
    main.addEventListener("click", () => {
        const id = toast?.cid ?? cid;
        const k = toast?.kind ?? kind;
        hide();
        if (k === "imagine") navigateToImagine(id);
        else navigateTo(id);
    }, { signal });
    x.addEventListener("click", e => {
        e.stopPropagation();
        hide();
    }, { signal });
    root.addEventListener("pointerenter", pauseTimer, { signal });
    root.addEventListener("pointerleave", resumeTimer, { signal });
    document.body.append(root);
    host = root;
    armTimer();
}

function navigateToImagine(id: string) {
    try {
        const routing = RoutingStore.useRoutingStore.getState();
        const dest: GrokRoute = id
            ? { page: "imagine-post", postId: id, teamId: routing.route.teamId ?? null }
            : { page: "imagine", teamId: routing.route.teamId ?? null };
        routing.push(dest);
    } catch (e) {
        logger.error("Failed to navigate to Imagine:", e);
        try {
            location.assign(id ? `/imagine/post/${encodeURIComponent(id)}` : "/imagine");
        } catch (navErr) {
            logger.error("Fallback Imagine navigation failed:", navErr);
        }
    }
}

function isLiveMedia(p: MediaItem | undefined): boolean {
    if (!p) return false;
    if (p.complete) return false;
    if (p.moderated || p.isModerated) return false;
    if (p.progress != null && p.progress < 100) return true;
    if (p.inflightId) return true;
    if (p.blobSrc && !p.mediaUrl) return true;
    if (p.upscalingInProgress) return true;
    return false;
}

function liveMediaIds(s: MediaStoreState): string[] {
    const ids = new Set<string>();
    for (const p of Object.values(s.byId ?? {})) {
        if (isLiveMedia(p)) ids.add(p.id);
    }
    for (const [id, pending] of Object.entries(s.optimisticVideoGenPending ?? {})) {
        if (pending) ids.add(id);
    }
    return [...ids];
}

function mediaLiveKey(s: MediaStoreState): string {
    try {
        return liveMediaIds(s).toSorted().join(",");
    } catch {
        return "";
    }
}

function maybeFinishImagine(id: string) {
    if (!started || !settings.store.imagineGeneration || !id) return;
    if (onImaginePage()) return;
    const key = `imagine:${id}`;
    if (toasted.has(key)) return;
    let item: MediaItem | undefined;
    try {
        item = MediaStore.useMediaStore.getState().byId[id];
    } catch (e) {
        logger.debug("Imagine item unavailable:", e);
        return;
    }
    if (!item) return;
    if (item.complete === false && !item.mediaUrl) return;
    if (item.moderated || item.isModerated) return;
    markToasted(key);
    const prompt = (item.prompt ?? item.originalPrompt ?? "").trim();
    show(id, "", "imagine", settings.store.showPreview ? prompt.slice(0, PREVIEW_MAX) : "");
}

function syncImagine(current: string, prev: string) {
    if (!started || !settings.store.imagineGeneration) return;
    if (!prev) return;
    const now = new Set(current ? current.split(",") : []);
    for (const id of prev.split(",")) {
        if (!id || now.has(id)) continue;
        maybeFinishImagine(id);
    }
    dismissIfCurrent();
}

function rememberRid(cid: string, rid: string): string {
    if (rid) return rid;
    const node = lastAssistantNode(gatewayOf(cid));
    if (node?.id) return node.id;
    try {
        return lastAssistant(cid, ResponseStore.useResponseStore.getState().byConversationId)?.responseId ?? "";
    } catch {
        return "";
    }
}

function maybeFinish(cid: string, responseId = "") {
    if (!started || !isConvId(cid) || onBotPage()) return;
    if (currentIds().includes(cid)) {
        if (toast?.cid === cid) hide();
        return;
    }
    const rid = rememberRid(cid, responseId);
    if (isBadFinish(cid, rid)) return;
    if (rid && toasted.has(rid)) return;
    if (!rid && toasted.has(cid)) return;
    if (rid) markToasted(rid);
    else markToasted(cid);
    show(cid, rid);
}

function liveCids(): Set<string> {
    const ids = new Set<string>();
    try {
        for (const id of Object.keys(MessageStore.useMessageStore.getState().conversations ?? {})) {
            if (isLiveCid(id)) ids.add(id);
        }
    } catch (e) {
        logger.debug("gateway live scan failed:", e);
    }
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const [id, list] of Object.entries(byConversationId ?? {})) {
            if (list?.some(isLiveResponse)) ids.add(id);
        }
    } catch (e) {
        logger.debug("response live scan failed:", e);
    }
    return ids;
}

function seedToasted() {
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const id of Object.keys(byConversationId ?? {})) {
            const last = lastAssistant(id, byConversationId);
            if (last?.responseId && !isLiveResponse(last)) markToasted(last.responseId);
        }
    } catch (e) {
        logger.debug("seed responses failed:", e);
    }
    try {
        for (const [id, gw] of Object.entries(MessageStore.useMessageStore.getState().conversations ?? {})) {
            if (isLiveCid(id)) continue;
            const node = lastAssistantNode(gw);
            if (node?.id) markToasted(node.id);
        }
    } catch (e) {
        logger.debug("seed gateway failed:", e);
    }
}

function finishClosed() {
    try {
        const { byConversationId } = ResponseStore.useResponseStore.getState();
        for (const id of Object.keys(byConversationId ?? {})) {
            const last = lastAssistant(id, byConversationId);
            if (!last?.responseId || toasted.has(last.responseId)) continue;
            if (isLiveResponse(last) || isLiveCid(id)) continue;
            maybeFinish(id, last.responseId);
        }
    } catch (e) {
        logger.debug("closed scan failed:", e);
    }
}

function syncLive() {
    if (!started) return;
    const now = liveCids();
    for (const id of now) live.add(id);
    for (const id of live) {
        if (now.has(id)) continue;
        live.delete(id);
        maybeFinish(id);
    }
    finishClosed();
    dismissIfCurrent();
}

function onStreamEnd({ responseId }: VoidPPEventMap["streamEnd"]) {
    if (retryTimer) clearTimeout(retryTimer);
    const attempt = (retried: boolean) => {
        const cid = cidOf(responseId);
        if (!cid || isLiveCid(cid)) {
            if (!retried) retryTimer = setTimeout(() => attempt(true), RETRY_MS);
            return;
        }
        if (currentIds().includes(cid)) {
            if (toast?.cid === cid) hide();
            return;
        }
        maybeFinish(cid, responseId);
    };
    attempt(false);
}

function messageKey(s: MessageStoreState): string {
    const bits: string[] = [];
    for (const [id, gw] of Object.entries(s.conversations ?? {})) {
        const gen = gw.activeGeneration as { phase?: string; assistantId?: string; responseId?: string | null } | null;
        const node = lastAssistantNode(gw);
        bits.push(`${id}:${gen?.phase ?? ""}:${gen?.assistantId ?? gen?.responseId ?? ""}:${node?.status ?? ""}:${node?.id ?? ""}`);
    }
    return bits.join(",");
}

function responseKey(s: ResponseStoreState): string {
    const bits: string[] = [];
    for (const id of Object.keys(s.byConversationId ?? {})) {
        const last = lastAssistant(id, s.byConversationId);
        if (!last) continue;
        bits.push(`${id}:${last.responseId}:${last.state ?? ""}:${last.partial ? 1 : 0}`);
    }
    return bits.join(",");
}

function pageKey(s: ChatPageStoreState): string {
    return `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.streamedMessageId ?? ""}|${s.lastMessageId ?? ""}`;
}

function routeKey(s: RoutingStoreState): string {
    const { route } = s;
    return `${route.page ?? ""}|${route.conversationId ?? ""}|${route.chat ?? ""}`;
}

export default definePlugin({
    name: "CompleteToast",
    icon: CircleCheckIcon,
    description: "Toast when another chat finishes, click to open it. Optional Imagine generation toast is off by default.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    settings,
    startAt: StartAt.TurbopackReady,
    managedStyle: "completeToast",
    cleanupSelectors: [`.${HOST}`, `#${HOST}`],

    start() {
        migratePersist();
        started = true;
        live.clear();
        toasted.clear();
        toastedOrder.length = 0;
        seedToasted();
        syncLive();
    },

    stop() {
        started = false;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = undefined;
        hide();
        live.clear();
        toasted.clear();
        toastedOrder.length = 0;
    },

    onSettingsChange() {
        if (toast) armTimer();
    },

    events: {
        streamEnd: onStreamEnd,
    },

    zustand: {
        MessageStore: {
            selector: messageKey,
            handler: syncLive,
        },
        ResponseStore: {
            selector: responseKey,
            handler: syncLive,
        },
        ChatPageStore: {
            selector: pageKey,
            handler: dismissIfCurrent,
        },
        RoutingStore: {
            selector: routeKey,
            handler: dismissIfCurrent,
        },
        MediaStore: {
            selector: mediaLiveKey,
            handler: syncImagine,
        },
    },
});
