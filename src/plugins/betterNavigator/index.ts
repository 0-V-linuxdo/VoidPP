/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { VoidPPEventMap } from "@api/Events";
import { definePluginSettings } from "@api/Settings";
import { ScrollTextIcon } from "@components/icons";
import type { ChatPageStoreState, GrokResponse, ResponseStoreState } from "@grok-types";
import type { GatewayConversation, GatewayNode, MessageStoreState } from "@grok-types/stores/MessageStore";
import { ChatPageStore, MessageStore, ResponseStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { debounce, pageWindow } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const logger = new Logger("BetterNavigator");
const cl = classNameFactory("void-bn-");
const MSG_SEL = "[data-testid='user-message'], [data-testid='assistant-message']";
const ASST_SEL = "[data-testid='assistant-message']";
const TICK_SEL = "button[aria-label^='Go to response ']";
const PREV_SEL = "button[aria-label='Navigate to previous message']";
const NEXT_SEL = "button[aria-label='Navigate to next message']";
const PANE_SKIP = "[data-sidebar], [class*='pane-card']";
const STRIP_SEL = [
    "button", "svg", "nav", "time", ".void-timestamp", "[class*='timestamp']",
    "details", "[data-testid*='think']", "[class*='thinking']", "[class*='Thought']",
    "[aria-label*='Thought']", "[role='toolbar']", "pre",
    "[class*='citation']", "[data-testid*='citation']", "[data-testid*='source']",
    "[aria-label*='source' i]", "[aria-label*='citation' i]",
].join(",");
const CHIP_RE = /^(?:\d+\s+)?sources?$|^web search$|^代码$|^code$/i;
const THINK_SEL = "[data-testid*='think'], [class*='thinking'], [class*='Thought'], [aria-label*='Thought']";
const STOP_SEL = [
    'button[aria-label="Stop model response"]',
    'button[aria-label="停止模型回复"]',
    'button[aria-label="停止生成"]',
].join(", ");
const DONE_ACTION_SEL = [
    'button[aria-label*="Regenerate" i]',
    'button[aria-label="Retry"]',
    'button[aria-label="Redo"]',
    'button[aria-label="重新生成"]',
    'button[aria-label="Like"]',
    'button[aria-label="Dislike"]',
    'button[aria-label="Good response"]',
    'button[aria-label="Bad response"]',
].join(", ");
const SETTLED_RE = /\b(?:worked for|thought for)\b|工作了|思考了|思考用时/i;
const MEDIA_SEL = "img, picture, video, canvas";
const FILE_SEL = "a[download], [data-testid*='file'], [class*='attachment']";
const DECORATIVE_SRC = /shields\.io|iconify\.design|badgen\.net|favicon|api\.iconify/i;
const GROK_ASSET = /assets\.grok\.com/i;
const NOISE_TEXT = /^(copy|share|retry|edit|more|thinking|analyzing|searching|thoughts?)$/i;
const USER_INTERRUPT = /interrupted by the user|user[- ]interrupt|aborted by the user|cancelled by the user|canceled by the user|请求被用户中断|被用户打断/i;
const LIVE = new Set(["streaming", "optimistic", "reconnecting", "in_progress", "in-progress"]);
const DEAD = new Set(["closed", "error", "done", "completed", "complete", "cancelled", "canceled", "aborted", "idle", "success", "worked", "failed", "interrupted", "stopped", "stream-error", "send-error"]);
const HIDE_CLASS = "void-bn-hidetip";
const LIVE_LABEL = "正在输出…";
const LOADING_LABEL = "加载中…";
const SUMMARY_MAX = 60;
const FLASH_MS = 2000;
const FLASH_REDUCED_MS = 1000;
const THRESHOLD = 0.28;
const HEAD_HYST = 24;
const EDGE_PX = 8;
const EDGE_TAIL = 80;
const OFFSET_PX = 72;
const LOCK_MS = 1000;
const LOCK_FAST_MS = 280;
const FAR_VIEWPORTS = 2.5;
const DENSE_N = 16;
const SLOT_CLASS = "void-bn-rail";
const HYDRATE_MS = 2400;
const HYDRATE_STEP = 80;
const LIVE_NODE = new Set(["streaming", "optimistic", "reconnecting", "send-sent", "ack-pending", "send-queued", "skeleton"]);
const LIVE_PHASE = new Set(["sending", "streaming"]);
const JUMP_SYM = Symbol.for("voidpp.betterNavigator.jump");

const settings = definePluginSettings({
    showAssistant: {
        type: OptionType.BOOLEAN,
        description: "List assistant replies in the navigator, not only your messages.",
        default: true,
    },
    hideNativeHover: {
        type: OptionType.BOOLEAN,
        description: "Hide Grok's single-message hover preview on the native ticks.",
        default: true,
    },
    jumpEffect: {
        type: OptionType.SELECT,
        description: "Highlight the message after jumping to it.",
        options: [
            { label: "Highlight border", value: "border", default: true },
            { label: "None", value: "none" },
        ],
    },
});

type Role = "user" | "assistant";

interface NavItem {
    id?: string;
    el: HTMLElement | null;
    role: Role;
    text: string;
    live?: boolean;
}

let ac: AbortController | null = null;
let paneMo: MutationObserver | null = null;
let mainMo: MutationObserver | null = null;
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;
let host: HTMLElement | null = null;
let rail: HTMLElement | null = null;
let frameTouched: HTMLElement | null = null;
let framePrevPos = "";
let paintedKey = "";
let lastPath = "";
let lastNav: NavItem[] = [];
let flashTimer = 0;
let flashing: HTMLElement | null = null;
let raf = 0;
let activeIdx = 0;
let activeSource: "native" | "list" = "list";
let lockIdx = -1;
let lockUntil = 0;
let overMenu = false;
let observedPane: HTMLElement | null = null;
let hydrateGen = 0;
let olderAsked = "";
const labelCache = new Map<string, string>();

function isVisible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function scrolls(el: HTMLElement): boolean {
    const oy = getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll";
}

function reduceMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    if (t.closest(".query-bar, [contenteditable='true']")) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function chatPath(): string {
    return `${location.pathname}${location.search}`;
}

function nativeTicks(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>(TICK_SEL)].filter(isVisible);
}

function nativeSlot(): HTMLElement | null {
    const tick = document.querySelector<HTMLElement>(TICK_SEL);
    const prev = document.querySelector<HTMLElement>(PREV_SEL);
    const next = document.querySelector<HTMLElement>(NEXT_SEL);
    const start = tick ?? prev ?? next;
    const slot = start?.closest<HTMLElement>(".absolute") ?? null;
    if (!slot || !isVisible(slot)) return null;
    return slot;
}

function chatPane(): HTMLElement | null {
    const main = document.querySelector("main");
    if (!main) return null;
    const skip = (n: HTMLElement) => !!n.closest(PANE_SKIP);
    const msg = main.querySelector<HTMLElement>(MSG_SEL);
    if (msg) {
        const col = msg.closest<HTMLElement>("[class*='overflow-y-auto'], [class*='overflow-auto']");
        if (col && !skip(col)) return col;
    }
    let best: HTMLElement | null = null;
    let bestScore = 0;
    for (const n of main.querySelectorAll<HTMLElement>("[class*='overflow-y-auto'], [class*='overflow-auto']")) {
        if (skip(n)) continue;
        const r = n.getBoundingClientRect();
        if (r.width < 240 || r.height < 120) continue;
        const score = r.width * r.height;
        if (score > bestScore) {
            best = n;
            bestScore = score;
        }
    }
    return best;
}

function chatColumn(): HTMLElement | null {
    const slot = nativeSlot();
    const slotParent = slot?.parentElement;
    if (slotParent && !scrolls(slotParent)) return slotParent;

    const pane = chatPane();
    if (!pane) return null;
    for (let n: HTMLElement | null = pane; n && n !== document.body; n = n.parentElement) {
        if (n.className.includes("@container/chat")) return n;
    }
    for (let n: HTMLElement | null = pane.parentElement; n && n !== document.body; n = n.parentElement) {
        if (scrolls(n)) continue;
        const r = n.getBoundingClientRect();
        if (r.height >= 240 && r.width >= 240) return n;
    }
    return pane.parentElement;
}

function composerTop(): number {
    const bar = document.querySelector(".query-bar");
    if (!(bar instanceof HTMLElement) || !isVisible(bar)) return window.innerHeight;
    return bar.getBoundingClientRect().top;
}

function isDecorativeMedia(node: Element): boolean {
    if (node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement) return false;
    const img = node instanceof HTMLImageElement ? node : node.querySelector("img");
    if (!img) return true;
    const src = img.getAttribute("src") || img.getAttribute("srcset") || "";
    if (GROK_ASSET.test(src) || img.closest(FILE_SEL)) return false;
    if (DECORATIVE_SRC.test(src)) return true;
    const w = Number(img.getAttribute("width")) || 0;
    const h = Number(img.getAttribute("height")) || 0;
    return (w > 0 && w <= 48) || (h > 0 && h <= 48);
}

function hasMedia(root: HTMLElement): "image" | "file" | "" {
    if (root.querySelector(FILE_SEL)) return "file";
    for (const node of root.querySelectorAll(MEDIA_SEL)) {
        if (isDecorativeMedia(node)) continue;
        return "image";
    }
    return "";
}

function summarize(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(STRIP_SEL).forEach(n => n.remove());
    for (const n of [...clone.querySelectorAll<HTMLElement>("span, div, a, p")]) {
        if (!n.isConnected) continue;
        const chip = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (chip && chip.length <= 24 && CHIP_RE.test(chip)) n.remove();
    }
    const media = hasMedia(clone);
    clone.querySelectorAll(MEDIA_SEL).forEach(n => n.remove());
    const text = (clone.textContent ?? "").replace(/\b\d+\s+sources?\b/gi, " ").replace(/\s+/g, " ").trim();
    if (NOISE_TEXT.test(text)) return "";
    if (!text) {
        if (media === "image") return "图片";
        if (media === "file") return "附件";
        return "";
    }
    return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

function errorBlob(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);
    const rec = value as Record<string, any>;
    return [rec.message, rec.code, rec.type, rec.name].filter(Boolean).map(String).join(" ");
}

function isUserInterrupt(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    const state = (r.state ?? "").trim().toLowerCase();
    if (state === "interrupted" || state === "stopped") return true;
    return USER_INTERRUPT.test(errorBlob(r.error)) || USER_INTERRUPT.test(String(r.message ?? ""));
}

function isDeadResponse(r: GrokResponse | undefined): boolean {
    if (!r) return false;
    if (isUserInterrupt(r)) return true;
    const state = (r.state ?? "").trim().toLowerCase();
    return DEAD.has(state) || (r.error != null && !LIVE.has(state));
}

function nodeTerminal(node: GatewayNode | undefined): boolean {
    if (!node) return false;
    if (node.status === "complete" || node.status === "stream-error" || node.status === "send-error") return true;
    return isDeadResponse(node.content);
}

function generationPhase(gw: GatewayConversation | undefined): string {
    return String((gw?.activeGeneration as { phase?: string } | null | undefined)?.phase ?? "").trim().toLowerCase();
}

function lookSettled(el: HTMLElement | null): boolean {
    if (!el) return false;
    const text = el.textContent ?? "";
    if (USER_INTERRUPT.test(text)) return true;
    // Stop still on screen means the answer after "Worked for" may still be streaming.
    if (stopVisible()) return false;
    const root = el.closest<HTMLElement>("[id^='response-']") ?? el;
    if (root.querySelector(DONE_ACTION_SEL)) return true;
    return SETTLED_RE.test(text);
}

function storeLive(): boolean | null {
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        const cid = page.conversationId || page.optimisticConversationId || "";
        const gw = cid ? MessageStore.useMessageStore.getState().conversations?.[cid] : undefined;
        const genId = gw?.activeGeneration?.assistantId ?? "";
        const genNode = genId ? gw?.nodes?.[genId] : undefined;
        const phase = generationPhase(gw);
        if (genNode && nodeTerminal(genNode)) {
            /* generation object can stick after the node is done */
        } else if (LIVE_PHASE.has(phase)) {
            return true;
        } else if (genNode && nodeLive(genNode) && !nodeTerminal(genNode)) {
            return true;
        }
        const streamedId = page.streamedMessageId ?? "";
        if (streamedId) {
            const streamed = ResponseStore.useResponseStore.getState().byId[streamedId];
            const sameGen = streamedId === genId || streamedId === (gw?.activeGeneration?.responseId ?? "");
            if (genNode && nodeTerminal(genNode) && sameGen) return false;
            if (streamed && !isDeadResponse(streamed)) {
                const state = (streamed.state ?? "").trim().toLowerCase();
                if (LIVE.has(state) || streamed.partial) return true;
            }
        }
        return false;
    } catch (e) {
        logger.debug("stream stores unavailable:", e);
        return null;
    }
}

function stopVisible(): boolean {
    for (const el of document.querySelectorAll<HTMLElement>(STOP_SEL)) {
        if (isVisible(el)) return true;
    }
    return false;
}

function liveAssistantEl(): HTMLElement | null {
    const root = chatPane() ?? document;
    const last = [...root.querySelectorAll<HTMLElement>(ASST_SEL)].findLast(el => document.body.contains(el));
    if (!last) return null;
    if (lookSettled(last)) return null;
    if (stopVisible()) return last;
    const live = storeLive();
    if (live) return last;
    if (live == null && last.querySelector(THINK_SEL) && !lookSettled(last)) return last;
    return null;
}

function currentCid(): string {
    try {
        const page = ChatPageStore.useChatPageStore.getState();
        return page.conversationId || page.optimisticConversationId || "";
    } catch (e) {
        logger.debug("chat page unavailable:", e);
        return "";
    }
}

function gatewayOf(cid: string): GatewayConversation | undefined {
    if (!cid) return;
    try {
        return MessageStore.useMessageStore.getState().conversations?.[cid];
    } catch (e) {
        logger.debug("message store unavailable:", e);
        return;
    }
}

function pathToLeaf(gw: GatewayConversation): GatewayNode[] {
    const nodes = gw.nodes ?? {};
    const leafId = gw.defaultLeafId;
    if (!leafId || !nodes[leafId]) return [];
    const out: GatewayNode[] = [];
    const seen = new Set<string>();
    let id: string | null = leafId;
    let guard = 0;
    while (id && nodes[id] && guard++ < 500) {
        if (seen.has(id)) break;
        seen.add(id);
        out.push(nodes[id]);
        id = nodes[id].parentId;
    }
    out.reverse();
    return out;
}

function extendPath(gw: GatewayConversation, path: GatewayNode[]): GatewayNode[] {
    const nodes = gw.nodes ?? {};
    const out = path.slice();
    const seen = new Set(out.map(n => n.id));
    const gen = gw.activeGeneration;
    if (!gen?.assistantId) return out;
    const assistant = nodes[gen.assistantId];
    if (assistant && nodeTerminal(assistant)) return out;
    const user = gen.userId ? nodes[gen.userId] : undefined;
    if (user && user.role === "user" && !seen.has(user.id)) {
        out.push(user);
        seen.add(user.id);
    }
    if (assistant && assistant.role === "assistant" && !seen.has(assistant.id)) out.push(assistant);
    return out;
}

function liveAssistantId(gw: GatewayConversation, path: GatewayNode[]): string {
    const nodes = gw.nodes ?? {};
    const genId = gw.activeGeneration?.assistantId ?? "";
    const genNode = genId ? nodes[genId] : undefined;
    const phase = generationPhase(gw);
    if (genNode && genNode.role === "assistant" && !nodeTerminal(genNode) && (LIVE_PHASE.has(phase) || nodeLive(genNode))) {
        const el = elForId(genId);
        if (!el || !lookSettled(el)) return genId;
    }
    for (let i = path.length - 1; i >= 0; i--) {
        if (path[i].role !== "assistant" || !nodeLive(path[i]) || nodeTerminal(path[i])) continue;
        const el = elForId(path[i].id);
        if (el && lookSettled(el)) continue;
        return path[i].id;
    }
    return "";
}

function responseIdOf(el: HTMLElement): string | undefined {
    if (el.id.startsWith("response-")) return el.id.slice("response-".length);
    const host = el.closest<HTMLElement>("[id^='response-']");
    if (host?.id.startsWith("response-")) return host.id.slice("response-".length);
    return undefined;
}

function bubbleOf(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    if (el.matches(MSG_SEL)) return el;
    return el.querySelector<HTMLElement>(MSG_SEL);
}

function elForId(id: string): HTMLElement | null {
    const shell = document.getElementById(`response-${id}`);
    if (!(shell instanceof HTMLElement)) return null;
    return bubbleOf(shell);
}

function mountedEl(item: NavItem | undefined): HTMLElement | null {
    if (!item) return null;
    if (item.id) {
        const found = elForId(item.id);
        if (found) {
            item.el = found;
            return found;
        }
    }
    if (item.el && document.body.contains(item.el)) {
        const bubble = bubbleOf(item.el);
        if (bubble) item.el = bubble;
        return bubble;
    }
    return null;
}

function plain(text: string): string {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || NOISE_TEXT.test(t)) return "";
    return t.length > SUMMARY_MAX ? `${t.slice(0, SUMMARY_MAX)}…` : t;
}

function labelFromResponse(role: Role, rec: GrokResponse | undefined): string {
    if (!rec || rec.isControl) return "";
    const raw = role === "user" ? (rec.query || rec.message || "") : (rec.message || "");
    const text = plain(raw);
    if (text) return text;
    if (rec.generatedImageUrls?.length || rec.imageAttachments?.length || rec.imageEditUri || rec.imageEditUris?.length) return "图片";
    if (rec.fileAttachments?.length || rec.fileUris?.length || rec.fileAttachmentsMetadata?.length) return "附件";
    return "";
}

function contentOf(cid: string, node: GatewayNode): GrokResponse | undefined {
    try {
        return MessageStore.nodeToResponse?.(cid, node) ?? node.content;
    } catch (e) {
        logger.debug("nodeToResponse failed:", e);
        return node.content;
    }
}

function nodeLive(node: GatewayNode): boolean {
    if (LIVE_NODE.has(node.status)) return true;
    if (node.content?.partial && !isDeadResponse(node.content)) return true;
    const state = (node.content?.state ?? "").trim().toLowerCase();
    return LIVE.has(state) && !isDeadResponse(node.content);
}

function collectDom(): NavItem[] {
    const root = chatPane() ?? document;
    const showAsst = settings.store.showAssistant;
    const liveEl = showAsst ? liveAssistantEl() : null;
    const out: NavItem[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(MSG_SEL)) {
        if (!document.body.contains(el)) continue;
        const role: Role = el.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
        if (!showAsst && role === "assistant") continue;
        const live = el === liveEl;
        const text = summarize(el) || (live ? LIVE_LABEL : "");
        if (!text) continue;
        out.push({ id: responseIdOf(el), el, role, text, live });
    }
    return out;
}

function itemFromNode(cid: string, node: GatewayNode, liveId: string, liveEl: HTMLElement | null): NavItem | null {
    if (node.role !== "user" && node.role !== "assistant") return null;
    const role: Role = node.role;
    if (!settings.store.showAssistant && role === "assistant") return null;
    const rec = contentOf(cid, node);
    if (rec?.isControl) return null;
    const el = elForId(node.id);
    const live = role === "assistant" && (node.id === liveId || (!!el && el === liveEl));
    const key = `${cid}:${node.id}`;
    let text = labelFromResponse(role, rec);
    if (!text && el) text = summarize(el);
    if (!text) text = labelCache.get(key) ?? "";
    if (!text) text = live ? LIVE_LABEL : LOADING_LABEL;
    if (text !== LOADING_LABEL && text !== LIVE_LABEL) labelCache.set(key, text);
    return { id: node.id, el, role, text, live };
}

function collectLeaf(): NavItem[] {
    const cid = currentCid();
    const gw = gatewayOf(cid);
    if (!gw) return [];
    const olderKey = `${cid}:${gw.history.nextBeforeId}`;
    if (gw.history.hasMore && gw.defaultLeafId && olderKey !== olderAsked) {
        olderAsked = olderKey;
        MessageStore.useMessageStore.getState().loadOlderHistory?.({ convId: cid, leafId: gw.defaultLeafId });
    }
    const path = extendPath(gw, pathToLeaf(gw));
    if (!path.length) return [];
    const showAsst = settings.store.showAssistant;
    const liveEl = showAsst ? liveAssistantEl() : null;
    const liveId = showAsst ? liveAssistantId(gw, path) : "";
    const out: NavItem[] = [];
    for (const node of path) {
        const item = itemFromNode(cid, node, liveId, liveEl);
        if (item) out.push(item);
    }
    if (liveId && !out.some(n => n.id === liveId)) {
        const node = gw.nodes?.[liveId];
        const item = node ? itemFromNode(cid, node, liveId, liveEl) : null;
        if (item) out.push({ ...item, live: true, text: item.text || LIVE_LABEL });
        else if (showAsst) {
            const el = elForId(liveId) ?? liveEl;
            out.push({ id: liveId, el, role: "assistant", text: (el && summarize(el)) || LIVE_LABEL, live: true });
        }
    }
    return out;
}

function absorbLive(base: NavItem[], dom: NavItem[]): NavItem[] {
    if (!base.length) return dom;
    const out = base.map(n => ({ ...n }));
    const ids = new Set(out.map(n => n.id).filter((id): id is string => !!id));
    for (const d of dom) {
        if (!d.live || d.role !== "assistant") continue;
        if (d.id && ids.has(d.id)) {
            const hit = out.find(n => n.id === d.id);
            if (hit) {
                hit.live = true;
                hit.el = hit.el ?? d.el;
                if (!hit.text || hit.text === LOADING_LABEL) hit.text = d.text || LIVE_LABEL;
            }
            continue;
        }
        if (out.some(n => n.live && n.role === "assistant")) continue;
        out.push({ ...d, text: d.text || LIVE_LABEL, live: true });
        if (d.id) ids.add(d.id);
    }
    return out;
}

function collect(): NavItem[] {
    const leaf = collectLeaf();
    const dom = collectDom();
    if (!leaf.length) return dom;
    const leafIds = new Set(leaf.map(n => n.id).filter((id): id is string => !!id));
    const domIds = dom.map(n => n.id).filter((id): id is string => !!id);
    const covered = domIds.length > 0 && domIds.every(id => leafIds.has(id));
    const base = covered || dom.length <= leaf.length ? leaf : dom;
    const nav = absorbLive(base, dom);
    for (const item of nav) {
        if (!item.live || item.role !== "assistant") continue;
        const el = item.el ?? (item.id ? elForId(item.id) : null);
        if (lookSettled(el)) item.live = false;
    }
    return nav;
}

function structKey(mode: string, nav: NavItem[]): string {
    return `${chatPath()}:${mode}:${nav.map((n, i) => n.id || `dom${i}:${n.role}`).join(",")}`;
}

function sameCatalog(nav: NavItem[]): boolean {
    return nav.length === lastNav.length && nav.every((n, i) => (n.id || "") === (lastNav[i]?.id || "") && n.role === lastNav[i]?.role);
}

function responseIdxs(): number[] {
    const out: number[] = [];
    for (let i = 0; i < lastNav.length; i++) {
        if (lastNav[i].role === "assistant") out.push(i);
    }
    return out;
}

function labelOrdinal(btn: HTMLButtonElement): number | null {
    const m = btn.getAttribute("aria-label")?.match(/Go to response (\d+)/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function metaLabel(index: number): string {
    const n = lastNav.length;
    if (activeSource === "native") {
        const asstN = responseIdxs().length;
        let k = 0;
        for (let i = 0; i <= index; i++) if (lastNav[i]?.role === "assistant") k++;
        if (k && asstN) return `${k} / ${asstN}`;
    }
    return `${Math.min(Math.max(index, 0) + 1, Math.max(n, 1))} / ${n}`;
}

function clearFlash() {
    if (flashTimer) window.clearTimeout(flashTimer);
    flashTimer = 0;
    flashing?.classList.remove("void-bn-flash");
    flashing = null;
}

function flash(el: HTMLElement) {
    clearFlash();
    if (settings.store.jumpEffect !== "border") return;
    flashing = el;
    el.classList.add("void-bn-flash");
    flashTimer = window.setTimeout(clearFlash, reduceMotion() ? FLASH_REDUCED_MS : FLASH_MS);
}

function mountedAssistantIndexes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < lastNav.length; i++) {
        if (lastNav[i].role !== "assistant") continue;
        if (mountedEl(lastNav[i])) out.push(i);
    }
    return out;
}

function assistantPool(tickCount: number): number[] {
    const all = responseIdxs();
    const mounted = mountedAssistantIndexes();
    if (!tickCount || tickCount === all.length) return all;
    if (mounted.length && tickCount === mounted.length) return mounted;
    if (mounted.length && Math.abs(tickCount - mounted.length) < Math.abs(tickCount - all.length)) return mounted;
    return all;
}

function nativeTickFor(item: NavItem, index: number, ticks?: HTMLButtonElement[]): HTMLButtonElement | undefined {
    if (item.role !== "assistant") return;
    const list = ticks?.length ? ticks : nativeTicks();
    if (!list.length) return;
    const pool = assistantPool(list.length);
    const pos = pool.indexOf(index);
    if (pos < 0) return;
    const n = pos + 1;
    return list.find(t => labelOrdinal(t) === n) ?? list[pos];
}

function navIndexFromTick(tick: HTMLButtonElement, tickIndex: number): number {
    const list = nativeTicks();
    const pool = assistantPool(list.length);
    const n = labelOrdinal(tick);
    if (n != null && pool[n - 1] != null) return pool[n - 1];
    if (pool[tickIndex] != null) return pool[tickIndex];
    return Math.min(tickIndex, Math.max(0, lastNav.length - 1));
}

function isFar(el: HTMLElement): boolean {
    const pane = chatPane();
    const vh = pane?.clientHeight ?? window.innerHeight;
    const top = pane?.getBoundingClientRect().top ?? 0;
    return Math.abs(el.getBoundingClientRect().top - top) > vh * FAR_VIEWPORTS;
}

function scrollToItem(el: HTMLElement, behavior: ScrollBehavior) {
    el.style.scrollMarginTop = `${OFFSET_PX}px`;
    const pane = chatPane();
    if (pane && pane.contains(el)) {
        const pr = pane.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        pane.scrollTo({ top: pane.scrollTop + (er.top - pr.top) - OFFSET_PX, behavior });
        return;
    }
    el.scrollIntoView({ behavior, block: "start" });
}

function nudgeToward(index: number) {
    const pane = chatPane();
    if (!pane) return;
    const vh = Math.max(120, pane.clientHeight || window.innerHeight);
    let before = -1;
    let after = -1;
    for (let i = 0; i < lastNav.length; i++) {
        if (!mountedEl(lastNav[i])) continue;
        if (i < index) before = i;
        else if (after < 0) after = i;
    }
    if (before < 0) {
        pane.scrollTo({ top: Math.max(0, pane.scrollTop - vh * 0.8), behavior: "auto" });
        return;
    }
    if (after < 0) {
        pane.scrollTo({ top: pane.scrollTop + vh * 0.8, behavior: "auto" });
        return;
    }
    const el = mountedEl(lastNav[before]);
    if (el) scrollToItem(el, "auto");
}

async function hydrateJump(item: NavItem, index: number) {
    const gen = ++hydrateGen;
    lockIdx = index;
    lockUntil = performance.now() + HYDRATE_MS + LOCK_MS;
    applyActive(index);
    const tick = item.role === "assistant" ? nativeTickFor(item, index) : undefined;
    if (tick) tick.click();
    const deadline = performance.now() + HYDRATE_MS;
    let lastTop = -1;
    let stuck = 0;
    let tries = 0;
    while (performance.now() < deadline) {
        if (gen !== hydrateGen) return;
        const el = mountedEl(lastNav[index] ?? item);
        if (el) {
            const instant = isFar(el) || reduceMotion();
            scrollToItem(el, instant ? "auto" : "smooth");
            window.setTimeout(() => { if (gen === hydrateGen) flash(el); }, 180);
            lockUntil = performance.now() + (instant ? LOCK_FAST_MS : LOCK_MS);
            return;
        }
        tries++;
        if (!tick || tries > 4) {
            const pane = chatPane();
            const top = pane?.scrollTop ?? 0;
            if (top === lastTop) stuck++;
            else stuck = 0;
            lastTop = top;
            if (stuck >= 3 && top <= 1) break;
            nudgeToward(index);
        }
        await new Promise(r => window.setTimeout(r, HYDRATE_STEP));
    }
}

function jump(item: NavItem, index: number) {
    const cur = lastNav[index] ?? item;
    const el = mountedEl(cur);
    if (!el) {
        void hydrateJump(cur, index);
        return;
    }
    const instant = isFar(el) || reduceMotion();
    lockIdx = index;
    lockUntil = performance.now() + (instant ? LOCK_FAST_MS : LOCK_MS);
    applyActive(index);
    scrollToItem(el, instant ? "auto" : "smooth");
    window.setTimeout(() => flash(el), 180);
}

function jumpById(messageId: string): boolean {
    const index = lastNav.findIndex(item => item.id === messageId);
    if (index < 0) return false;
    jump(lastNav[index], index);
    return true;
}

function publishJump() {
    (pageWindow as unknown as Record<symbol, unknown>)[JUMP_SYM] = jumpById;
}

function unpublishJump() {
    const host = pageWindow as unknown as Record<symbol, unknown>;
    if (host[JUMP_SYM] === jumpById) delete host[JUMP_SYM];
}

function stepItem(dir: -1 | 1): boolean {
    const next = activeIdx + dir;
    if (next < 0 || next >= lastNav.length) return false;
    jump(lastNav[next], next);
    alignMenu(next);
    return true;
}

function markAim(index: number) {
    host?.querySelectorAll(".void-bn-item").forEach(node => {
        node.classList.toggle("void-bn-aim", Number((node as HTMLElement).dataset.voidBnI) === index);
    });
}

function applyActive(index: number, source: "native" | "list" = "list") {
    activeIdx = index;
    activeSource = source;
    host?.querySelectorAll(".void-bn-item").forEach(node => {
        node.classList.toggle("void-bn-active", Number((node as HTMLElement).dataset.voidBnI) === index);
    });
    host?.querySelectorAll(".void-bn-tick").forEach(node => {
        node.classList.toggle("void-bn-current", Number((node as HTMLElement).dataset.voidBnI) === index);
    });
    const meta = host?.querySelector(".void-bn-meta");
    if (meta) meta.textContent = metaLabel(index);
}

function tickBarWidth(btn: HTMLElement): number {
    let best = 0;
    btn.querySelectorAll<HTMLElement>("span, div").forEach(el => {
        if (el.classList.contains("void-bn-native-dash")) return;
        const r = el.getBoundingClientRect();
        if (r.width >= 4 && r.height > 0 && r.height <= 6 && r.width > best) best = r.width;
    });
    return best;
}

function tickMarkedCurrent(btn: HTMLElement): boolean {
    const cur = btn.getAttribute("aria-current");
    if (cur === "true" || cur === "page" || cur === "location") return true;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    const state = (btn.getAttribute("data-state") || "").toLowerCase();
    return state === "active" || state === "current" || state === "on";
}

function tickInk(btn: HTMLElement): number {
    let best = 0;
    const nodes: HTMLElement[] = [btn, ...btn.querySelectorAll<HTMLElement>("span, div")];
    for (const el of nodes) {
        if (el.classList.contains("void-bn-native-dash")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height <= 0 || r.height > 8) continue;
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) continue;
        const a = m[4] == null ? 1 : Number(m[4]);
        const lum = ((Number(m[1]) + Number(m[2]) + Number(m[3])) / 3) * a;
        if (lum > best) best = lum;
    }
    return best;
}

function uniqueLeader(scores: number[], minLead: number): number {
    const positive = scores.filter(s => s > 0);
    if (positive.length < 2) return -1;
    const sorted = [...positive].sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    let best = -1;
    let bestS = 0;
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] > bestS) {
            bestS = scores[i];
            best = i;
        }
    }
    if (best < 0 || bestS < median + minLead) return -1;
    if (scores.filter(s => Math.abs(s - bestS) < 0.5).length !== 1) return -1;
    return best;
}

function nativeCurrentIndex(): number | null {
    if (!settings.store.showAssistant) return null;
    const ticks = nativeTicks();
    if (!ticks.length) return null;
    for (let i = 0; i < ticks.length; i++) {
        if (tickMarkedCurrent(ticks[i])) return navIndexFromTick(ticks[i], i);
    }
    if (ticks.some(t => t.matches(":hover"))) {
        return activeSource === "native" ? activeIdx : null;
    }
    const byWidth = uniqueLeader(ticks.map(tickBarWidth), 3);
    if (byWidth >= 0) return navIndexFromTick(ticks[byWidth], byWidth);
    const byInk = uniqueLeader(ticks.map(tickInk), 20);
    if (byInk >= 0) return navIndexFromTick(ticks[byInk], byInk);
    return null;
}

function headTop(el: HTMLElement): number {
    const body = el.querySelector<HTMLElement>(".markdown, .prose, [class*='markdown']");
    return (body ?? el).getBoundingClientRect().top;
}

function pickByLine(nav: NavItem[]): number {
    const pane = chatPane();
    const pr = pane?.getBoundingClientRect();
    const top = pr?.top ?? 0;
    const bottom = pr ? Math.min(pr.bottom, composerTop()) : window.innerHeight;
    const line = top + Math.max(bottom - top, 0) * THRESHOLD;
    const tops: number[] = [];
    let passed = -1;
    for (let i = 0; i < nav.length; i++) {
        const el = mountedEl(nav[i]);
        if (!el) {
            tops.push(NaN);
            continue;
        }
        const t = headTop(el);
        tops.push(t);
        if (passed < 0) passed = i;
        if (t <= line) passed = i;
    }
    if (passed < 0) return 0;
    const cur = activeIdx;
    const curTop = tops[cur];
    if (!Number.isFinite(curTop)) return passed;
    if (passed === cur) return cur;
    if (passed > cur) return passed;
    if (curTop <= line + HEAD_HYST) return cur;
    return passed;
}

function paneEdge(nav: NavItem[]): "top" | "bottom" | null {
    const pane = chatPane();
    if (!pane || !nav.length) return null;
    const room = pane.scrollHeight - pane.clientHeight;
    const atTop = pane.scrollTop <= EDGE_PX;
    const atBottom = room - pane.scrollTop <= EDGE_PX;
    const pr = pane.getBoundingClientRect();
    const floor = Math.min(pr.bottom, composerTop());
    let geoTop = false;
    let geoBottom = false;
    const first = mountedEl(nav[0]);
    if (first) {
        const t = headTop(first);
        if (t >= pr.top - EDGE_PX && t <= pr.top + 48) geoTop = true;
    }
    const last = mountedEl(nav[nav.length - 1]);
    if (last) {
        const b = last.getBoundingClientRect().bottom;
        if (b <= floor + EDGE_PX && b >= floor - EDGE_TAIL) geoBottom = true;
    }
    if (room <= EDGE_PX || atBottom || geoBottom) return "bottom";
    if (atTop || geoTop) return "top";
    return null;
}

function edgePick(nav: NavItem[]): { index: number; source: "list" } | null {
    const edge = paneEdge(nav);
    if (!edge || !nav.length) return null;
    return { index: edge === "bottom" ? nav.length - 1 : 0, source: "list" };
}

function clearNativeEdge() {
    document.querySelectorAll<HTMLElement>(".void-bn-native-edge, .void-bn-native-dim").forEach(el => {
        el.classList.remove("void-bn-native-edge", "void-bn-native-dim");
    });
}

function setActive(nav: NavItem[]) {
    if (performance.now() < lockUntil && lockIdx >= 0) {
        clearNativeEdge();
        applyActive(lockIdx, "list");
        return;
    }
    const edge = edgePick(nav);
    if (edge) {
        applyActive(edge.index, "list");
        return;
    }
    clearNativeEdge();
    const fromNative = nativeCurrentIndex();
    if (fromNative != null) {
        applyActive(fromNative, "native");
        return;
    }
    applyActive(pickByLine(nav), "list");
}

function columnSpan(): { top: number; height: number } {
    const pane = chatPane();
    const frame = chatColumn();
    const pr = pane?.getBoundingClientRect();
    const fr = frame?.getBoundingClientRect();
    const topVp = pr?.top ?? 8;
    const bottomVp = Math.min(pr?.bottom ?? window.innerHeight, composerTop());
    const height = Math.max(120, bottomVp - topVp);
    const top = frame ? topVp - (fr?.top ?? 0) : 0;
    return { top, height };
}

function placeHost() {
    if (!host) return;
    const span = columnSpan();
    host.style.top = `${span.top}px`;
    host.style.height = `${span.height}px`;
    host.style.right = "0.75rem";
    host.style.transform = "none";
    host.style.justifyContent = "center";
    const ticks = host.querySelector<HTMLElement>(".void-bn-ticks");
    if (!ticks) return;
    ticks.style.height = "auto";
    ticks.style.flex = "0 0 auto";
    ticks.style.maxHeight = "100%";
    ticks.style.overflow = "hidden";
    for (const node of ticks.children) {
        if (node instanceof HTMLElement) node.style.height = "";
    }
    const room = span.height;
    const natural = ticks.scrollHeight;
    const count = ticks.childElementCount;
    if (natural <= room || !count) return;
    const h = Math.max(2, Math.floor(room / count));
    for (const node of ticks.children) {
        if (node instanceof HTMLElement) node.style.height = `${h}px`;
    }
}

function clampMenu() {
    placeHost();
    const menu = host?.querySelector<HTMLElement>(".void-bn-menu");
    if (!menu || !host) return;
    const span = columnSpan();
    const natural = menu.scrollHeight;
    const cap = span.height;
    menu.style.maxHeight = `${cap}px`;
    menu.style.overflowY = natural > cap + 1 ? "auto" : "hidden";
    menu.style.top = "";
    menu.style.transform = "";
    const originRect = host.getBoundingClientRect();
    const mh = menu.offsetHeight || natural;
    const viewTop = originRect.top;
    const viewBottom = originRect.bottom;
    const originMid = originRect.top + originRect.height / 2;
    const naturalTop = originMid - mh / 2;
    let abs = naturalTop;
    if (abs + mh > viewBottom) abs = viewBottom - mh;
    if (abs < viewTop) abs = viewTop;
    const delta = abs - naturalTop;
    menu.style.marginTop = Math.abs(delta) < 1 ? "" : `${delta}px`;
}

function alignMenu(index: number) {
    const menu = host?.querySelector<HTMLElement>(".void-bn-menu");
    if (!menu || !host) return;
    const row = menu.querySelector<HTMLElement>(`.void-bn-item[data-void-bn-i="${index}"]`);
    row?.scrollIntoView({ block: "nearest" });
    clampMenu();
}

function requestActive() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (lastNav.length) setActive(lastNav);
    });
}

function bindIO(nav: NavItem[]) {
    io?.disconnect();
    const root = chatPane();
    io = new IntersectionObserver(requestActive, {
        root,
        threshold: [0, 0.15, 0.35, 0.5, 0.75, 1],
    });
    for (const item of nav) {
        const el = mountedEl(item);
        if (el) io.observe(el);
    }
}

function patchLabels(nav: NavItem[]) {
    host?.querySelectorAll<HTMLElement>(".void-bn-item .void-bn-label").forEach((node, i) => {
        if (nav[i] && node.textContent !== nav[i].text) node.textContent = nav[i].text;
    });
}

function clearNativeDash() {
    document.querySelectorAll<HTMLElement>(".void-bn-native-live").forEach(el => el.classList.remove("void-bn-native-live"));
    document.querySelectorAll(".void-bn-native-dash").forEach(el => el.remove());
    clearNativeEdge();
}

function syncNativeDash(nav: NavItem[]) {
    clearNativeDash();
    if (!settings.store.showAssistant) return;
    let liveI = -1;
    for (let i = nav.length - 1; i >= 0; i--) {
        if (nav[i].role === "assistant" && nav[i].live) {
            liveI = i;
            break;
        }
    }
    if (liveI < 0) return;
    const ticks = nativeTicks();
    if (!ticks.length) return;
    const mapped = nativeTickFor(nav[liveI], liveI, ticks);
    if (mapped) mapped.classList.add("void-bn-native-live");
}

function patchLive(nav: NavItem[]) {
    host?.querySelectorAll<HTMLElement>(".void-bn-tick").forEach((node, i) => {
        node.classList.toggle("void-bn-tick-live", !!nav[i]?.live);
    });
    patchLabels(nav);
}

function menuEl(nav: NavItem[]): HTMLElement {
    const menu = document.createElement("div");
    menu.className = cl("menu");
    menu.addEventListener("pointerenter", () => {
        overMenu = true;
        markAim(-1);
    });
    menu.addEventListener("pointerleave", () => {
        overMenu = false;
        markAim(-1);
    });
    const meta = document.createElement("div");
    meta.className = cl("meta");
    meta.textContent = metaLabel(0);
    const ul = document.createElement("ul");
    ul.className = cl("list");
    nav.forEach((item, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = cl("item");
        btn.dataset.voidBnI = String(i);
        if (item.id) btn.dataset.responseId = item.id;
        const emoji = document.createElement("span");
        emoji.className = cl("emoji");
        emoji.textContent = item.role === "user" ? "❓" : "🤖";
        const label = document.createElement("span");
        label.className = cl("label");
        label.textContent = item.text;
        btn.append(emoji, label);
        btn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i);
        });
        li.appendChild(btn);
        ul.appendChild(li);
    });
    menu.append(meta, ul);
    return menu;
}

function tickRail(nav: NavItem[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = cl("ticks", { dense: nav.length > DENSE_N });
    nav.forEach((item, i) => {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = cl("tick", item.role === "user" ? "tick-user" : "tick-asst", { "tick-live": item.live });
        tick.dataset.voidBnI = String(i);
        if (item.id) tick.dataset.responseId = item.id;
        tick.setAttribute("aria-label", `Go to message ${i + 1} of ${nav.length}`);
        tick.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            jump(item, i);
        });
        tick.addEventListener("pointerenter", () => alignMenu(i));
        wrap.appendChild(tick);
    });
    return wrap;
}

function restoreFrame() {
    if (!frameTouched) return;
    frameTouched.style.position = framePrevPos;
    frameTouched = null;
    framePrevPos = "";
}

function pinFrame(frame: HTMLElement) {
    if (scrolls(frame)) return;
    if (getComputedStyle(frame).position !== "static") return;
    frameTouched = frame;
    framePrevPos = frame.style.position;
    frame.style.position = "relative";
}

function unmount() {
    rail?.classList.remove(SLOT_CLASS, "void-bn-open");
    host?.remove();
    host = null;
    rail = null;
    paintedKey = "";
    overMenu = false;
    restoreFrame();
    clearNativeDash();
    document.documentElement.classList.remove("void-bn-fullticks");
}

function syncHideTip() {
    document.documentElement.classList.toggle(HIDE_CLASS, !!settings.store.hideNativeHover);
}

function setOpen(on: boolean) {
    host?.classList.toggle("void-bn-open", on);
    rail?.classList.toggle("void-bn-open", on);
    if (!on) markAim(-1);
}

function onPointerLeaveRail(e: PointerEvent) {
    const next = e.relatedTarget;
    if (next instanceof Element && (next.closest(".void-bn-host") || next.closest(".void-bn-rail") || next.closest(".void-bn-menu"))) return;
    markAim(-1);
}

function onPointerOver(e: Event) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const native = t.closest<HTMLButtonElement>(TICK_SEL);
    if (native) {
        const idx = nativeTicks().indexOf(native);
        if (idx >= 0) alignMenu(navIndexFromTick(native, idx));
        return;
    }
    const self = t.closest<HTMLElement>(".void-bn-tick");
    if (self?.dataset.voidBnI != null) alignMenu(Number(self.dataset.voidBnI));
}

function onPointerOut(e: Event) {
    if (!(e instanceof PointerEvent)) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const fromTick = t.closest(TICK_SEL) || t.closest(".void-bn-tick");
    if (!fromTick) return;
    const next = e.relatedTarget;
    if (next instanceof Element && (next.closest(TICK_SEL) || next.closest(".void-bn-tick") || next.closest(".void-bn-host") || next.closest(".void-bn-rail") || next.closest(".void-bn-menu"))) return;
    markAim(-1);
}

function onKeyDown(e: KeyboardEvent) {
    if (!lastNav.length || !host?.isConnected) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
    if (e.key === "Escape") {
        if (host.classList.contains("void-bn-open") || rail?.classList.contains("void-bn-open")) {
            e.preventDefault();
            setOpen(false);
        }
        return;
    }
    const homeEnd = e.key === "Home" || e.key === "End";
    const arrow = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (!homeEnd && !arrow) return;
    if (homeEnd) {
        e.preventDefault();
        const idx = e.key === "Home" ? 0 : lastNav.length - 1;
        jump(lastNav[idx], idx);
        alignMenu(idx);
        return;
    }
    if (!stepItem(e.key === "ArrowUp" ? -1 : 1)) return;
    e.preventDefault();
}

function onPointerDown(e: PointerEvent) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (host?.contains(t) || rail?.contains(t)) return;
    setOpen(false);
}

function bindWatchers() {
    const col = chatColumn();
    const pane = chatPane();
    const main = document.querySelector("main");
    const target = col ?? pane ?? (main instanceof HTMLElement ? main : document.body);

    if (target !== observedPane) {
        paneMo?.disconnect();
        paneMo = new MutationObserver(debouncedPaint);
        paneMo.observe(target, { childList: true, subtree: true });
        observedPane = target;
    }

    if (main && !mainMo) {
        mainMo = new MutationObserver(() => {
            bindWatchers();
            debouncedPaint();
        });
        mainMo.observe(main, { childList: true, subtree: false });
    }
}

function paint() {
    bindWatchers();
    const path = chatPath();
    if (path !== lastPath) {
        lastPath = path;
        paintedKey = "";
        labelCache.clear();
        hydrateGen++;
        if (host) unmount();
    }

    const nav = collect();
    if (!nav.length) {
        lastNav = [];
        unmount();
        io?.disconnect();
        io = null;
        return;
    }

    const mode = "self";
    document.documentElement.classList.add("void-bn-fullticks");
    const nextKey = structKey(mode, nav);
    if (nextKey === paintedKey && host?.isConnected && sameCatalog(nav)) {
        lastNav = nav;
        patchLive(nav);
        syncNativeDash(nav);
        bindIO(nav);
        setActive(nav);
        clampMenu();
        return;
    }

    unmount();
    document.documentElement.classList.add("void-bn-fullticks");
    const box = document.createElement("div");
    box.className = cl("host", "self");
    const frame = chatColumn();
    if (!frame) return;
    pinFrame(frame);
    box.classList.add(SLOT_CLASS);
    box.append(tickRail(nav), menuEl(nav));
    frame.appendChild(box);

    host = box;
    lastNav = nav;
    paintedKey = nextKey;
    box.addEventListener("pointerleave", onPointerLeaveRail);
    rail?.addEventListener("pointerleave", onPointerLeaveRail);
    bindIO(nav);
    setActive(nav);
    syncNativeDash(nav);
    clampMenu();
}

const debouncedPaint = debounce(paint, 160);

function pageKey(s: ChatPageStoreState): string {
    return `${s.conversationId ?? ""}|${s.optimisticConversationId ?? ""}|${s.streamedMessageId ?? ""}|${s.showStreamingIndicator ? 1 : 0}`;
}

function responseKey(s: ResponseStoreState): string {
    try {
        const id = ChatPageStore.useChatPageStore.getState().streamedMessageId ?? "";
        const r = s.byId[id];
        return `${id}:${r?.state ?? ""}:${r?.partial ? 1 : 0}`;
    } catch {
        return "";
    }
}

function messageKey(s: MessageStoreState): string {
    try {
        const cid = currentCid();
        const gw = s.conversations?.[cid];
        if (!gw) return cid;
        const path = extendPath(gw, pathToLeaf(gw));
        const gen = gw.activeGeneration;
        const genNode = gen?.assistantId ? gw.nodes?.[gen.assistantId] : undefined;
        const phase = generationPhase(gw);
        const lastAsst = [...path].reverse().find(n => n.role === "assistant");
        const lastKey = lastAsst ? `${lastAsst.id}:${lastAsst.status}:${lastAsst.content?.state ?? ""}` : "";
        const genKey = gen ? `${gen.userId}:${gen.assistantId}:${genNode?.status ?? ""}:${phase}` : "";
        return `${cid}|${gw.defaultLeafId ?? ""}|${genKey}|${lastKey}|${path.map(n => `${n.id}:${n.status}`).join(",")}`;
    } catch (e) {
        logger.debug("message key failed:", e);
        return "";
    }
}

function onStreamEnd(_data: VoidPPEventMap["streamEnd"]) {
    paint();
}

function start() {
    if (ac) return;
    ac = new AbortController();
    const { signal } = ac;
    lastPath = chatPath();
    publishJump();
    syncHideTip();
    paint();
    bindWatchers();
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
    document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true, signal });
    document.addEventListener("pointerout", onPointerOut, { capture: true, passive: true, signal });
    window.addEventListener("popstate", debouncedPaint, { signal });
    const main = document.querySelector("main");
    if (main) {
        ro = new ResizeObserver(debouncedPaint);
        ro.observe(main);
    }
}

function stop() {
    unpublishJump();
    ac?.abort();
    ac = null;
    paneMo?.disconnect();
    paneMo = null;
    mainMo?.disconnect();
    mainMo = null;
    observedPane = null;
    ro?.disconnect();
    ro = null;
    io?.disconnect();
    io = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    hydrateGen++;
    olderAsked = "";
    labelCache.clear();
    unmount();
    clearFlash();
    lastNav = [];
    lastPath = "";
    document.documentElement.classList.remove(HIDE_CLASS);
}

export default definePlugin({
    name: "BetterNavigator",
    icon: ScrollTextIcon,
    description: "Upgrade Grok's message rail into a Notion-style outline of the whole chat, including messages that are not mounted yet. A reply that is still streaming stays listed as a dashed tick.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.DOMContentLoaded,
    settings,
    managedStyle: "betterNavigator",
    cleanupSelectors: [".void-bn-host"],
    start,
    stop,
    onSettingsChange() {
        syncHideTip();
        paintedKey = "";
        paint();
    },
    events: {
        streamEnd: onStreamEnd,
    },
    zustand: {
        ChatPageStore: {
            selector: pageKey,
            handler: paint,
        },
        MessageStore: {
            selector: messageKey,
            handler: paint,
        },
        ResponseStore: {
            selector: responseKey,
            handler: paint,
        },
    },
});
