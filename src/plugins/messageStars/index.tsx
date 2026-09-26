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
const PENDING_MS = 8000;
const OFFSET_PX = 72;
const NS = "http://www.w3.org/2000/svg";
const STAR_D = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";
const MSG_SEL = "[data-testid='user-message'], [data-testid='assistant-message']";
const COPY_RE = /^(copy|复制|拷贝)\b/i;
const EDIT_RE = /^(edit|编辑)\b/i;
const LIKE_RE = /^(like|good response|thumbs[- ]?up|upvote|喜欢|点赞)\b/i;
const NOT_LIKE_RE = /dislike|bad response|thumbs[- ]?down|downvote|不喜欢|点踩|^踩\b/i;
const NOT_COPY_RE = /\b(code|link|table|source)\b|代码|表格|链接|来源/i;

const settings = definePluginSettings({
    showInSidebar: {
        type: OptionType.BOOLEAN,
        description: "Show the starred list beside the message navigator.",
        default: true,
    },
});

let alive = false;
let ac: AbortController | null = null;
let mo: MutationObserver | null = null;
let panel: HTMLElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;
let listOpen = false;
let panelKey = "";
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

function toggle(cid: string, messageId: string, hint?: Partial<StarredMessage>) {
    if (!cid || !messageId) return;
    if (hasStar(cid, messageId)) {
        dropStar(cid, messageId);
        return;
    }
    putStar(capture(cid, messageId, hint), shouldPersist(cid));
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || !listOpen) return;
    e.preventDefault();
    listOpen = false;
    closePanel();
}

function onPointerDown(e: PointerEvent) {
    if (!listOpen) return;
    const { target } = e;
    if (!(target instanceof Node)) return;
    if (panel?.contains(target) || toggleBtn?.contains(target)) return;
    listOpen = false;
    closePanel();
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
    listOpen = false;
    closePanel();
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
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", STAR_D);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
}

function closePanel() {
    panel?.remove();
    panel = null;
    panelKey = "";
    toggleBtn?.classList.remove("void-stars-open");
    toggleBtn?.setAttribute("aria-expanded", "false");
}

function controlLabel(el: HTMLElement): string {
    return (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
}

function isCopyControl(el: HTMLElement): boolean {
    const label = controlLabel(el);
    return COPY_RE.test(label) && !NOT_COPY_RE.test(label);
}

function isEditControl(el: HTMLElement): boolean {
    return EDIT_RE.test(controlLabel(el));
}

function isLikeControl(el: HTMLElement): boolean {
    const label = controlLabel(el);
    return LIKE_RE.test(label) && !NOT_LIKE_RE.test(label);
}

function shellOf(msg: HTMLElement): HTMLElement {
    return msg.closest<HTMLElement>("[id^='response-']") ?? msg.parentElement ?? msg;
}

function inCodeChrome(btn: HTMLElement): boolean {
    if (btn.closest("pre, code")) return true;
    let node: HTMLElement | null = btn.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        if (node.querySelector(":scope > pre, :scope > code")) return true;
    }
    return false;
}

function barControls(row: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const btn of row.querySelectorAll<HTMLElement>("button, [role='button']")) {
        if (btn.classList.contains("void-stars-bubble") || inCodeChrome(btn)) continue;
        out.push(btn);
    }
    return out;
}

function ownsBubble(row: HTMLElement, bubble: HTMLElement): boolean {
    return row === bubble || row.contains(bubble) || bubble.contains(row);
}

function messageBar(shell: HTMLElement, bubble: HTMLElement): { row: HTMLElement; copy: HTMLElement } | null {
    let best: { row: HTMLElement; copy: HTMLElement; depth: number } | null = null;
    for (const btn of shell.querySelectorAll<HTMLElement>("button, [role='button']")) {
        if (btn.classList.contains("void-stars-bubble") || inCodeChrome(btn) || !isCopyControl(btn)) continue;
        let node = btn.parentElement;
        let depth = 1;
        while (node && node !== shell && node !== document.body && depth <= 8) {
            if (!ownsBubble(node, bubble)) {
                const buttons = barControls(node);
                const hasEdit = buttons.some(isEditControl);
                const hasLike = buttons.some(isLikeControl);
                const copies = buttons.filter(isCopyControl);
                const userBar = hasEdit && !hasLike;
                const asstBar = hasLike && !hasEdit;
                if ((userBar || asstBar) && copies.length >= 1 && copies.length <= 2 && buttons.length >= 2 && buttons.length <= 12) {
                    if (!best || depth < best.depth) best = { row: node, copy: btn, depth };
                    break;
                }
            }
            node = node.parentElement;
            depth++;
        }
    }
    return best ? { row: best.row, copy: best.copy } : null;
}

function placeAfterCopy(row: HTMLElement, star: HTMLButtonElement, copy: HTMLElement): boolean {
    let anchor: HTMLElement | null = copy;
    while (anchor && anchor.parentElement !== row) anchor = anchor.parentElement;
    if (!anchor || anchor.parentElement !== row) return false;
    if (star.parentElement === row && star.previousElementSibling === anchor) return true;
    anchor.after(star);
    return star.parentElement === row;
}

function adoptNative(star: HTMLButtonElement, copy: HTMLElement) {
    const native = copy.className.replaceAll(/\bvoid-stars-\S+/g, "").trim();
    if (!native || star.dataset.nativeClass === native) return;
    const on = star.classList.contains("void-stars-on");
    star.dataset.nativeClass = native;
    star.className = `${native} void-stars-bubble`;
    if (on) star.classList.add("void-stars-on");
}

function messageIdOf(msg: HTMLElement): string {
    if (msg.id.startsWith("response-")) return msg.id.slice("response-".length);
    const host = msg.closest<HTMLElement>("[id^='response-']");
    if (host?.id.startsWith("response-")) return host.id.slice("response-".length);
    return "";
}

function bubbleText(msg: HTMLElement): string {
    const copy = msg.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return "";
    copy.querySelectorAll("button, [role='button'], .void-stars-bubble").forEach(node => node.remove());
    return clipSnippet(copy.textContent ?? "");
}

function onBubbleClick(ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const { currentTarget } = ev;
    if (!(currentTarget instanceof HTMLElement)) return;
    const id = currentTarget.dataset.responseId || "";
    const cid = currentCid();
    if (!id || !cid) return;
    const role = currentTarget.dataset.role === "user" ? "user" : "assistant";
    const shell = currentTarget.closest<HTMLElement>("[id^='response-']");
    const msg = shell?.querySelector<HTMLElement>(MSG_SEL) ?? currentTarget.closest<HTMLElement>(MSG_SEL);
    toggle(cid, id, { role, snippet: msg ? bubbleText(msg) : "" });
}

function makeBubble(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "void-stars-bubble";
    btn.appendChild(starSvg());
    btn.addEventListener("click", onBubbleClick);
    return btn;
}

function syncBubble(btn: HTMLButtonElement, cid: string, id: string, role: "user" | "assistant") {
    const on = hasStar(cid, id);
    btn.dataset.responseId = id;
    btn.dataset.role = role;
    btn.classList.toggle("void-stars-on", on);
    btn.setAttribute("aria-label", on ? "Unstar" : "Star");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
}

function paintBubbles() {
    const cid = currentCid();
    const keep = new Set<HTMLElement>();
    const seen = new Set<HTMLElement>();
    for (const msg of document.querySelectorAll<HTMLElement>(MSG_SEL)) {
        const id = messageIdOf(msg);
        if (!cid || !id) continue;
        const found = messageBar(shellOf(msg), msg);
        if (!found || seen.has(found.row)) continue;
        seen.add(found.row);
        const { row, copy } = found;
        let btn = row.querySelector<HTMLButtonElement>(":scope > .void-stars-bubble");
        if (!btn) btn = makeBubble();
        if (!placeAfterCopy(row, btn, copy)) {
            if (!btn.isConnected) btn.remove();
            continue;
        }
        adoptNative(btn, copy);
        const role = msg.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
        syncBubble(btn, cid, id, role);
        keep.add(btn);
    }
    for (const btn of document.querySelectorAll<HTMLButtonElement>(".void-stars-bubble")) {
        if (!keep.has(btn)) btn.remove();
    }
}

function clearBubbles() {
    document.querySelectorAll(".void-stars-bubble").forEach(node => node.remove());
    document.querySelectorAll(".void-stars-rel").forEach(node => node.classList.remove("void-stars-rel"));
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

function signature(groups: readonly StarGroup[]): string {
    return groups.map(group => `${group.conversationId}:${group.missing ? 1 : 0}:${group.title}:${group.items.map(item => `${item.messageId}:${item.snippet}`).join(",")}`).join(";");
}

function railBox(): DOMRect | null {
    const ticks = document.querySelector<HTMLElement>(".void-bn-ticks");
    if (ticks) return ticks.getBoundingClientRect();
    const native = document.querySelector<HTMLElement>("button[aria-label^='Go to response ']");
    const box = native?.parentElement ?? native;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return rect;
}

function placeToggle(box: DOMRect) {
    if (!toggleBtn) return;
    const { top: boxTop, right: boxRight } = box;
    const size = 28;
    let top = boxTop - size - 4;
    if (top < 8) top = Math.max(8, boxTop);
    const left = Math.min(window.innerWidth - size - 8, Math.max(8, boxRight - size));
    toggleBtn.style.top = `${Math.round(top)}px`;
    toggleBtn.style.left = `${Math.round(left)}px`;
}

function placePanel(box: DOMRect) {
    if (!panel) return;
    const { top: boxTop, left: boxLeft, right: boxRight } = box;
    const width = panel.offsetWidth || 288;
    const height = panel.offsetHeight || 160;
    let left = boxLeft - width - 8;
    if (left < 8) left = Math.min(window.innerWidth - width - 8, boxRight + 8);
    let top = boxTop;
    const maxH = Math.max(120, window.innerHeight - top - 8);
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - Math.min(height, maxH) - 8);
    panel.style.maxHeight = `${Math.round(Math.min(maxH, window.innerHeight - 16))}px`;
    panel.style.left = `${Math.round(Math.max(8, left))}px`;
    panel.style.top = `${Math.round(top)}px`;
}

function ensureToggle() {
    if (toggleBtn?.isConnected) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "void-stars-toggle";
    btn.setAttribute("aria-label", "Starred messages");
    btn.setAttribute("aria-expanded", "false");
    btn.appendChild(starSvg());
    btn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        listOpen = !listOpen;
        if (!listOpen) closePanel();
        schedule();
    });
    document.body.appendChild(btn);
    toggleBtn = btn;
}

function removeToggle() {
    toggleBtn?.remove();
    toggleBtn = null;
}

function paintRail() {
    const list = stars();
    const box = railBox();
    if (!settings.store.showInSidebar || !list.length || !box) {
        listOpen = false;
        closePanel();
        removeToggle();
        return;
    }
    ensureToggle();
    placeToggle(box);
    if (!listOpen) {
        closePanel();
        return;
    }
    const groups = groupStars(list, currentCid(), leafIds(currentCid()), titlesFor(list), knownIds());
    const key = signature(groups);
    if (!panel || panelKey !== key) {
        panel?.remove();
        const next = document.createElement("div");
        next.className = "void-stars-panel";
        appendList(next, groups);
        document.body.appendChild(next);
        panel = next;
        panelKey = key;
    }
    placePanel(box);
    toggleBtn?.classList.add("void-stars-open");
    toggleBtn?.setAttribute("aria-expanded", "true");
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

function paintAll() {
    if (!alive) return;
    reloadIfAccountChanged();
    paintMarks();
    paintBubbles();
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
    document.addEventListener("scroll", schedule, { capture: true, signal });
    window.addEventListener("resize", schedule, { signal });
    mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}

function stop() {
    alive = false;
    listOpen = false;
    ac?.abort();
    ac = null;
    mo?.disconnect();
    mo = null;
    clearPending();
    closePanel();
    removeToggle();
    clearBubbles();
    clearMarks();
    stopStore();
}

export default definePlugin({
    name: "MessageStars",
    icon: StarIcon,
    description: "Star any message from its hover toolbar. Starred ticks turn orange, and the list sits beside the message navigator.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: false,
    startAt: StartAt.DOMContentLoaded,
    settings,
    managedStyle: "messageStars",
    cleanupSelectors: [".void-stars-bubble", ".void-stars-toggle", ".void-stars-panel", ".void-stars-host", ".void-stars-pop"],
    start,
    stop,
    onSettingsChange() {
        panelKey = "";
        if (!settings.store.showInSidebar) listOpen = false;
        schedule();
    },
    zustand: {
        ChatPageStore: { selector: pageSlice, handler: schedule },
        MessageStore: { selector: messageSlice, handler: schedule },
        ConversationStore: { selector: convSlice, handler: schedule },
    },
});
