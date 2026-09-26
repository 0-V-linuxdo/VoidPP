/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { type ContextMenuLocationMap, MenuItem } from "@api/ContextMenus";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { StarFilledIcon, StarIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ConversationStoreState, GrokConversation } from "@grok-types/stores/ConversationStore";
import type { MessageStoreState } from "@grok-types/stores/MessageStore";
import type { GrokRoute } from "@grok-types/stores/RoutingStore";
import { React } from "@turbopack/common/react";
import { ChatPageStore, ConversationStore, MessageStore, RoutingStore, SettingsStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { debounce, pageWindow } from "@utils/misc";
import definePlugin, { StartAt } from "@utils/types";

import { clipSnippet, groupStars, type StarGroup, type StarredMessage } from "./model";
import { dropStar, hasStar, putStar, reloadIfAccountChanged, stars, startStore, stopStore } from "./store";

const logger = new Logger("MessageStars");
const JUMP_SYM = Symbol.for("voidpp.betterNavigator.jump");
const PENDING_MS = 8000;
const OFFSET_PX = 72;
const PANEL_GAP = 8;
const NS = "http://www.w3.org/2000/svg";
const STAR_D = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

let alive = false;
let ac: AbortController | null = null;
let mo: MutationObserver | null = null;
let toggleBtn: HTMLButtonElement | null = null;
let panel: HTMLElement | null = null;
let paintKey = "";
let pinned = false;
let pendingTimer = 0;
let pending: { cid: string; id: string; until: number } | null = null;

function currentCid(): string {
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        return page.conversationId || page.optimisticConversationId || "";
    } catch (e) {
        logger.debug("chat page unavailable:", e);
        return "";
    }
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
    const conv = convOf(cid);
    if (!conv) return "";
    if (typeof conv.workspaceId === "string" && conv.workspaceId) return conv.workspaceId;
    for (const item of conv.workspaces ?? []) {
        if (typeof item === "string" && item) return item;
        if (item && typeof item === "object" && typeof item.workspaceId === "string" && item.workspaceId) return item.workspaceId;
    }
    return "";
}

function titleOf(cid: string): string {
    return String(convOf(cid)?.title ?? "").trim();
}

function temporaryOf(cid: string): boolean {
    return !!convOf(cid)?.temporary;
}

function shouldPersist(cid: string): boolean {
    try {
        if (SettingsStore.useSettingsStore.getState().isIncognito) return false;
    } catch { /* settings */ }
    if (temporaryOf(cid)) return false;
    try {
        const { route } = RoutingStore.useRoutingStore.getState();
        if (route?.temporary && currentCid() === cid) return false;
    } catch { /* route */ }
    return true;
}

function leafIds(cid: string): string[] {
    if (!cid) return [];
    try {
        const gw = MessageStore.useMessageStore.getState().conversations?.[cid];
        const leaf = gw?.defaultLeafId;
        const nodes = gw?.nodes;
        if (!leaf || !nodes?.[leaf]) return [];
        const out: string[] = [];
        const seen = new Set<string>();
        let id: string | null = leaf;
        let guard = 0;
        while (id && nodes[id] && guard++ < 500) {
            if (seen.has(id)) break;
            seen.add(id);
            out.push(id);
            id = nodes[id].parentId;
        }
        out.reverse();
        return out;
    } catch (e) {
        logger.debug("leaf walk failed:", e);
        return [];
    }
}

function knownIds(): Set<string> | null {
    try {
        const { byId, byIdWithWorkspaces } = ConversationStore.useConversationStore.getState();
        const ids = new Set<string>([...Object.keys(byId), ...Object.keys(byIdWithWorkspaces ?? {})]);
        return ids.size ? ids : null;
    } catch {
        return null;
    }
}

function titlesFor(list: readonly StarredMessage[]): Record<string, string> {
    const titles: Record<string, string> = {};
    for (const star of list) {
        if (titles[star.conversationId]) continue;
        const title = titleOf(star.conversationId);
        if (title) titles[star.conversationId] = title;
    }
    return titles;
}

function domSnippet(messageId: string): string {
    if (!messageId) return "";
    const label = document.querySelector(`.void-bn-item[data-response-id="${CSS.escape(messageId)}"] .void-bn-label`);
    return clipSnippet(label?.textContent ?? "");
}

function capture(cid: string, messageId: string, hint?: Partial<StarredMessage>): StarredMessage {
    let role = hint?.role;
    let fromNode = "";
    try {
        const node = MessageStore.useMessageStore.getState().conversations?.[cid]?.nodes?.[messageId];
        if (node?.role === "user" || node?.role === "assistant") role = node.role;
        const rec = node?.content;
        fromNode = role === "user" ? (rec?.query || rec?.message || "") : (rec?.message || "");
    } catch (e) {
        logger.debug("node lookup failed:", e);
    }
    const snippet = clipSnippet(fromNode) || clipSnippet(hint?.snippet || "") || domSnippet(messageId) || "Starred";
    const title = titleOf(cid) || hint?.conversationTitle || "";
    const ws = workspaceOf(cid) || hint?.workspaceId || "";
    return {
        conversationId: cid,
        messageId,
        role: role === "user" ? "user" : "assistant",
        snippet,
        conversationTitle: title || undefined,
        workspaceId: ws || undefined,
        starredAt: Date.now(),
    };
}

function flipStar(cid: string, messageId: string, hint?: Partial<StarredMessage>) {
    if (!cid || !messageId) return;
    if (hasStar(cid, messageId)) {
        dropStar(cid, messageId);
        return;
    }
    putStar(capture(cid, messageId, hint), shouldPersist(cid));
}

function roleFromResponse(response: ContextMenuLocationMap["message"]["response"]): "user" | "assistant" {
    const sender = String(response.sender ?? "").toLowerCase();
    if (sender === "human" || sender === "user") return "user";
    return "assistant";
}

function flipFromResponse(cid: string, messageId: string, response: ContextMenuLocationMap["message"]["response"]) {
    const role = roleFromResponse(response);
    const raw = role === "user" ? (response.query || response.message || "") : (response.message || response.query || "");
    flipStar(cid, messageId, { role, snippet: clipSnippet(String(raw)) });
}

function StarItem({ response }: ContextMenuLocationMap["message"]) {
    const messageId = response?.responseId;
    const cid = response?.conversationId || currentCid();
    if (!messageId || !cid) return null;
    const on = hasStar(cid, messageId);
    return (
        <MenuItem onSelect={() => flipFromResponse(cid, messageId, response)}>
            {on ? <StarFilledIcon size={16} /> : <StarIcon size={16} />}
            {on ? "Unstar" : "Star"}
        </MenuItem>
    );
}

function navigatorJump(messageId: string): boolean {
    const fn = (pageWindow as unknown as Record<symbol, unknown>)[JUMP_SYM];
    return typeof fn === "function" && (fn as (id: string) => boolean)(messageId) === true;
}

function findPane(el: HTMLElement): HTMLElement | null {
    const skip = "[data-sidebar], [class*='pane-card']";
    for (let node: HTMLElement | null = el.parentElement; node && node !== document.body; node = node.parentElement) {
        if (node.closest(skip)) continue;
        const oy = getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll") return node;
    }
    const scroller = document.querySelector<HTMLElement>("[data-testid='chat-transcript-scroller']");
    if (scroller && scroller.contains(el)) return scroller;
    return null;
}

function scrollResponse(el: HTMLElement): boolean {
    const pane = findPane(el);
    if (!pane) return false;
    const top = pane.scrollTop + (el.getBoundingClientRect().top - pane.getBoundingClientRect().top) - OFFSET_PX;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return true;
}

function jumpLocal(messageId: string): boolean {
    if (navigatorJump(messageId)) return true;
    const el = document.getElementById(`response-${messageId}`);
    return el instanceof HTMLElement && scrollResponse(el);
}

function clearPending() {
    pending = null;
    if (pendingTimer) window.clearInterval(pendingTimer);
    pendingTimer = 0;
}

function settlePending() {
    if (!pending) return;
    if (performance.now() > pending.until) {
        clearPending();
        return;
    }
    if (currentCid() !== pending.cid) return;
    if (jumpLocal(pending.id)) clearPending();
}

function armPending(cid: string, messageId: string) {
    pending = { cid, id: messageId, until: performance.now() + PENDING_MS };
    if (pendingTimer) window.clearInterval(pendingTimer);
    pendingTimer = window.setInterval(settlePending, 200);
    settlePending();
}

function navigate(star: StarredMessage) {
    const cid = star.conversationId;
    const ws = star.workspaceId || workspaceOf(cid);
    try {
        const routing = RoutingStore.useRoutingStore.getState();
        const teamId = routing.route?.teamId ?? null;
        const dest: GrokRoute = ws
            ? { page: "workspace", workspaceId: ws, tab: "conversations", conversationId: cid, teamId }
            : { page: "chat", conversationId: cid, temporary: temporaryOf(cid), teamId };
        routing.push(dest);
        const chat = ChatPageStore.useChatPageStore.getState();
        chat.setConversationId(cid);
        chat.setProjectId(ws || undefined);
    } catch (e) {
        logger.error("Failed to open starred message:", e);
        try {
            location.assign(ws ? `/project/${encodeURIComponent(ws)}?chat=${encodeURIComponent(cid)}` : `/c/${encodeURIComponent(cid)}`);
        } catch (navErr) {
            logger.error("Fallback navigation failed:", navErr);
        }
    }
}

function openStar(star: StarredMessage) {
    if (star.conversationId !== currentCid()) {
        navigate(star);
        armPending(star.conversationId, star.messageId);
        return;
    }
    if (!jumpLocal(star.messageId)) armPending(star.conversationId, star.messageId);
}

function starSvg(): SVGSVGElement {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", STAR_D);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
}

function railRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".void-bn-host");
}

function closePanel() {
    pinned = false;
    panel?.remove();
    panel = null;
    paintKey = "";
    if (toggleBtn) {
        toggleBtn.classList.remove("void-stars-open");
        toggleBtn.setAttribute("aria-expanded", "false");
    }
}

function detachRail() {
    closePanel();
    toggleBtn?.remove();
    toggleBtn = null;
}

function signature(groups: readonly StarGroup[]): string {
    return groups.map(group => `${group.conversationId}:${group.missing ? 1 : 0}:${group.title}:${group.items.map(item => `${item.messageId}:${item.snippet}`).join(",")}`).join(";");
}

function placePanel(el: HTMLElement, root: HTMLElement) {
    const rect = root.getBoundingClientRect();
    const width = Math.min(288, Math.max(160, window.innerWidth * 0.7));
    const maxHeight = Math.max(160, Math.min(window.innerHeight * 0.7, rect.height || window.innerHeight * 0.7));
    let left = rect.left - width - PANEL_GAP;
    if (left < 8) left = 8;
    let top = Math.max(8, rect.top);
    if (top + maxHeight > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - maxHeight);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${Math.round(width)}px`;
    el.style.maxHeight = `${Math.round(maxHeight)}px`;
}

function appendList(container: HTMLElement, groups: readonly StarGroup[]) {
    const head = document.createElement("div");
    head.className = "void-stars-head";
    const mark = document.createElement("span");
    mark.className = "void-stars-mark";
    mark.appendChild(starSvg());
    head.append(mark, document.createTextNode("Starred"));
    const body = document.createElement("div");
    body.className = "void-stars-body";
    const many = groups.length > 1;
    for (const group of groups) {
        if (many || !group.current) {
            const sub = document.createElement("div");
            sub.className = "void-stars-sub";
            sub.textContent = group.missing ? `${group.title} · unavailable` : group.title;
            body.appendChild(sub);
        }
        for (const star of group.items) {
            const row = document.createElement("div");
            row.className = group.missing ? "void-stars-row void-stars-missing" : "void-stars-row";
            const jump = document.createElement("button");
            jump.type = "button";
            jump.className = "void-stars-jump";
            const role = document.createElement("span");
            role.className = "void-stars-role";
            role.textContent = star.role === "user" ? "You" : "Grok";
            const snip = document.createElement("span");
            snip.className = "void-stars-snip";
            snip.textContent = star.snippet;
            jump.append(role, snip);
            jump.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                openStar(star);
            });
            const unstar = document.createElement("button");
            unstar.type = "button";
            unstar.className = "void-stars-unstar";
            unstar.setAttribute("aria-label", "Unstar");
            unstar.appendChild(starSvg());
            unstar.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                dropStar(star.conversationId, star.messageId);
            });
            row.append(jump, unstar);
            body.appendChild(row);
        }
    }
    container.append(head, body);
}

function currentGroups(): StarGroup[] {
    const list = stars();
    const cid = currentCid();
    return groupStars(list, cid, leafIds(cid), titlesFor(list), knownIds());
}

function makeToggle(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "void-stars-toggle";
    btn.setAttribute("aria-label", "Starred messages");
    btn.setAttribute("aria-expanded", "false");
    btn.appendChild(starSvg());
    btn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!stars().length) {
            closePanel();
            return;
        }
        if (pinned) closePanel();
        else {
            pinned = true;
            paintKey = "";
            paintRail();
        }
        btn.blur();
    });
    return btn;
}

function paintRail() {
    const list = stars();
    const root = railRoot();
    if (!list.length || !root) {
        detachRail();
        return;
    }
    if (!toggleBtn?.isConnected || toggleBtn.parentElement !== root) {
        toggleBtn?.remove();
        toggleBtn = makeToggle();
        root.appendChild(toggleBtn);
    }
    toggleBtn.classList.toggle("void-stars-open", pinned);
    toggleBtn.setAttribute("aria-expanded", pinned ? "true" : "false");
    if (!pinned) {
        panel?.remove();
        panel = null;
        paintKey = "";
        return;
    }
    const groups = currentGroups();
    const key = signature(groups);
    if (!panel?.isConnected) {
        panel?.remove();
        const next = document.createElement("div");
        next.className = "void-stars-panel";
        next.setAttribute("role", "dialog");
        next.setAttribute("aria-label", "Starred messages");
        document.body.appendChild(next);
        panel = next;
        paintKey = "";
    }
    if (key !== paintKey && panel) {
        panel.replaceChildren();
        appendList(panel, groups);
        paintKey = key;
    }
    if (panel) placePanel(panel, root);
}

function bindItemStar(item: HTMLElement) {
    let btn = item.querySelector<HTMLElement>(":scope > .void-stars-item-btn");
    if (btn) return btn;
    btn = document.createElement("span");
    btn.className = "void-stars-item-btn";
    btn.setAttribute("role", "button");
    btn.tabIndex = 0;
    btn.appendChild(starSvg());
    const activate = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        const messageId = item.dataset.responseId ?? "";
        const cid = currentCid();
        if (!messageId || !cid) return;
        flipStar(cid, messageId);
    };
    btn.addEventListener("click", activate);
    btn.addEventListener("pointerdown", ev => ev.stopPropagation());
    btn.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        activate(ev);
    });
    item.appendChild(btn);
    return btn;
}

function paintMarks() {
    const cid = currentCid();
    for (const tick of document.querySelectorAll<HTMLElement>(".void-bn-tick")) {
        const id = tick.dataset.responseId ?? "";
        tick.classList.toggle("void-bn-tick-star", !!cid && !!id && hasStar(cid, id));
    }
    for (const item of document.querySelectorAll<HTMLElement>(".void-bn-item")) {
        const id = item.dataset.responseId ?? "";
        const on = !!cid && !!id && hasStar(cid, id);
        if (!cid || !id) {
            item.querySelector(":scope > .void-stars-item-btn")?.remove();
            continue;
        }
        const btn = bindItemStar(item);
        btn.classList.toggle("void-stars-item-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.setAttribute("aria-label", on ? "Unstar" : "Star");
    }
}

function clearMarks() {
    for (const el of document.querySelectorAll<HTMLElement>(".void-bn-tick-star")) {
        el.classList.remove("void-bn-tick-star");
    }
    for (const btn of document.querySelectorAll(".void-stars-item-btn")) btn.remove();
}

function onPointerDown(e: PointerEvent) {
    if (!pinned || !panel) return;
    const { target } = e;
    if (!(target instanceof Node)) return;
    if (panel.contains(target) || toggleBtn?.contains(target)) return;
    closePanel();
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || !pinned) return;
    e.preventDefault();
    closePanel();
}

function onReflow() {
    if (!pinned || !panel) return;
    const root = railRoot();
    if (!root) {
        detachRail();
        return;
    }
    placePanel(panel, root);
}

function paintAll() {
    if (!alive) return;
    reloadIfAccountChanged();
    paintMarks();
    paintRail();
    settlePending();
}

const schedule = debounce(paintAll, 80);

function pageSlice(state: ChatPageStoreState): string {
    return `${state.conversationId ?? ""}|${state.optimisticConversationId ?? ""}`;
}

function messageSlice(state: MessageStoreState): string {
    const cid = currentCid();
    const gw = state.conversations?.[cid];
    if (!gw) return cid;
    return `${cid}|${gw.defaultLeafId ?? ""}|${Object.keys(gw.nodes ?? {}).length}`;
}

function convSlice(state: ConversationStoreState): string {
    return stars().map(star => `${star.conversationId}:${state.byId[star.conversationId]?.title ?? ""}`).join("|");
}

function start() {
    if (alive) return;
    alive = true;
    ac = new AbortController();
    const { signal } = ac;
    startStore(schedule);
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
    window.addEventListener("resize", onReflow, { signal });
    window.addEventListener("scroll", onReflow, { capture: true, passive: true, signal });
    mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}

function stop() {
    alive = false;
    ac?.abort();
    ac = null;
    mo?.disconnect();
    mo = null;
    clearPending();
    detachRail();
    clearMarks();
    stopStore();
}

export default definePlugin({
    name: "MessageStars",
    icon: StarIcon,
    description: "Star any message. Click the star on a navigator row, or open the list from the star above the ticks.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: false,
    startAt: StartAt.DOMContentLoaded,
    managedStyle: "messageStars",
    cleanupSelectors: [".void-stars-toggle", ".void-stars-panel", ".void-stars-item-btn"],
    contextMenuItems: {
        message: {
            label: "Star",
            render: ErrorBoundary.wrap(StarItem),
        },
    },
    start,
    stop,
    zustand: {
        ChatPageStore: { selector: pageSlice, handler: schedule },
        MessageStore: { selector: messageSlice, handler: schedule },
        ConversationStore: { selector: convSlice, handler: schedule },
    },
});
