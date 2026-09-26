/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { StarIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ConversationStoreState, GrokConversation } from "@grok-types/stores/ConversationStore";
import type { MessageStoreState } from "@grok-types/stores/MessageStore";
import type { GrokRoute } from "@grok-types/stores/RoutingStore";
import { ChatPageStore, ConversationStore, MessageStore, RoutingStore, SettingsStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { debounce, pageWindow } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

import { clipSnippet, groupStars, type StarGroup, type StarredMessage } from "./model";
import { dropStar, hasStar, putStar, reloadIfAccountChanged, stars, startStore, stopStore } from "./store";

const logger = new Logger("MessageStars");
const JUMP_SYM = Symbol.for("voidpp.betterNavigator.jump");
const HOLD_MS = 550;
const SLOP_PX = 6;
const SUPPRESS_MS = 350;
const PENDING_MS = 8000;
const OFFSET_PX = 72;
const NS = "http://www.w3.org/2000/svg";
const STAR_D = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

const settings = definePluginSettings({
    showInSidebar: {
        type: OptionType.BOOLEAN,
        description: "Show starred messages in the left sidebar.",
        default: true,
    },
});

let alive = false;
let ac: AbortController | null = null;
let mo: MutationObserver | null = null;
let host: HTMLElement | null = null;
let pop: HTMLElement | null = null;
let paintKey = "";
let suppressUntil = 0;
let pendingTimer = 0;
let pending: { cid: string; id: string; until: number } | null = null;
let press: { cid: string; id: string; x: number; y: number; timer: number } | null = null;

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
        const route = RoutingStore.useRoutingStore.getState().route;
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

function toggle(cid: string, messageId: string, hint?: Partial<StarredMessage>) {
    if (!cid || !messageId) return;
    if (hasStar(cid, messageId)) {
        dropStar(cid, messageId);
        return;
    }
    putStar(capture(cid, messageId, hint), shouldPersist(cid));
}

function clearPress() {
    if (press) window.clearTimeout(press.timer);
    press = null;
}

function onPointerDown(e: PointerEvent) {
    if (pop && e.target instanceof Node && !pop.contains(e.target) && !host?.contains(e.target)) closePop();
    if (e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const tick = target.closest<HTMLElement>(".void-bn-tick");
    const messageId = tick?.dataset.responseId ?? "";
    const cid = currentCid();
    if (!tick || !messageId || !cid) return;
    clearPress();
    const timer = window.setTimeout(() => {
        const held = press;
        press = null;
        if (!held || currentCid() !== held.cid) return;
        suppressUntil = Date.now() + SUPPRESS_MS;
        toggle(held.cid, held.id);
    }, HOLD_MS);
    press = { cid, id: messageId, x: e.clientX, y: e.clientY, timer };
}

function onPointerMove(e: PointerEvent) {
    if (!press) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) clearPress();
}

function onClickCapture(e: MouseEvent) {
    if (Date.now() >= suppressUntil) return;
    e.preventDefault();
    e.stopPropagation();
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || !pop) return;
    e.preventDefault();
    closePop();
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
    closePop();
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

function closePop() {
    pop?.remove();
    pop = null;
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

function openPop(anchor: HTMLElement, groups: readonly StarGroup[]) {
    closePop();
    const panel = document.createElement("div");
    panel.className = "void-stars-pop";
    appendList(panel, groups);
    document.body.appendChild(panel);
    const rect = anchor.getBoundingClientRect();
    panel.style.left = `${Math.round(rect.right + 8)}px`;
    panel.style.top = `${Math.round(Math.max(8, rect.top))}px`;
    pop = panel;
}

function chatsAnchor(sidebar: Element): Element | null {
    const plus = sidebar.querySelector("[data-void-chats-plus], .void-chats-plus");
    const fromPlus = plus?.closest("[data-sidebar=group]");
    if (fromPlus) return fromPlus;
    for (const btn of sidebar.querySelectorAll<HTMLElement>("button[aria-expanded]")) {
        const label = (btn.getAttribute("aria-label") ?? "").trim();
        if (label === "Chats" || label === "History") return btn.closest("[data-sidebar=group]");
    }
    return null;
}

function isCollapsed(sidebar: Element): boolean {
    const state = sidebar.getAttribute("data-state") ?? sidebar.closest("[data-state]")?.getAttribute("data-state") ?? "";
    if (state === "collapsed") return true;
    const width = sidebar.getBoundingClientRect().width;
    return width > 0 && width < 88;
}

function signature(groups: readonly StarGroup[], collapsed: boolean): string {
    return `${collapsed ? 1 : 0}|${groups.map(group => `${group.conversationId}:${group.missing ? 1 : 0}:${group.title}:${group.items.map(item => `${item.messageId}:${item.snippet}`).join(",")}`).join(";")}`;
}

function paintMarks() {
    const cid = currentCid();
    for (const el of document.querySelectorAll<HTMLElement>(".void-bn-tick, .void-bn-item")) {
        const id = el.dataset.responseId ?? "";
        const on = !!cid && !!id && hasStar(cid, id);
        if (el.classList.contains("void-bn-tick")) {
            el.classList.toggle("void-bn-tick-star", on);
            if (on) el.setAttribute("aria-pressed", "true");
            else el.removeAttribute("aria-pressed");
        }
        if (el.classList.contains("void-bn-item")) el.classList.toggle("void-bn-item-star", on);
    }
}

function clearMarks() {
    for (const el of document.querySelectorAll<HTMLElement>(".void-bn-tick-star, .void-bn-item-star")) {
        el.classList.remove("void-bn-tick-star", "void-bn-item-star");
        el.removeAttribute("aria-pressed");
    }
}

function removeHost() {
    host?.remove();
    host = null;
    paintKey = "";
    closePop();
}

function paintSidebar() {
    if (!settings.store.showInSidebar) {
        removeHost();
        return;
    }
    const list = stars();
    const sidebar = document.querySelector("[data-sidebar=sidebar]");
    if (!list.length || !sidebar) {
        removeHost();
        return;
    }
    const anchor = chatsAnchor(sidebar);
    const parent = anchor?.parentElement ?? sidebar;
    const collapsed = isCollapsed(sidebar);
    const cid = currentCid();
    const groups = groupStars(list, cid, leafIds(cid), titlesFor(list), knownIds());
    const key = signature(groups, collapsed);
    if (host?.isConnected && host.parentElement === parent && key === paintKey) {
        if (anchor && host.nextElementSibling !== anchor) parent.insertBefore(host, anchor);
        return;
    }
    const next = document.createElement("div");
    next.className = collapsed ? "void-stars-host void-stars-collapsed" : "void-stars-host";
    if (!collapsed) appendList(next, groups);
    const rail = document.createElement("button");
    rail.type = "button";
    rail.className = "void-stars-rail";
    rail.setAttribute("aria-label", "Starred messages");
    rail.appendChild(starSvg());
    rail.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pop) closePop();
        else openPop(rail, groups);
    });
    next.appendChild(rail);
    host?.remove();
    if (anchor) parent.insertBefore(next, anchor);
    else parent.appendChild(next);
    host = next;
    paintKey = key;
    if (pop) {
        const anchorEl = rail;
        openPop(anchorEl, groups);
    }
}

function paintAll() {
    if (!alive) return;
    reloadIfAccountChanged();
    paintMarks();
    paintSidebar();
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
    document.addEventListener("pointermove", onPointerMove, { capture: true, signal });
    document.addEventListener("pointerup", clearPress, { capture: true, signal });
    document.addEventListener("pointercancel", clearPress, { capture: true, signal });
    document.addEventListener("click", onClickCapture, { capture: true, signal });
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
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
    clearPress();
    clearPending();
    removeHost();
    clearMarks();
    stopStore();
}

export default definePlugin({
    name: "MessageStars",
    icon: StarIcon,
    description: "Star any message. Starred ticks turn orange in the message rail, and the left sidebar lists them.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: false,
    startAt: StartAt.DOMContentLoaded,
    settings,
    managedStyle: "messageStars",
    cleanupSelectors: [".void-stars-host", ".void-stars-pop"],
    start,
    stop,
    onSettingsChange() {
        paintKey = "";
        schedule();
    },
    zustand: {
        ChatPageStore: { selector: pageSlice, handler: schedule },
        MessageStore: { selector: messageSlice, handler: schedule },
        ConversationStore: { selector: convSlice, handler: schedule },
    },
});
