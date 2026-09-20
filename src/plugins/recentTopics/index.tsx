/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { LayoutGridIcon } from "@components/icons";
import type { GrokResponse } from "@grok-types";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { GrokConversation } from "@grok-types/stores/ConversationStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { GrokRoute, RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { React } from "@turbopack/common/react";
import { ChatPageStore, ConversationStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

const logger = new Logger("RecentTopics");
const cl = classNameFactory("void-rt-");
const HOME_KEY = "home";
const HOME_SEP = "home:";
const TRIGGER_CODES = new Set(["Backquote", "IntlBackslash"]);
const TRIGGER_KEYS = new Set(["`", "~", "·", "｀", "～", "Dead", "Process"]);
const TITLE_TAIL = /\s*[·|—–-]\s*Grok.*$/i;
const ACCESS_TITLE = /you need access|private conversation|request access|需要访问|需要存取|访问权|非公开|非公開|アクセスが必要|アクセスをリクエスト/i;
const ACCESS_NEED = /you need access|需要访问|需要存取|访问权|アクセスが必要/i;
const ACCESS_HINT = /private conversation|request access|非公开|非公開|请求访问|请求存取|アクセスをリクエスト/i;
const SKIP_PHRASE = "see all(?: chats| conversations)?|show all(?: chats| conversations)?|view all(?: chats| conversations)?|all chats|all conversations|new conversation|new chat|more|history|today|yesterday|projects|查看全部|显示全部|查看所有|全部会话|所有对话|新聊天|新对话";
const SKIP_LABEL = new RegExp(`^(?:${SKIP_PHRASE})$`, "i");
const SKIP_LABEL_G = new RegExp(`\\b(?:${SKIP_PHRASE})\\b`, "gi");
const SKIP_NOISE = /^(copy|share|retry|edit|more|thinking|analyzing|searching|continue from here|what can i help with\??|files|add files for grok to use in this project)$/i;
const FILES_CHROME = /add files for grok to use in this project/i;
const PANE_SKIP = "[data-sidebar], .void-rt-root, #void-rt-host, [class*='pane-card']";
const MSG_SEL = "[data-testid='user-message'], [data-testid='assistant-message']";
const TIME_TOKEN = /(?:^|\s)\d{1,2}:\d{2}\s*(?:am|pm)\b/gi;
const STATUS_TOKEN = /\b(?:connected to computer|continuing the(?: task)?|worked for \d+\s*m(?:\s*\d+\s*s)?|worked for \d+\s*s)\b/gi;
const COUNT_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ label: String(n), value: n, default: n === 5 }));
const FOLDER_D = "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z";
const SPIN_D = "M21 12a9 9 0 1 1-6.219-8.56";
const PATH_OK = /^[MmLlHhVvCcSsQqTtAaZzeE0-9.,+\s-]+$/;
const ICON_SKIP = ".void-cls,[data-sidebar='menu-action'],[data-sidebar='menu-badge']";
const DENIED_MAX = 40;
const DENIED_HOLD_MS = 60_000;
const SETTLE_MS = 200;
const HOVER_ARM_PX = 4;
const EFFECT_GM_KEY = "VoidPP.rt.effect";
const EFFECT_LS_KEY = "voidpp.rt.v1";

const settings = definePluginSettings({
    maxRecent: {
        type: OptionType.SELECT,
        description: "How many recently opened conversations to show.",
        options: COUNT_OPTIONS,
    },
    includeHome: {
        type: OptionType.BOOLEAN,
        description: "Include new-chat home pages in the switcher.",
        default: true,
    },
}).withPrivateSettings<{
    visits: string[];
    deniedIds: string[];
    deniedAt: Record<string, string>;
    titles: Record<string, string>;
    workspaceByConv: Record<string, string>;
    projectNames: Record<string, string>;
    projectIcons: Record<string, string>;
    pages: Record<string, string>;
}>();

interface PageLine {
    role: "user" | "assistant";
    text: string;
}

interface PageSnap {
    title: string;
    theme: "dark" | "light";
    lines: PageLine[];
}

interface EffectSnap {
    v: 1;
    visits: string[];
    deniedIds: string[];
    deniedAt: Record<string, string>;
    ts: number;
}

const thumbs = new Map<string, PageSnap>();
const wsNames: Record<string, string> = {};
const wsIcons: Record<string, string> = {};

interface Topic {
    id: string;
    title: string;
    project: string;
    ws: string;
}

interface SidebarIndex {
    wsByConv: Record<string, string>;
    nameByWs: Record<string, string>;
    nameByConv: Record<string, string>;
    iconByWs: Record<string, string>;
}

let open = false;
let selected = 0;
let held = false;
let ctrlHeld = false;
let keys: AbortController | null = null;
let host: HTMLDivElement | null = null;
let paintedIds = "";
let paintedMeta = "";
let hoverArmed = false;
let hoverOrigin = false;
let hoverX = 0;
let hoverY = 0;
let suspendPaint = false;
let sidebarSnap: { key: string; index: SidebarIndex; } | null = null;
const pendingWs = new Set<string>();

function isSkipLabel(name: string): boolean {
    const t = name.replaceAll(/\s+/g, " ").trim();
    if (!t) return false;
    SKIP_LABEL.lastIndex = 0;
    if (SKIP_LABEL.test(t)) return true;
    SKIP_LABEL_G.lastIndex = 0;
    return !t.replace(SKIP_LABEL_G, " ").replaceAll(/\s+/g, " ").trim();
}

function isBrandLabel(name: string): boolean {
    return /^grok$/i.test(name) || /^void\+\+$/i.test(name);
}

function usableName(name: string): string {
    const t = name.replaceAll(/\s+/g, " ").trim();
    return t && !isSkipLabel(t) ? t : "";
}

function usableTitle(name: string | undefined): string {
    const t = (name ?? "").replaceAll(/\s+/g, " ").trim();
    if (!t || isBrandLabel(t) || isSkipLabel(t) || ACCESS_TITLE.test(t)) return "";
    return t;
}

function unique(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function readVisits(): string[] {
    return effect.visits;
}

function maxCount(): number {
    const n = Number(settings.store.maxRecent);
    return Number.isFinite(n) && n > 0 ? n : 5;
}

function capVisits(ids: string[]): string[] {
    const allowHome = settings.store.includeHome;
    const current = currentVisit();
    const dirtyGlobalWs = asWorkspaceId(settings.plain.workspaceByConv?.[HOME_KEY]);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
        if (!raw) continue;
        let id = raw;
        if (id === HOME_KEY && dirtyGlobalWs && current !== HOME_KEY) id = homeId(dirtyGlobalWs);
        if (seen.has(id)) continue;
        if (isDenied(id) && !reviveIfAlive(id)) continue;
        if (isHomeId(id)) {
            if (!allowHome) continue;
            if (id !== HOME_KEY && !workspaceFromHomeId(id)) continue;
        }
        seen.add(id);
        out.push(id);
        if (out.length >= maxCount()) break;
    }
    return out;
}

function pruneRecord(source: Record<string, string> | undefined, ids: string[]): Record<string, string> {
    const keep: Record<string, string> = {};
    if (!source) return keep;
    for (const id of ids) {
        if (source[id]) keep[id] = source[id];
    }
    return keep;
}

function sameList(a: string[], b: string[]) {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

function sameRecord(a: Record<string, string> | undefined, b: Record<string, string>) {
    const src = a ?? {};
    const keys = Object.keys(b);
    if (Object.keys(src).length !== keys.length) return false;
    return keys.every(k => src[k] === b[k]);
}

function assignRecord(key: "titles" | "workspaceByConv" | "projectNames" | "projectIcons" | "pages", next: Record<string, string>) {
    if (sameRecord(settings.plain[key], next)) return false;
    settings.store[key] = next;
    return true;
}

function emptyEffect(): EffectSnap {
    return { v: 1, visits: [], deniedIds: [], deniedAt: {}, ts: 0 };
}

function asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === "string" && !!id);
}

function asStringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === "string" && raw) out[id] = raw;
        else if (typeof raw === "number" && Number.isFinite(raw)) out[id] = String(raw);
    }
    return out;
}

function parseEffect(raw: unknown): EffectSnap | null {
    if (raw == null) return null;
    let data: unknown = raw;
    if (typeof raw === "string") {
        try { data = JSON.parse(raw); } catch { return null; }
    }
    if (!data || typeof data !== "object") return null;
    const rec = data as Record<string, unknown>;
    return {
        v: 1,
        visits: asStringList(rec.visits),
        deniedIds: asStringList(rec.deniedIds),
        deniedAt: asStringRecord(rec.deniedAt),
        ts: Number(rec.ts) || 0,
    };
}

function mergeDeniedAt(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
    const out = { ...a };
    for (const [id, ts] of Object.entries(b)) {
        if (!out[id] || Number(ts) >= Number(out[id])) out[id] = ts;
    }
    return out;
}

function readEffectDisk(): EffectSnap | null {
    if (typeof GM_getValue === "function") {
        try {
            const gm = parseEffect(GM_getValue(EFFECT_GM_KEY, null));
            if (gm) return gm;
        } catch { /* ignore */ }
    }
    try {
        return parseEffect(localStorage.getItem(EFFECT_LS_KEY));
    } catch {
        return null;
    }
}

function writeEffectDisk(snap: EffectSnap) {
    if (applyingRemote) return;
    const json = JSON.stringify(snap);
    if (typeof GM_setValue === "function") {
        try {
            GM_setValue(EFFECT_GM_KEY, json);
            return;
        } catch { /* fallback */ }
    }
    try { localStorage.setItem(EFFECT_LS_KEY, json); } catch { /* ignore */ }
}

function persistEffect(nextVisits?: string[]): boolean {
    if (applyingRemote) return false;
    if (persisting) {
        if (nextVisits) effect.visits = nextVisits;
        return false;
    }
    persisting = true;
    try {
        const disk = readEffectDisk() ?? emptyEffect();
        const prevVisits = effect.visits;
        const prevDenied = effect.deniedIds;
        const prevAt = effect.deniedAt;
        const deniedAt = mergeDeniedAt(disk.deniedAt, effect.deniedAt);
        let deniedIds = unique([...disk.deniedIds, ...effect.deniedIds].filter(id => id && !isHomeId(id)));
        deniedIds = deniedIds.filter(id => {
            if (!revivedIds.has(id)) return true;
            return Number(disk.deniedAt[id] || 0) > Number(effect.deniedAt[id] || 0);
        }).slice(0, DENIED_MAX);
        const keepAt: Record<string, string> = {};
        for (const id of deniedIds) {
            if (deniedAt[id]) keepAt[id] = deniedAt[id];
        }
        effect.deniedIds = deniedIds;
        effect.deniedAt = keepAt;
        const visits = capVisits(unique([...(nextVisits ?? []), ...effect.visits, ...disk.visits]));
        deniedIds = unique(effect.deniedIds.filter(id => id && !isHomeId(id))).slice(0, DENIED_MAX);
        const nextAt: Record<string, string> = {};
        for (const id of deniedIds) {
            if (effect.deniedAt[id]) nextAt[id] = effect.deniedAt[id];
            else if (keepAt[id]) nextAt[id] = keepAt[id];
        }
        const snap: EffectSnap = {
            v: 1,
            visits,
            deniedIds,
            deniedAt: nextAt,
            ts: Date.now(),
        };
        const differsDisk = !sameList(disk.visits, snap.visits)
            || !sameList(disk.deniedIds, snap.deniedIds)
            || !sameRecord(disk.deniedAt, snap.deniedAt);
        const changed = !sameList(prevVisits, snap.visits)
            || !sameList(prevDenied, snap.deniedIds)
            || !sameRecord(prevAt, snap.deniedAt);
        effect = snap;
        if (differsDisk) writeEffectDisk(snap);
        revivedIds.clear();
        return changed;
    } finally {
        persisting = false;
    }
}

function onRemoteEffect(raw: unknown) {
    const snap = parseEffect(raw);
    if (!snap) return;
    applyingRemote = true;
    try {
        const deniedAt = mergeDeniedAt(effect.deniedAt, snap.deniedAt);
        const deniedIds = unique([...effect.deniedIds, ...snap.deniedIds].filter(id => id && !isHomeId(id))).slice(0, DENIED_MAX);
        const keepAt: Record<string, string> = {};
        for (const id of deniedIds) {
            if (deniedAt[id]) keepAt[id] = deniedAt[id];
        }
        effect.deniedIds = deniedIds;
        effect.deniedAt = keepAt;
        effect.visits = capVisits(unique([currentVisit() ?? "", ...snap.visits, ...effect.visits]));
        effect.ts = Math.max(effect.ts, snap.ts);
        maybePaint();
    } finally {
        applyingRemote = false;
    }
}

function onEffectStorage(e: StorageEvent) {
    if (e.key !== EFFECT_LS_KEY) return;
    onRemoteEffect(e.newValue);
}

function bindEffectSync() {
    if (typeof GM_addValueChangeListener === "function") {
        try {
            gmListenerId = GM_addValueChangeListener(EFFECT_GM_KEY, (_key, _old, value, remote) => {
                if (remote) onRemoteEffect(value);
            });
        } catch { /* ignore */ }
        return;
    }
    window.addEventListener("storage", onEffectStorage);
}

function unbindEffectSync() {
    if (gmListenerId && typeof GM_removeValueChangeListener === "function") {
        try { GM_removeValueChangeListener(gmListenerId); } catch { /* ignore */ }
        gmListenerId = 0;
    }
    window.removeEventListener("storage", onEffectStorage);
}

function initEffect() {
    if (effectHydrated) return;
    const disk = readEffectDisk();
    if (disk) {
        effect = disk;
    } else {
        const fromSettings = {
            visits: asStringList(settings.plain.visits),
            deniedIds: asStringList(settings.plain.deniedIds),
            deniedAt: asStringRecord(settings.plain.deniedAt),
        };
        effect = {
            v: 1,
            visits: fromSettings.visits,
            deniedIds: fromSettings.deniedIds,
            deniedAt: fromSettings.deniedAt,
            ts: 0,
        };
        if (fromSettings.visits.length || fromSettings.deniedIds.length) persistEffect(fromSettings.visits);
    }
    effectHydrated = true;
    bindEffectSync();
}

let writing = false;
let pendingVisits: string[] | null = null;
let bumpTimer = 0;
let effect = emptyEffect();
let effectHydrated = false;
let persisting = false;
let applyingRemote = false;
let gmListenerId = 0;
const revivedIds = new Set<string>();

function writeVisits(next: string[]) {
    pendingVisits = next;
    if (writing) return;
    writing = true;
    try {
        while (pendingVisits) {
            const input = pendingVisits;
            pendingVisits = null;
            commitVisits(input);
        }
    } finally {
        writing = false;
    }
}

function commitVisits(next: string[]) {
    const changedVisits = persistEffect(next);
    const visits = readVisits();
    const rawWs = pruneRecord(settings.plain.workspaceByConv, visits);
    const workspaceByConv: Record<string, string> = {};
    for (const [id, value] of Object.entries(rawWs)) {
        if (id === HOME_KEY) continue;
        const ws = asWorkspaceId(value);
        if (ws) workspaceByConv[id] = ws;
    }
    const pages = pruneRecord(settings.plain.pages, visits);
    const usedWs = new Set(Object.values(workspaceByConv));
    for (const id of visits) {
        const ws = workspaceFromHomeId(id);
        if (!ws) continue;
        usedWs.add(ws);
        workspaceByConv[id] = ws;
    }
    const keepProjects: Record<string, string> = {};
    const keepIcons: Record<string, string> = {};
    const idx = sidebarIndex();
    for (const [id, name] of Object.entries(settings.plain.projectNames ?? {})) {
        const n = usableName(name);
        if (!usedWs.has(id) || !n) continue;
        const side = usableName(idx.nameByWs[id] || "");
        if (isBrandLabel(n) && side && side !== n) continue;
        keepProjects[id] = n;
    }
    for (const [id, snap] of Object.entries(settings.plain.projectIcons ?? {})) {
        if (!usedWs.has(id) || !snap || isChromeSnap(snap)) continue;
        keepIcons[id] = snap;
    }
    let changed = changedVisits;
    const titles: Record<string, string> = {};
    for (const [id, name] of Object.entries(pruneRecord(settings.plain.titles, visits))) {
        const t = usableTitle(name);
        if (t) titles[id] = t;
    }
    if (assignRecord("titles", titles)) changed = true;
    if (assignRecord("workspaceByConv", workspaceByConv)) changed = true;
    if (assignRecord("pages", pages)) changed = true;
    if (assignRecord("projectNames", keepProjects)) changed = true;
    if (assignRecord("projectIcons", keepIcons)) changed = true;
    if (changed) maybePaint();
}

function rememberTitle(id: string, title?: string) {
    const t = usableTitle(title);
    if (!id || isHomeId(id) || !t || isDenied(id)) return;
    const fromStore = usableTitle(lookup(id)?.title);
    if (!fromStore || fromStore !== t) return;
    if (id === chatIdFromUrl() && isAccessDeniedPage()) return;
    const prev = settings.plain.titles ?? {};
    if (prev[id] === t) return;
    settings.store.titles = { ...prev, [id]: t };
}

function isHomeId(id: string) {
    return id === HOME_KEY || id.startsWith(HOME_SEP);
}

function homeId(workspaceId?: string) {
    const ws = asWorkspaceId(workspaceId);
    return ws ? HOME_SEP + ws : HOME_KEY;
}

function workspaceFromHomeId(id: string) {
    return id.startsWith(HOME_SEP) ? asWorkspaceId(id.slice(HOME_SEP.length)) : "";
}

function routeConvId(route?: GrokRoute | null): string | null {
    if (!route) return null;
    if (route.conversationId) return route.conversationId;
    if (typeof route.chat === "string" && route.chat) return route.chat;
    if (route.page === "main") return HOME_KEY;
    if (route.page === "workspace" && asWorkspaceId(route.workspaceId) && !route.conversationId) return homeId(route.workspaceId);
    return null;
}

function projectIdFromUrl(): string {
    const m = location.pathname.match(/^\/project\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
        ?? location.pathname.match(/^\/project\/(deepsearch)(?:\/|$)/i);
    return m?.[1] ?? "";
}

function chatIdFromUrl(): string {
    try {
        const u = new URL(location.href);
        const q = u.searchParams.get("chat");
        if (q) return q;
        return u.pathname.match(/^\/c\/([^/?#]+)/i)?.[1] ?? "";
    } catch {
        return "";
    }
}

const WS_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|deepsearch)$/i;

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

function hrefFor(id: string, workspaceId?: string): string {
    if (isHomeId(id)) {
        const ws = workspaceFromHomeId(id) || asWorkspaceId(workspaceId);
        return ws ? `/project/${ws}?tab=conversations` : "/";
    }
    const ws = asWorkspaceId(workspaceId);
    if (!id) return ws ? `/project/${ws}?tab=conversations` : "/";
    if (ws) return `/project/${ws}?chat=${encodeURIComponent(id)}`;
    return `/c/${encodeURIComponent(id)}`;
}

function hrefParts(href: string | null | undefined): { ws: string; chat: string; } {
    if (!href) return { ws: "", chat: "" };
    try {
        const u = new URL(href, location.origin);
        const ws = asWorkspaceId(u.pathname.match(/^\/project\/([^/?#]+)/i)?.[1]);
        const chat = u.searchParams.get("chat") || u.pathname.match(/^\/c\/([^/?#]+)/i)?.[1] || "";
        return { ws, chat };
    } catch {
        return { ws: "", chat: "" };
    }
}

function currentVisit(): string | null {
    const urlChat = chatIdFromUrl();
    if (urlChat) return urlChat;
    const ws = projectIdFromUrl();
    if (ws) return homeId(ws);
    try {
        const path = location.pathname.replace(/\/+$/, "") || "/";
        if (path === "/") return HOME_KEY;
    } catch {}
    try {
        const fromRoute = routeConvId(RoutingStore.useRoutingStore.getState().route);
        if (fromRoute != null && isHomeId(fromRoute)) return fromRoute;
    } catch (e) {
        logger.debug("RoutingStore unavailable:", e);
    }
    return null;
}

function idsFromHistory(): string[] {
    try {
        const { route, historyStack } = RoutingStore.useRoutingStore.getState();
        const ids: string[] = [];
        const add = (r?: GrokRoute) => {
            const id = routeConvId(r);
            if (id == null || isDenied(id)) return;
            ids.push(id);
        };
        add(route);
        for (let i = (historyStack?.length ?? 0) - 1; i >= 0; i--) add(historyStack[i]);
        return unique(ids);
    } catch (e) {
        logger.debug("historyStack unavailable:", e);
        return [];
    }
}

function pageTitle(): string {
    return usableTitle(document.title.replace(TITLE_TAIL, ""));
}

function accessWallText(): boolean {
    try {
        const root = document.querySelector("main") ?? document.body;
        if (!root) return false;
        const text = (root.textContent || "").slice(0, 4000);
        return ACCESS_NEED.test(text) && ACCESS_HINT.test(text);
    } catch {
        return false;
    }
}

function pageHasOwnMessages(id: string): boolean {
    if (!id || isHomeId(id) || id !== chatIdFromUrl()) return false;
    try {
        if (linesFromStore(id).length) return true;
    } catch { /* ignore */ }
    try {
        if (responsesOf(id).some(r => r && !r.isControl)) return true;
    } catch { /* ignore */ }
    return false;
}

function routeAligned(id: string): boolean {
    if (!id) return false;
    if (isHomeId(id)) return !chatIdFromUrl();
    if (chatIdFromUrl() !== id) return false;
    try {
        const routeId = routeConvId(RoutingStore.useRoutingStore.getState().route);
        if (routeId && !isHomeId(routeId) && routeId !== id) return false;
    } catch { /* ignore */ }
    try {
        const conv = ChatPageStore.useChatPageStore.getState().conversationId;
        if (conv && conv !== id) return false;
    } catch { /* ignore */ }
    return true;
}

function isAccessDeniedPage(): boolean {
    try {
        const id = chatIdFromUrl();
        if (!id || !accessWallText()) return false;
        return !pageHasOwnMessages(id);
    } catch {
        return false;
    }
}

function titleFromPage(id: string): string {
    if (!id || isDenied(id) || id !== chatIdFromUrl() || isAccessDeniedPage()) return "";
    const fromStore = usableTitle(lookup(id)?.title);
    if (!fromStore) return "";
    const fromDoc = pageTitle();
    if (fromDoc && fromDoc !== fromStore) return "";
    return fromDoc || fromStore;
}

function lookup(id: string): GrokConversation | undefined {
    try {
        const { byId, byIdWithWorkspaces, list } = ConversationStore.useConversationStore.getState();
        return byId[id] ?? byIdWithWorkspaces[id] ?? list.find(c => c.conversationId === id);
    } catch (e) {
        logger.debug("Conversation lookup failed:", e);
        return undefined;
    }
}

function titleOf(id: string): string {
    if (!id || isHomeId(id)) return "New chat";
    if (isDenied(id)) return usableTitle(settings.plain.titles?.[id]) || "Untitled";
    const conv = lookup(id);
    return usableTitle(conv?.title)
        || usableTitle(settings.plain.titles?.[id])
        || titleFromPage(id)
        || "Untitled";
}

function liveWorkspaceId(): string {
    const fromUrl = asWorkspaceId(projectIdFromUrl());
    if (fromUrl) return fromUrl;
    if (!chatIdFromUrl()) return "";
    try {
        const { workspaceId } = RoutingStore.useRoutingStore.getState().route;
        const id = asWorkspaceId(workspaceId);
        if (id) return id;
    } catch {}
    try {
        return asWorkspaceId(ChatPageStore.useChatPageStore.getState().projectId);
    } catch {}
    return "";
}

function workspaceFromHistory(id: string): string {
    try {
        const { route, historyStack } = RoutingStore.useRoutingStore.getState();
        if (routeConvId(route) === id) {
            const ws = asWorkspaceId(route.workspaceId);
            if (ws) return ws;
        }
        for (let i = (historyStack?.length ?? 0) - 1; i >= 0; i--) {
            const r = historyStack[i];
            if (routeConvId(r) === id) {
                const ws = asWorkspaceId(r?.workspaceId);
                if (ws) return ws;
            }
        }
    } catch {}
    return "";
}

function convWorkspaceId(id: string): string {
    try {
        const { byId, byIdWithWorkspaces } = ConversationStore.useConversationStore.getState();
        const resolved = ConversationStore.resolveConversationProjectWorkspaceId?.(byId[id], byIdWithWorkspaces[id]);
        const fromResolver = asWorkspaceId(resolved);
        if (fromResolver) return fromResolver;
        const conv = byId[id] ?? byIdWithWorkspaces[id];
        return asWorkspaceId(conv?.workspaceId) || asWorkspaceId(conv?.workspaces);
    } catch (e) {
        logger.debug("convWorkspaceId failed:", e);
        return asWorkspaceId(lookup(id)?.workspaceId) || asWorkspaceId(lookup(id)?.workspaces);
    }
}

function workspaceFromDom(id: string): string {
    if (!id) return "";
    try {
        for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
            const href = a.getAttribute("href");
            if (!href || !href.includes(id)) continue;
            const { ws, chat } = hrefParts(href);
            if (chat === id && ws) return ws;
        }
    } catch {}
    return "";
}

function shortOwnText(el: Element): string {
    const parts: string[] = [];
    for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
            parts.push(n.textContent ?? "");
            continue;
        }
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches("svg, a[href]")) continue;
        const nestedHref = n.getAttribute("href") ?? "";
        if (nestedHref.includes("chat=") || nestedHref.includes("/c/")) continue;
        if (n.querySelector("a[href*='chat='], a[href*='/c/']")) continue;
        const t = (n.textContent ?? "").replaceAll(/\s+/g, " ").trim();
        if (t.length > 0 && t.length <= 64) parts.push(t);
    }
    const out = parts.join(" ").replaceAll(/\s+/g, " ").trim();
    return out.length >= 2 && out.length <= 64 ? out : "";
}

function folderLabel(el: Element): string {
    if (!el.querySelector("svg")) return "";
    const { chat } = hrefParts(el.getAttribute("href"));
    if (chat) return "";
    return usableName(shortOwnText(el));
}

function pathSpan(d: string): number {
    let min = Infinity;
    let max = -Infinity;
    const re = /-?\d*\.?\d+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d))) {
        const n = Number(m[0]);
        if (n < min) min = n;
        if (n > max) max = n;
    }
    return Number.isFinite(min) ? max - min : 0;
}

function isDotPath(d: string): boolean {
    return /h\s*\.0?1\b|v\s*\.0?1\b/i.test(d);
}

function isChromeSnap(snap: string): boolean {
    if (!snap) return true;
    const lines = snap.split("\n").map(s => s.trim()).filter(Boolean);
    if (!lines.length) return true;
    const circles = lines.filter(s => /^c:/i.test(s));
    const paths = lines.filter(s => !/^[cly]:/i.test(s));
    const body = paths.filter(d => d !== SPIN_D && !isDotPath(d) && d.length >= 24 && pathSpan(d) >= 10);
    if (body.length) return false;
    if (circles.length === 3 || circles.length === 6) return true;
    if (paths.length >= 2 && paths.every(d => isDotPath(d) || pathSpan(d) < 10)) return true;
    if (paths.length === 1 && paths[0].length < 32) return true;
    if (!paths.length && circles.length > 0 && circles.every(c => Number(c.split(",")[2]) <= 1.5)) return true;
    return false;
}

function isChromeSvg(svg: SVGSVGElement): boolean {
    if (svg.closest(ICON_SKIP)) return true;
    const ds: string[] = [];
    for (const p of svg.querySelectorAll("path")) {
        const d = (p.getAttribute("d") || "").trim();
        if (d) ds.push(d);
    }
    if (ds.some(d => d === SPIN_D) && !ds.some(d => d !== SPIN_D && d.length >= 24)) return true;
    const nCircle = svg.querySelectorAll("circle").length;
    const body = ds.filter(d => d !== SPIN_D && !isDotPath(d) && d.length >= 24 && pathSpan(d) >= 10);
    if (body.length) return false;
    if ((nCircle === 3 || nCircle === 6) && !body.length) return true;
    if (ds.length >= 2 && ds.every(d => isDotPath(d) || pathSpan(d) < 10)) return true;
    if (ds.length === 1 && ds[0].length < 32 && nCircle === 0) return true;
    return false;
}

function attrNum(el: Element, name: string): string {
    const t = (el.getAttribute(name) || "").trim();
    return /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t) ? t : "";
}

function encodeIcon(svg: SVGSVGElement | null): string {
    if (!svg || isChromeSvg(svg)) return "";
    const parts: string[] = [];
    for (const node of svg.querySelectorAll("path, circle, line, polyline")) {
        const tag = node.localName;
        if (tag === "path") {
            const d = (node.getAttribute("d") || "").trim();
            if (!d || d === SPIN_D || !PATH_OK.test(d) || isDotPath(d)) continue;
            parts.push(d);
            continue;
        }
        if (tag === "circle") {
            const cx = attrNum(node, "cx");
            const cy = attrNum(node, "cy");
            const r = attrNum(node, "r");
            if (!cx || !cy || !r || Number(r) <= 1.5) continue;
            parts.push(`c:${cx},${cy},${r}`);
            continue;
        }
        if (tag === "line") {
            const x1 = attrNum(node, "x1");
            const y1 = attrNum(node, "y1");
            const x2 = attrNum(node, "x2");
            const y2 = attrNum(node, "y2");
            if (!x1 || !y1 || !x2 || !y2) continue;
            parts.push(`l:${x1},${y1},${x2},${y2}`);
            continue;
        }
        const pts = (node.getAttribute("points") || "").trim();
        if (pts && /^[\d.,\s+-]+$/.test(pts) && pts.length <= 240) parts.push(`y:${pts}`);
    }
    if (isChromeSnap(parts.join("\n"))) return "";
    const hasPath = parts.some(p => !/^[cly]:/i.test(p) && p.length >= 24);
    const hasBody = parts.some(p => p.startsWith("c:") && Number(p.split(",")[2]) > 1.5);
    const extras = parts.filter(p => /^[ly]:/i.test(p)).length;
    return hasPath || hasBody || extras >= 2 ? parts.join("\n") : "";
}

function pickProjectSvg(el: Element): SVGSVGElement | null {
    for (const svg of el.querySelectorAll<SVGSVGElement>("svg")) {
        const host = svg.closest("a[href]");
        if (host && host !== el) {
            const { chat } = hrefParts(host.getAttribute("href"));
            if (chat) continue;
        }
        if (encodeIcon(svg)) return svg;
    }
    return null;
}

function liveIconSnap(ws: string): string {
    if (!ws) return "";
    const snap = sidebarIndex().iconByWs[ws] || "";
    return snap && !isChromeSnap(snap) ? snap : "";
}

function rememberProjectIcon(ws: string) {
    if (!ws) return;
    const snap = liveIconSnap(ws);
    const prev = settings.plain.projectIcons ?? {};
    if (snap) {
        wsIcons[ws] = snap;
        if (prev[ws] !== snap) settings.store.projectIcons = { ...prev, [ws]: snap };
        return;
    }
    if (prev[ws] && isChromeSnap(prev[ws])) {
        const next = { ...prev };
        delete next[ws];
        delete wsIcons[ws];
        settings.store.projectIcons = next;
    }
}

function projectNameFromAncestors(el: Element): string {
    const sidebar = el.closest("[data-sidebar=sidebar]");
    let cur: Element | null = el.parentElement;
    while (cur && cur !== sidebar) {
        let sib: Element | null = cur;
        while (sib) {
            const name = folderLabel(sib);
            if (name) return name;
            sib = sib.previousElementSibling;
        }
        cur = cur.parentElement;
    }
    return "";
}

function invalidateSidebar() {
    sidebarSnap = null;
}

function sidebarIndex(): SidebarIndex {
    const empty: SidebarIndex = { wsByConv: {}, nameByWs: {}, nameByConv: {}, iconByWs: {} };
    const sidebar = document.querySelector("[data-sidebar=sidebar]");
    if (!sidebar) return empty;
    let iconSig = 0;
    for (const p of sidebar.querySelectorAll("svg path")) iconSig += (p.getAttribute("d") || "").length;
    iconSig += sidebar.querySelectorAll("svg circle").length * 17;
    const key = `${sidebar.childElementCount}:${(sidebar.textContent ?? "").length}:${iconSig}`;
    if (sidebarSnap?.key === key) return sidebarSnap.index;

    const index: SidebarIndex = { wsByConv: {}, nameByWs: {}, nameByConv: {}, iconByWs: {} };
    let currentName = "";
    let pendingIcon = "";

    const assignConv = (chat: string, ws: string, name: string) => {
        if (!chat || !ws) return;
        index.wsByConv[chat] = ws;
        const label = usableName(name || currentName || index.nameByWs[ws] || "");
        if (label) {
            index.nameByWs[ws] = label;
            index.nameByConv[chat] = label;
        }
    };

    for (const el of sidebar.querySelectorAll<HTMLElement>("a[href], button, [role='button']")) {
        const { ws, chat } = hrefParts(el.getAttribute("href"));
        if (chat) {
            assignConv(chat, ws, currentName);
            if (ws && pendingIcon) index.iconByWs[ws] ??= pendingIcon;
            if (ws && !index.nameByConv[chat]) {
                const up = usableName(projectNameFromAncestors(el));
                if (up) {
                    index.nameByConv[chat] = up;
                    index.nameByWs[ws] ??= up;
                    currentName ||= up;
                }
            }
            continue;
        }

        const label = shortOwnText(el) || folderLabel(el);
        if (isSkipLabel(label) && !ws) {
            currentName = "";
            pendingIcon = "";
            continue;
        }

        if (ws) {
            const n = usableName(label);
            if (n) {
                currentName = n;
                index.nameByWs[ws] = n;
            } else if (isSkipLabel(label)) {
                currentName = index.nameByWs[ws] || "";
            }
            const snap = encodeIcon(pickProjectSvg(el));
            if (snap) index.iconByWs[ws] ??= snap;
            else if (pendingIcon) index.iconByWs[ws] ??= pendingIcon;
            continue;
        }

        const folder = folderLabel(el);
        if (folder) {
            currentName = folder;
            pendingIcon = encodeIcon(pickProjectSvg(el));
        }
    }

    sidebarSnap = { key, index };
    return index;
}

function workspaceFetchedEmpty(id: string): boolean {
    try {
        const { byIdWithWorkspaces } = ConversationStore.useConversationStore.getState();
        return !!byIdWithWorkspaces[id] && !convWorkspaceId(id);
    } catch {
        return false;
    }
}

function routeWorkspaceFor(id: string): string {
    if (id === chatIdFromUrl()) return asWorkspaceId(projectIdFromUrl());
    try {
        const { route } = RoutingStore.useRoutingStore.getState();
        const chat = route.conversationId || (typeof route.chat === "string" ? route.chat : "");
        if (chat === id) return asWorkspaceId(route.workspaceId);
    } catch {}
    return "";
}

function dropWorkspace(id: string) {
    const prev = settings.plain.workspaceByConv ?? {};
    if (!prev[id]) return;
    const next = { ...prev };
    delete next[id];
    settings.store.workspaceByConv = next;
}

function workspaceOf(id: string): string {
    if (!id) return "";
    if (isHomeId(id)) return workspaceFromHomeId(id);
    const fromConv = convWorkspaceId(id);
    if (fromConv) return fromConv;
    if (workspaceFetchedEmpty(id)) return "";
    const fromSidebar = sidebarIndex().wsByConv[id] || workspaceFromDom(id);
    if (fromSidebar) return fromSidebar;
    const cached = asWorkspaceId(settings.plain.workspaceByConv?.[id]);
    if (cached) return cached;
    const fromHist = workspaceFromHistory(id);
    if (fromHist) return fromHist;
    if (id === currentVisit()) return routeWorkspaceFor(id);
    return "";
}

function readOpenProjectName(): string {
    const idx = sidebarIndex();
    const live = liveWorkspaceId();
    if (live) {
        const n = usableName(idx.nameByWs[live]);
        if (n) return n;
    }
    const current = currentVisit();
    const ws = current ? workspaceOf(current) : "";
    if (!current || !ws) return "";
    return usableName(idx.nameByConv[current] || idx.nameByWs[ws]);
}

function projectNameOf(id: string): string {
    if (!id) return "";
    const ws = workspaceOf(id);
    if (!ws) return "";
    const idx = sidebarIndex();
    const named = usableName(idx.nameByConv[id] || idx.nameByWs[ws] || wsNames[ws] || settings.plain.projectNames?.[ws] || "");
    if (!named) return "";
    const live = liveWorkspaceId();
    const liveName = readOpenProjectName();
    if (live && ws !== live && liveName && named === liveName) return "";
    return named;
}

function rememberProject(id: string) {
    if (!id || id === HOME_KEY) return;
    const ws = workspaceOf(id);
    if (!ws) return;
    const prevWs = settings.plain.workspaceByConv ?? {};
    if (prevWs[id] !== ws) settings.store.workspaceByConv = { ...prevWs, [id]: ws };

    const idx = sidebarIndex();
    const sidebarName = usableName(idx.nameByConv[id] || idx.nameByWs[ws] || "");
    const liveName = ws === liveWorkspaceId() ? readOpenProjectName() : "";
    const cached = usableName(wsNames[ws] || settings.plain.projectNames?.[ws] || "");
    const fallback = !isBrandLabel(liveName) ? usableName(liveName) : "";
    const name = sidebarName || fallback || cached;
    rememberProjectIcon(ws);
    if (!name) return;
    wsNames[ws] = name;
    const prevNames = settings.plain.projectNames ?? {};
    if (prevNames[ws] !== name) settings.store.projectNames = { ...prevNames, [ws]: name };
}

function reconcileSidebarCache() {
    const idx = sidebarIndex();
    const prevWs = { ...settings.plain.workspaceByConv };
    const prevNames = { ...settings.plain.projectNames };
    const prevIcons = { ...settings.plain.projectIcons };
    let wsChanged = false;
    let namesChanged = false;
    let iconsChanged = false;

    for (const [conv, ws] of Object.entries(idx.wsByConv)) {
        if (prevWs[conv] !== ws) {
            prevWs[conv] = ws;
            wsChanged = true;
        }
    }
    for (const [ws, name] of Object.entries(idx.nameByWs)) {
        const n = usableName(name);
        if (!n) continue;
        wsNames[ws] = n;
        if (prevNames[ws] !== n) {
            prevNames[ws] = n;
            namesChanged = true;
        }
    }
    for (const [ws, snap] of Object.entries(idx.iconByWs)) {
        if (!snap || isChromeSnap(snap)) continue;
        wsIcons[ws] = snap;
        if (prevIcons[ws] !== snap) {
            prevIcons[ws] = snap;
            iconsChanged = true;
        }
    }
    for (const [ws, snap] of Object.entries(prevIcons)) {
        if (!snap || !isChromeSnap(snap)) continue;
        delete prevIcons[ws];
        delete wsIcons[ws];
        iconsChanged = true;
    }
    for (const [ws, name] of Object.entries(prevNames)) {
        if (usableName(name)) continue;
        delete prevNames[ws];
        delete wsNames[ws];
        namesChanged = true;
    }

    if (wsChanged) settings.store.workspaceByConv = prevWs;
    if (namesChanged) settings.store.projectNames = prevNames;
    if (iconsChanged) settings.store.projectIcons = prevIcons;
}

function requestWorkspace(id: string) {
    if (!id || isHomeId(id) || pendingWs.has(id)) return;
    if (convWorkspaceId(id)) return;
    if (workspaceFetchedEmpty(id)) {
        dropWorkspace(id);
        return;
    }
    if (sidebarIndex().wsByConv[id]) return;
    pendingWs.add(id);
    try {
        const { fetchGetConversationWithWorkspaces, fetchGetConversation } = ConversationStore.useConversationStore.getState();
        const fetchConv = fetchGetConversationWithWorkspaces ?? fetchGetConversation;
        if (!fetchConv) {
            pendingWs.delete(id);
            return;
        }
        fetchConv(id).then(conv => {
            const ws = asWorkspaceId(ConversationStore.resolveConversationProjectWorkspaceId?.(conv))
                || asWorkspaceId(conv?.workspaceId)
                || asWorkspaceId(conv?.workspaces);
            if (!ws) {
                dropWorkspace(id);
                maybePaint();
                return;
            }
            const prev = settings.plain.workspaceByConv ?? {};
            if (prev[id] !== ws) settings.store.workspaceByConv = { ...prev, [id]: ws };
            const live = liveWorkspaceId();
            const liveName = usableName(readOpenProjectName());
            const names = settings.plain.projectNames ?? {};
            if (live && ws !== live && liveName && names[ws] === liveName) {
                const next = { ...names };
                delete next[ws];
                settings.store.projectNames = next;
                delete wsNames[ws];
            }
            maybePaint();
        }).catch(e => logger.debug("workspace fetch failed:", e)).finally(() => {
            pendingWs.delete(id);
        });
    } catch {
        pendingWs.delete(id);
    }
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

function messageList(pane: HTMLElement): HTMLElement {
    let node = pane;
    for (let i = 0; i < 8; i++) {
        const kids = [...node.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
        if (kids.length === 1 && kids[0].children.length > 1) {
            node = kids[0];
            continue;
        }
        break;
    }
    return node;
}

function chromeOff(el: HTMLElement): HTMLElement {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("button, .void-timestamp, time, nav, svg, [class*='timestamp']").forEach(n => n.remove());
    return clone;
}

function userBubble(root: HTMLElement): HTMLElement | null {
    const tagged = root.matches("[data-testid='user-message']")
        ? root
        : root.querySelector<HTMLElement>("[data-testid='user-message'], [data-void-rt-role='user'], .void-rt-user-msg");
    if (tagged) return tagged;
    const cands = [...root.querySelectorAll<HTMLElement>("[class*='justify-end'], [class*='self-end'], [class*='ml-auto'], [class*='ms-auto']")];
    if (/justify-end|self-end|ml-auto|ms-auto/.test(root.className)) cands.unshift(root);
    if (!cands.length) return null;
    const inner = cands.filter(el => !cands.some(other => other !== el && el.contains(other)));
    inner.sort((a, b) => (b.innerText?.length ?? 0) - (a.innerText?.length ?? 0));
    return inner[0] ?? null;
}

function extractTurn(kid: HTMLElement): PageLine[] {
    const tagged = [...kid.querySelectorAll<HTMLElement>(MSG_SEL)];
    if (kid.matches(MSG_SEL)) tagged.unshift(kid);
    if (tagged.length) {
        const lines: PageLine[] = [];
        for (const el of tagged) {
            const role = el.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
            const text = scrubText(chromeOff(el).innerText ?? "");
            if (text) lines.push({ role, text });
        }
        return lines;
    }
    const bubble = userBubble(kid);
    if (!bubble) return [];
    const userText = scrubText(chromeOff(bubble).innerText ?? "");
    const rest = chromeOff(kid);
    if (bubble !== kid) {
        rest.querySelectorAll(`${MSG_SEL}, [class*='justify-end'], [class*='self-end'], [class*='ml-auto']`).forEach(n => n.remove());
    }
    let asstText = scrubText(rest.innerText ?? "");
    if (userText && asstText.includes(userText)) asstText = scrubText(asstText.replace(userText, " "));
    const lines: PageLine[] = [];
    if (userText) lines.push({ role: "user", text: userText });
    if (asstText && asstText !== userText) lines.push({ role: "assistant", text: asstText });
    return lines;
}

function extractMarks(root: ParentNode): PageLine[] {
    const marks = [...root.querySelectorAll<HTMLElement>(".void-rt-mark")];
    if (!marks.length) return [];
    const out: PageLine[] = [];
    for (const m of marks) {
        const role = m.getAttribute("data-role") === "user" ? "user" : "assistant";
        const text = scrubText(m.textContent ?? "");
        if (text) out.push({ role, text });
    }
    return lastRound(out);
}

function extractLines(pane: HTMLElement): PageLine[] {
    const fromMarks = extractMarks(pane);
    if (fromMarks.length) return fromMarks;
    const tagged = [...pane.querySelectorAll<HTMLElement>(MSG_SEL)];
    if (tagged.length) {
        const out: PageLine[] = [];
        for (const el of tagged) {
            const role = el.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
            const text = scrubText(chromeOff(el).innerText ?? "");
            if (text) out.push({ role, text });
        }
        return lastRound(out);
    }
    const source = messageList(pane);
    const kids = [...source.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    const out: PageLine[] = [];
    for (const kid of kids) out.push(...extractTurn(kid));
    return lastRound(out);
}

function looksLikeChrome(text: string): boolean {
    if (FILES_CHROME.test(text)) return true;
    const packed = text.replaceAll(/\s+/g, "").toLowerCase();
    return packed.startsWith("filesaddfiles");
}

function scrubText(raw: string): string {
    let t = raw.replaceAll(/\s+/g, " ").trim();
    t = t.replace(TIME_TOKEN, " ").replace(STATUS_TOKEN, " ");
    t = t.replaceAll(/\s+/g, " ").trim();
    if (!t || SKIP_NOISE.test(t) || looksLikeChrome(t)) return "";
    return t;
}

function plainText(md: string): string {
    const t = md
        .replaceAll(/```[\s\S]*?```/g, " ")
        .replaceAll(/`([^`]+)`/g, "$1")
        .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replaceAll(/^#{1,6}\s+/gm, "")
        .replaceAll(/[*_~]{1,3}/g, "")
        .replaceAll(/^>\s+/gm, "");
    return scrubText(t);
}

function clipLine(text: string, max: number): string {
    const t = scrubText(text);
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function lastRound(lines: PageLine[]): PageLine[] {
    const cleaned = lines
        .map(line => ({ role: line.role, text: scrubText(line.text) }))
        .filter((line): line is PageLine => !!line.text);
    if (!cleaned.length) return [];
    let asst = -1;
    let user = -1;
    for (let i = cleaned.length - 1; i >= 0; i--) {
        if (asst < 0 && cleaned[i].role === "assistant") asst = i;
        if (user < 0 && cleaned[i].role === "user") user = i;
        if (asst >= 0 && user >= 0) break;
    }
    const pick: PageLine[] = user >= 0 && asst >= 0 && user < asst
        ? [cleaned[user], cleaned[asst]]
        : user >= 0 && (asst < 0 || user > asst)
            ? [cleaned[user]]
            : asst >= 0
                ? [cleaned[asst]]
                : cleaned.slice(-1);
    return pick.map(line => ({
        role: line.role,
        text: clipLine(line.text, line.role === "user" ? 72 : 140),
    }));
}

function pickUserText(query: string, message: string): string {
    const q = plainText(query);
    const m = plainText(message);
    if (q && m) {
        if (m.startsWith(q) && m.length > q.length) return q;
        return q.length <= m.length ? q : m;
    }
    return q || m;
}

function walkThread(startId: string | undefined): GrokResponse[] {
    if (!startId) return [];
    try {
        const { byId } = ResponseStore.useResponseStore.getState();
        const out: GrokResponse[] = [];
        const seen = new Set<string>();
        let id: string | undefined = startId;
        while (id && !seen.has(id) && out.length < 50) {
            seen.add(id);
            const r: GrokResponse | undefined = byId[id];
            if (!r) break;
            out.unshift(r);
            id = r.parentResponseId;
        }
        return out;
    } catch {
        return [];
    }
}

function responsesOf(id: string): GrokResponse[] {
    const { byConversationId, byId, nodesByConversationId } = ResponseStore.useResponseStore.getState();
    const nodes = nodesByConversationId[id] ?? [];
    if (nodes.length) {
        const list = nodes.map(n => byId[n.responseId]).filter((r): r is GrokResponse => !!r);
        if (list.length) return list;
        const walked = walkThread(nodes.at(-1)?.responseId);
        if (walked.length) return walked;
    }
    const cached = byConversationId[id];
    if (cached?.length) return [...cached].toSorted((a, b) => String(a.createTime ?? "").localeCompare(String(b.createTime ?? "")));
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        if (chat.conversationId === id) {
            return walkThread(chat.lastMessageId ?? chat.streamedMessageId ?? chat.optimisticMessageId);
        }
    } catch { /* ignore */ }
    return [];
}

function responsesToLines(list: GrokResponse[]): PageLine[] {
    const out: PageLine[] = [];
    for (const r of list) {
        if (!r || r.isControl) continue;
        const sender = String(r.sender ?? "").toLowerCase();
        const human = sender === "human" || sender === "user";
        if (human) {
            const text = pickUserText(r.query || "", r.message || "");
            if (text) out.push({ role: "user", text });
            continue;
        }
        const query = pickUserText(r.query || "", "");
        let message = plainText(r.message || "");
        if (query && message.startsWith(query) && message.length > query.length) {
            message = scrubText(message.slice(query.length));
        }
        if (query && out.at(-1)?.text !== query) out.push({ role: "user", text: query });
        if (message && message !== query) out.push({ role: "assistant", text: message });
    }
    return lastRound(out);
}

function linesFromStore(id: string): PageLine[] {
    if (!id) return [];
    try {
        return responsesToLines(responsesOf(id));
    } catch (e) {
        logger.debug("ResponseStore snapshot failed:", e);
        return [];
    }
}

function betterLines(store: PageLine[], dom: PageLine[]): PageLine[] {
    const sr = linesRank(store);
    const dr = linesRank(dom);
    if (dr > sr) return dom;
    if (sr > 0) return store;
    return dom;
}

function linesRank(lines: PageLine[]): number {
    let n = 0;
    if (lines.some(l => l.role === "user")) n += 2;
    if (lines.some(l => l.role === "assistant")) n += 1;
    return n;
}

function parseSnap(raw: string | undefined): PageSnap | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as PageSnap;
        if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length) return null;
        const lines = lastRound(parsed.lines.filter((line): line is PageLine =>
            !!line && (line.role === "user" || line.role === "assistant") && typeof line.text === "string"));
        if (!lines.length) return null;
        return {
            title: typeof parsed.title === "string" ? parsed.title : "",
            theme: parsed.theme === "light" ? "light" : "dark",
            lines,
        };
    } catch {
        return null;
    }
}

function snapOf(id: string): PageSnap | null {
    if (!id || isHomeId(id)) return null;
    const snap = thumbs.get(id) ?? parseSnap(settings.plain.pages?.[id]);
    if (!snap) return null;
    const lines = lastRound(snap.lines);
    if (!lines.length) {
        thumbs.delete(id);
        return null;
    }
    return { ...snap, lines };
}

function rememberPage(id: string, snap: PageSnap) {
    const json = JSON.stringify(snap);
    const prev = settings.plain.pages ?? {};
    if (prev[id] === json) return;
    settings.store.pages = { ...prev, [id]: json };
}

function forgetPage(id: string) {
    thumbs.delete(id);
    const prev = settings.plain.pages ?? {};
    if (!(id in prev)) return;
    const next = { ...prev };
    delete next[id];
    settings.store.pages = next;
}

function prunePages() {
    const prev = settings.plain.pages ?? {};
    const next: Record<string, string> = {};
    let changed = false;
    for (const [id, raw] of Object.entries(prev)) {
        if (isHomeId(id) || !parseSnap(raw)) {
            thumbs.delete(id);
            changed = true;
            continue;
        }
        next[id] = raw;
    }
    if (changed) settings.store.pages = next;
}

function applyLineStyle(el: HTMLElement, role: "user" | "assistant", theme: "dark" | "light") {
    el.style.display = "-webkit-box";
    el.style.webkitBoxOrient = "vertical";
    el.style.overflow = "hidden";
    el.style.width = "fit-content";
    el.style.overflowWrap = "anywhere";
    el.style.fontSize = "11px";
    el.style.lineHeight = "1.35";
    if (role === "user") {
        el.style.alignSelf = "flex-end";
        el.style.maxWidth = "78%";
        el.style.padding = "6px 9px";
        el.style.borderRadius = "14px 14px 4px 14px";
        el.style.background = theme === "light" ? "#e8e6e0" : "#2f2f2f";
        el.style.color = theme === "light" ? "#171717" : "#fff";
        el.style.webkitLineClamp = "2";
    } else {
        el.style.alignSelf = "flex-start";
        el.style.maxWidth = "94%";
        el.style.padding = "0";
        el.style.background = "transparent";
        el.style.color = theme === "light" ? "#3f3f3f" : "#c4c4c4";
        el.style.webkitLineClamp = "4";
    }
}

function buildPageShot(snap: PageSnap): HTMLElement {
    const page = node("span", cl("page"));
    page.dataset.theme = snap.theme;
    for (const line of lastRound(snap.lines)) {
        const el = node("span", cl("page-line", line.role === "user" && "page-line-user"), line.text);
        el.dataset.role = line.role;
        applyLineStyle(el, line.role, snap.theme);
        page.append(el);
    }
    return page;
}

function captureId(id: string) {
    if (!id) return;
    if (isHomeId(id)) {
        forgetPage(id);
        return;
    }
    if (isAccessDeniedPage() && id === chatIdFromUrl()) return;
    if (isDenied(id) && !reviveIfAlive(id)) return;
    const fromStore = linesFromStore(id);
    const live = id === chatIdFromUrl();
    let fromDom: PageLine[] = [];
    if (live) {
        const pane = chatPane();
        if (pane) fromDom = extractLines(pane);
    }
    const lines = lastRound(betterLines(fromStore, fromDom));
    if (!lines.length) return;
    const prev = thumbs.get(id) ?? parseSnap(settings.plain.pages?.[id]);
    const prevLines = prev ? lastRound(prev.lines) : [];
    const nextRank = linesRank(lines);
    const prevRank = linesRank(prevLines);
    if (prevRank && nextRank < prevRank) return;
    if (prevRank && nextRank === prevRank && nextRank < 3 && id !== chatIdFromUrl()) return;
    const snap: PageSnap = {
        title: titleOf(id),
        theme: detectTheme(),
        lines,
    };
    thumbs.set(id, snap);
    rememberPage(id, snap);
}

let capturing = false;

function captureCurrent() {
    if (capturing || open) return;
    capturing = true;
    try {
        const current = currentVisit();
        if (current) captureId(current);
        for (const id of capVisits(readVisits())) {
            if (id && id !== current) captureId(id);
        }
    } catch (e) {
        logger.debug("snapshot failed:", e);
    } finally {
        capturing = false;
    }
}

function scheduleCapture() {
    if (open) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!open) captureCurrent();
        });
    });
}

function readDenied(): string[] {
    return effect.deniedIds;
}

function isDenied(id: string): boolean {
    return !!id && !isHomeId(id) && readDenied().includes(id);
}

function deniedFresh(id: string): boolean {
    const n = Number(effect.deniedAt[id] || "");
    return Number.isFinite(n) && n > 0 && Date.now() - n < DENIED_HOLD_MS;
}

function tombstone(id: string) {
    if (!id || isHomeId(id)) return;
    revivedIds.delete(id);
    effect.deniedIds = unique([id, ...effect.deniedIds]).slice(0, DENIED_MAX);
    effect.deniedAt = { ...effect.deniedAt, [id]: String(Date.now()) };
    forgetPage(id);
    persistEffect();
}

function revive(id: string) {
    if (!id || !isDenied(id)) return;
    revivedIds.add(id);
    effect.deniedIds = effect.deniedIds.filter(x => x !== id);
    const at = { ...effect.deniedAt };
    delete at[id];
    effect.deniedAt = at;
    if (!persisting) persistEffect();
}

function reviveIfAlive(id: string): boolean {
    if (!id || isHomeId(id) || !isDenied(id)) return false;
    if (id !== chatIdFromUrl() || !routeAligned(id) || accessWallText()) return false;
    if (deniedFresh(id)) return false;
    if (!pageHasOwnMessages(id)) return false;
    if (!usableTitle(lookup(id)?.title)) return false;
    revive(id);
    return true;
}

function dropVisit(id: string) {
    if (!id || isHomeId(id)) return;
    tombstone(id);
    writeVisits(readVisits().filter(x => x !== id));
}

function scheduleBump() {
    if (bumpTimer) window.clearTimeout(bumpTimer);
    bumpTimer = window.setTimeout(() => {
        bumpTimer = 0;
        const current = currentVisit();
        if (current == null || !routeAligned(current)) return;
        bump(current);
        scheduleCapture();
    }, SETTLE_MS);
}

function bump(id: string) {
    if (!id) return;
    if (isHomeId(id) && !settings.store.includeHome) return;
    if (!isHomeId(id) && id === chatIdFromUrl() && isAccessDeniedPage()) {
        dropVisit(id);
        return;
    }
    if (!isHomeId(id) && isDenied(id) && !reviveIfAlive(id)) return;
    writeVisits(capVisits([id, ...readVisits()]));
    if (isHomeId(id)) {
        if (shouldRememberProject(id)) rememberProject(id);
        return;
    }
    rememberTitle(id, lookup(id)?.title);
    if (shouldRememberProject(id)) rememberProject(id);
}

function shouldRememberProject(id: string): boolean {
    if (!id || workspaceFetchedEmpty(id)) return false;
    return !!workspaceOf(id);
}

function hydrate() {
    initEffect();
    invalidateSidebar();
    prunePages();
    const current = currentVisit();
    const denied = !!current && !isHomeId(current) && current === chatIdFromUrl() && isAccessDeniedPage();
    if (denied && current) tombstone(current);
    const merged = current == null || denied
        ? [...idsFromHistory(), ...readVisits()]
        : [current, ...idsFromHistory(), ...readVisits()];
    writeVisits(capVisits(merged));
    reconcileSidebarCache();
    if (current && !denied) {
        rememberTitle(current, lookup(current)?.title);
        if (shouldRememberProject(current)) rememberProject(current);
    }
    for (const id of capVisits(readVisits())) {
        if (id) requestWorkspace(id);
    }
}

function topics(): Topic[] {
    return capVisits(readVisits()).map(id => ({
        id,
        title: titleOf(id),
        project: projectNameOf(id),
        ws: workspaceOf(id),
    }));
}

function parseHref(href: string): GrokRoute | null {
    try {
        const u = new URL(href, location.origin);
        const parsed = RoutingStore.urlToRoute(u.pathname, new URLSearchParams(u.search), u.hash.replace(/^#/, ""));
        if (parsed?.page && parsed.page !== "unknown") return parsed;
    } catch (e) {
        logger.debug("urlToRoute failed:", e);
    }
    return null;
}

function applyChatPage(id: string, workspaceId?: string) {
    try {
        const chat = ChatPageStore.useChatPageStore.getState();
        chat.setConversationId(id || undefined);
        if (!id) chat.setOptimisticConversationId(undefined);
        chat.setProjectId(asWorkspaceId(workspaceId) || undefined);
    } catch (e) {
        logger.debug("ChatPageStore update failed:", e);
    }
}

function navigateTo(id: string) {
    try {
        const routing = RoutingStore.useRoutingStore.getState();
        const { route } = routing;
        const teamId = route.teamId ?? null;
        if (isHomeId(id) || !id) {
            const ws = workspaceFromHomeId(id) || asWorkspaceId(workspaceOf(id));
            const hereWs = asWorkspaceId(route.workspaceId) || projectIdFromUrl();
            const hereChat = route.conversationId || chatIdFromUrl();
            if (!ws) {
                if (!hereChat && (route.page === "main" || !hereWs)) return;
                routing.push({ page: "main", conversationId: null, teamId });
                applyChatPage("");
                return;
            }
            if (!hereChat && hereWs === ws) return;
            const dest: GrokRoute = {
                page: "workspace",
                workspaceId: ws,
                tab: "conversations",
                conversationId: null,
                teamId,
            };
            if (hereChat && hereWs === ws) routing.replace(dest);
            else routing.push(dest);
            applyChatPage("", ws);
            if (chatIdFromUrl()) location.assign(hrefFor(homeId(ws), ws));
            return;
        }

        const workspaceId = workspaceOf(id);
        const href = hrefFor(id, workspaceId);
        const parsed = parseHref(href);

        const dest: GrokRoute = workspaceId
            ? {
                page: "workspace",
                workspaceId,
                tab: "conversations",
                conversationId: id,
                teamId,
            }
            : {
                page: "chat",
                conversationId: id,
                temporary: lookup(id)?.temporary ?? false,
                teamId,
            };

        if (parsed?.page === "workspace" && asWorkspaceId(parsed.workspaceId)) {
            dest.page = "workspace";
            dest.workspaceId = asWorkspaceId(parsed.workspaceId);
            dest.conversationId = parsed.conversationId || id;
            dest.tab = parsed.tab || "conversations";
            if (parsed.filePath) dest.filePath = parsed.filePath;
        } else if (parsed?.page === "chat" && parsed.conversationId && !workspaceId) {
            dest.page = "chat";
            dest.conversationId = parsed.conversationId;
            dest.temporary = parsed.temporary ?? dest.temporary;
        }

        if (dest.page === "workspaces" || (dest.page === "workspace" && !asWorkspaceId(dest.workspaceId))) {
            dest.page = "chat";
            dest.conversationId = id;
            delete dest.workspaceId;
            delete dest.tab;
        }

        if (
            routeConvId(route) === dest.conversationId
            && (asWorkspaceId(route.workspaceId) || "") === (asWorkspaceId(dest.workspaceId) || "")
            && route.page === dest.page
        ) return;

        routing.push(dest);
        applyChatPage(id, asWorkspaceId(dest.workspaceId));

        if (dest.page !== "workspace") {
            try {
                const { fetchGetConversationWithWorkspaces, fetchGetConversation } = ConversationStore.useConversationStore.getState();
                const fetchConv = fetchGetConversationWithWorkspaces ?? fetchGetConversation;
                fetchConv?.(id).then(conv => {
                    const ws = asWorkspaceId(ConversationStore.resolveConversationProjectWorkspaceId?.(conv)) || convWorkspaceId(id);
                    if (!ws) return;
                    const now = RoutingStore.useRoutingStore.getState();
                    if (routeConvId(now.route) !== id) return;
                    now.replace({
                        page: "workspace",
                        workspaceId: ws,
                        tab: "conversations",
                        conversationId: id,
                        teamId,
                    });
                    applyChatPage(id, ws);
                    rememberProject(id);
                }).catch(e => logger.debug("workspace resolve failed:", e));
            } catch (e) {
                logger.debug("workspace fetch skipped:", e);
            }
        }
    } catch (e) {
        logger.error("Failed to navigate:", e);
        try {
            location.assign(hrefFor(id, workspaceOf(id) || undefined));
        } catch (navErr) {
            logger.error("Fallback navigation failed:", navErr);
        }
    }
}

function isTrigger(e: KeyboardEvent) {
    if (TRIGGER_CODES.has(e.code) || e.keyCode === 192) return true;
    return TRIGGER_KEYS.has(e.key);
}

function isCtrlKey(e: KeyboardEvent) {
    return e.key === "Control" || e.code === "ControlLeft" || e.code === "ControlRight";
}

function begin(reverse: boolean, fromHold: boolean) {
    held = fromHold;
    open = false;
    captureCurrent();
    open = true;
    selected = 0;
    hoverArmed = false;
    hoverOrigin = false;
    suspendPaint = true;
    try {
        hydrate();
        const current = currentVisit();
        if (current != null) bump(current);
        if (topics().length > 1) selected = reverse ? topics().length - 1 : 1;
    } catch (e) {
        logger.error("Failed to open switcher:", e);
    } finally {
        suspendPaint = false;
    }
    paint();
}

function cycle(reverse: boolean) {
    const { length } = topics();
    if (!length) return;
    selected = (selected + (reverse ? -1 : 1) + length) % length;
    paint();
}

function commit() {
    if (!open) return;
    const target = topics()[selected];
    open = false;
    held = false;
    paint();
    if (target) navigateTo(target.id);
}

function cancel() {
    if (!open) return;
    open = false;
    held = false;
    paint();
}

function onKeyDown(e: KeyboardEvent) {
    if (isCtrlKey(e)) {
        ctrlHeld = true;
        return;
    }

    const combo = (e.ctrlKey || ctrlHeld) && !e.altKey && !e.metaKey && isTrigger(e) && !e.repeat;
    if (combo) {
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
            if (open) cycle(e.shiftKey);
            else begin(e.shiftKey, true);
        } catch (err) {
            logger.error("Hotkey failed:", err);
        }
        return;
    }

    if (!open) return;
    if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return;
    }
    if (e.key === "Tab" && (e.ctrlKey || ctrlHeld)) {
        e.preventDefault();
        cycle(e.shiftKey);
    }
}

function onKeyUp(e: KeyboardEvent) {
    if (!isCtrlKey(e)) return;
    ctrlHeld = false;
    if (open && held) commit();
}

function onBeforeInput(e: Event) {
    if (!ctrlHeld && !open) return;
    const { data } = (e as InputEvent);
    if (data && TRIGGER_KEYS.has(data)) e.preventDefault();
}

function onWindowBlur() {
    ctrlHeld = false;
}

function onVisibility() {
    if (document.hidden) {
        ctrlHeld = false;
        cancel();
    }
}

function pick(index: number) {
    selected = index;
    commit();
}

function node(tag: string, className?: string, text?: string) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function fillShot(box: HTMLElement, id: string) {
    const snap = snapOf(id);
    if (!snap) {
        const fallback = node("span", cl("fallback"));
        fallback.append(faviconImg(cl("favicon")));
        box.append(fallback);
        return;
    }
    const shot = node("span", cl("shot"));
    shot.append(buildPageShot(snap));
    box.append(shot);
}

const GROK_BG_PATH = "M0 256C0 166.392 0 121.587 17.439 87.3615C32.7787 57.2556 57.2556 32.7787 87.3615 17.439C121.587 0 166.392 0 256 0C345.608 0 390.413 0 424.638 17.439C454.744 32.7787 479.221 57.2556 494.561 87.3615C512 121.587 512 166.392 512 256C512 345.608 512 390.413 494.561 424.638C479.221 454.744 454.744 479.221 424.638 494.561C390.413 512 345.608 512 256 512C166.392 512 121.587 512 87.3615 494.561C57.2556 479.221 32.7787 454.744 17.439 424.638C0 390.413 0 345.608 0 256Z";
const GROK_MARK_P1 = "M210.484 312.759L343.465 210.383C349.984 205.364 359.302 207.322 362.408 215.117C378.758 256.231 371.454 305.64 338.925 339.563C306.397 373.487 261.137 380.927 219.768 363.983L174.577 385.803C239.394 432.008 318.104 420.581 367.289 369.251C406.303 328.564 418.386 273.104 407.088 223.091L407.19 223.198C390.807 149.726 411.218 120.359 453.03 60.3072C454.02 58.8833 455.01 57.4595 456 56L400.978 113.382V113.204L210.45 312.794";
const GROK_MARK_P2 = "M183.042 337.641C136.519 291.294 144.54 219.567 184.236 178.203C213.59 147.59 261.683 135.096 303.666 153.464L348.755 131.75C340.632 125.627 330.221 119.042 318.275 114.414C264.277 91.2407 199.63 102.774 155.735 148.516C113.513 192.549 100.236 260.254 123.036 318.027C140.069 361.206 112.148 391.748 84.0229 422.575C74.0561 433.503 64.0553 444.431 56 456L183.007 337.677";
const GROK_ICON_DATA = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${GROK_BG_PATH}" fill="#050505"/><path d="${GROK_MARK_P1}" fill="#FCFCFC"/><path d="${GROK_MARK_P2}" fill="#FCFCFC"/></svg>`)}`;
const ACCENTS = [
    "rgb(37, 99, 235)",
    "rgb(14, 165, 233)",
    "rgb(20, 184, 166)",
    "rgb(249, 115, 22)",
    "rgb(100, 116, 139)",
];

function accentOf(id: string): string {
    if (!id) return ACCENTS[4];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return ACCENTS[hash % ACCENTS.length];
}

function detectTheme(): "dark" | "light" {
    const html = document.documentElement;
    const { body } = document;
    const tokens = `${html.className} ${body?.className ?? ""} ${html.getAttribute("data-theme") ?? ""} ${html.getAttribute("data-color-scheme") ?? ""}`.toLowerCase();
    if (/(^|[\s_-])(dark|night)([\s_-]|$)/.test(tokens) || html.classList.contains("dark") || html.getAttribute("dark") != null) return "dark";
    if (/(^|[\s_-])(light|day)([\s_-]|$)/.test(tokens) || html.classList.contains("light")) return "light";
    try {
        const bg = getComputedStyle(body || html).backgroundColor;
        const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        if (m) {
            const r = Number(m[1]) / 255;
            const g = Number(m[2]) / 255;
            const b = Number(m[3]) / 255;
            const lin = [r, g, b].map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
            const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
            return lum < 0.42 ? "dark" : "light";
        }
    } catch {}
    const scheme = getComputedStyle(html).colorScheme;
    if (scheme.includes("light") && !scheme.includes("dark")) return "light";
    return "dark";
}

function grokFaviconSrc(): string {
    try {
        if (/\.grok\.com$|^grok\.com$/.test(location.hostname)) {
            const link = document.querySelector<HTMLLinkElement>('link[rel*="icon"]:not(#void-chat-state-favicon)');
            const href = link?.href;
            if (href && !href.startsWith("data:")) return href;
            return `${location.origin}/images/favicon.svg`;
        }
    } catch {}
    return GROK_ICON_DATA;
}

function faviconImg(className: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = className;
    img.alt = "";
    img.draggable = false;
    img.src = grokFaviconSrc();
    img.addEventListener("error", () => {
        if (img.src === GROK_ICON_DATA) {
            img.dataset.broken = "true";
            return;
        }
        img.src = GROK_ICON_DATA;
    });
    return img;
}

function folderIcon(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cl("folder"));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", FOLDER_D);
    svg.append(path);
    return svg;
}

function iconFromSnap(snap: string): SVGSVGElement {
    const svg = folderIcon();
    if (!snap || isChromeSnap(snap)) return svg;
    const kids: SVGElement[] = [];
    for (const raw of snap.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("c:")) {
            const [cx, cy, r] = line.slice(2).split(",");
            if (!cx || !cy || !r || Number(r) <= 1.5) continue;
            if (![cx, cy, r].every(v => /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(v))) continue;
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", cx);
            circle.setAttribute("cy", cy);
            circle.setAttribute("r", r);
            kids.push(circle);
            continue;
        }
        if (line.startsWith("l:")) {
            const [x1, y1, x2, y2] = line.slice(2).split(",");
            if (![x1, y1, x2, y2].every(v => v && /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(v))) continue;
            const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
            ln.setAttribute("x1", x1);
            ln.setAttribute("y1", y1);
            ln.setAttribute("x2", x2);
            ln.setAttribute("y2", y2);
            kids.push(ln);
            continue;
        }
        if (line.startsWith("y:")) {
            const pts = line.slice(2);
            if (!pts || !/^[\d.,\s+-]+$/.test(pts)) continue;
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            poly.setAttribute("points", pts);
            kids.push(poly);
            continue;
        }
        if (!PATH_OK.test(line) || line === SPIN_D || isDotPath(line)) continue;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", line);
        kids.push(path);
    }
    if (!kids.length) return svg;
    svg.replaceChildren(...kids);
    return svg;
}

function projectIconOf(ws: string): SVGSVGElement {
    const raw = ws ? (wsIcons[ws] || settings.plain.projectIcons?.[ws] || liveIconSnap(ws) || "") : "";
    const snap = raw && !isChromeSnap(raw) ? raw : "";
    if (snap) {
        wsIcons[ws] = snap;
        return iconFromSnap(snap);
    }
    return folderIcon();
}

function applyTheme(panel: HTMLElement) {
    const theme = detectTheme();
    panel.setAttribute("data-theme", theme);
    panel.style.colorScheme = theme;
}

function buildHost(): HTMLDivElement {
    const root = node("div", cl("root")) as HTMLDivElement;
    root.id = "void-rt-host";
    root.setAttribute("role", "presentation");
    root.addEventListener("click", cancel);
    root.addEventListener("pointermove", onHoverMove, { passive: true });

    const panel = node("div", cl("panel"));
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-label", "Recent conversations");
    panel.addEventListener("click", e => e.stopPropagation());
    panel.append(node("div", cl("list")));
    root.append(panel);
    return root;
}

function maybePaint() {
    if (open && !suspendPaint) paint();
}

function onHoverMove(e: PointerEvent) {
    if (!open || hoverArmed) return;
    if (!hoverOrigin) {
        hoverX = e.clientX;
        hoverY = e.clientY;
        hoverOrigin = true;
    }
    const dx = e.clientX - hoverX;
    const dy = e.clientY - hoverY;
    if (Math.abs(dx) < HOVER_ARM_PX && Math.abs(dy) < HOVER_ARM_PX) return;
    hoverArmed = true;
}

function selectCard(index: number) {
    if (!hoverArmed || selected === index) return;
    selected = index;
    syncActive();
}

function renderList(items: Topic[]) {
    if (!host) return;
    const panel = host.querySelector(`.${cl("panel")}`) as HTMLElement | null;
    if (!panel) return;

    let list = panel.querySelector(`.${cl("list")}`) as HTMLElement | null;
    if (!list) {
        panel.replaceChildren();
        list = node("div", cl("list"));
        panel.append(list);
    }
    list.replaceChildren();

    items.forEach((topic, i) => {
        const btn = node("button", cl("card")) as HTMLButtonElement;
        btn.type = "button";
        btn.tabIndex = -1;
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-label", topic.project ? `${topic.title}, ${topic.project}` : topic.title);
        btn.style.setProperty("--void-rt-card-accent", accentOf(topic.id));
        btn.addEventListener("pointerenter", () => selectCard(i));
        btn.addEventListener("focus", () => selectCard(i));
        btn.addEventListener("click", () => pick(i));

        const shot = node("span", cl("thumb"));
        shot.setAttribute("aria-hidden", "true");
        fillShot(shot, topic.id);

        const meta = node("span", cl("meta"));
        meta.append(node("span", cl("name"), topic.title));
        if (topic.project) {
            const proj = node("span", cl("host"));
            proj.append(projectIconOf(topic.ws), node("span", cl("host-name"), topic.project));
            meta.append(proj);
        }

        btn.append(shot, meta);
        list!.append(btn);
    });
}

function patchList(items: Topic[]) {
    if (!host) return;
    const cards = [...host.querySelectorAll<HTMLElement>(`.${cl("card")}`)];
    if (cards.length !== items.length) {
        renderList(items);
        return;
    }
    items.forEach((topic, i) => {
        const card = cards[i];
        card.setAttribute("aria-label", topic.project ? `${topic.title}, ${topic.project}` : topic.title);
        card.style.setProperty("--void-rt-card-accent", accentOf(topic.id));
        const name = card.querySelector(`.${cl("name")}`);
        if (name) name.textContent = topic.title;
        const meta = card.querySelector(`.${cl("meta")}`) as HTMLElement | null;
        if (!meta) return;
        let row = meta.querySelector(`.${cl("host")}`) as HTMLElement | null;
        if (!topic.project) {
            row?.remove();
            return;
        }
        if (!row) {
            row = node("span", cl("host"));
            row.append(projectIconOf(topic.ws), node("span", cl("host-name"), topic.project));
            meta.append(row);
            return;
        }
        const label = row.querySelector(`.${cl("host-name")}`);
        if (label) label.textContent = topic.project;
        const next = projectIconOf(topic.ws);
        const prev = row.querySelector("svg");
        if (prev) prev.replaceWith(next);
        else row.prepend(next);
    });
}

function syncActive() {
    if (!host) return;
    const cards = host.querySelectorAll<HTMLElement>(`.${cl("card")}`);
    cards.forEach((card, i) => {
        const on = i === selected;
        card.setAttribute("data-active", on ? "true" : "false");
        card.setAttribute("aria-selected", on ? "true" : "false");
        card.tabIndex = on ? 0 : -1;
        if (on) card.setAttribute("aria-current", "true");
        else card.removeAttribute("aria-current");
    });
    cards[selected]?.scrollIntoView({ inline: "nearest", block: "nearest" });
}

function paint() {
    document.documentElement.classList.toggle("void-rt-open", open);
    if (!open) {
        detachHost();
        return;
    }

    const items = topics();
    const keepId = items[selected]?.id ?? "";
    const ids = items.map(t => t.id).join("|") || "__empty__";
    const meta = items.map(t => `${t.title}\0${t.project}`).join("|");

    if (!host) {
        host = buildHost();
        mountOverlay(host);
    }

    const panel = host.querySelector(`.${cl("panel")}`) as HTMLElement | null;
    if (!panel) return;

    applyTheme(panel);
    panel.style.setProperty("--void-rt-count", String(Math.max(1, items.length)));

    if (!items.length) {
        if (paintedIds !== "__empty__") {
            panel.replaceChildren(node("div", cl("empty"), "Open a few chats, then hold Ctrl+` to switch."));
            paintedIds = "__empty__";
            paintedMeta = "";
        }
        requestAnimationFrame(() => panel.setAttribute("data-visible", "true"));
        return;
    }

    if (paintedIds === "__empty__" || !panel.querySelector(`.${cl("list")}`)) {
        panel.replaceChildren(node("div", cl("list")));
        paintedIds = "";
        paintedMeta = "";
    }

    if (paintedIds !== ids) {
        renderList(items);
        paintedIds = ids;
        paintedMeta = meta;
    } else if (paintedMeta !== meta) {
        patchList(items);
        paintedMeta = meta;
    }

    const idx = keepId ? items.findIndex(t => t.id === keepId) : -1;
    selected = idx >= 0 ? idx : Math.min(selected, items.length - 1);
    syncActive();
    requestAnimationFrame(() => panel.setAttribute("data-visible", "true"));
}

function detachHost() {
    document.documentElement.classList.remove("void-rt-open");
    paintedIds = "";
    paintedMeta = "";
    hoverArmed = false;
    hoverOrigin = false;
    if (host) {
        try { host.hidePopover(); } catch {}
        host.remove();
        host = null;
    }
    document.getElementById("void-rt-host")?.remove();
    document.querySelectorAll("dialog.void-rt-root, [popover].void-rt-root").forEach(el => {
        const p = el as HTMLElement & { hidePopover?: () => void; close?: () => void };
        try { p.hidePopover?.(); } catch {}
        try { p.close?.(); } catch {}
        el.remove();
    });
}

function mountOverlay(root: HTMLElement) {
    root.style.cssText = "position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:none;overflow:hidden;z-index:2147483647;display:block;background:transparent;pointer-events:auto;";
    document.documentElement.append(root);
    document.documentElement.classList.add("void-rt-open");
    if (typeof root.showPopover !== "function") return;
    root.setAttribute("popover", "manual");
    try {
        root.showPopover();
    } catch {
        root.removeAttribute("popover");
    }
}

export default definePlugin({
    name: "RecentTopics",
    icon: LayoutGridIcon,
    description: "Switch recently opened conversations with Ctrl+` like Arc's tab switcher.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    settings,
    managedStyle: "recentTopics",

    _mark({ response }: { response: GrokResponse }) {
        try {
            if (!response || response.isControl) return null;
            const sender = String(response.sender ?? "").toLowerCase();
            const human = sender === "human" || sender === "user";
            const text = human
                ? pickUserText(response.query || "", response.message || "")
                : plainText(response.message || "");
            if (!text) return null;
            return React.createElement("span", {
                className: "void-rt-mark",
                "data-role": human ? "user" : "assistant",
                hidden: true,
            }, text);
        } catch {
            return null;
        }
    },

    patches: [
        {
            find: "response-family:handleEditSave",
            all: true,
            replacement: {
                match: /\(0,\i\.jsx\)\(\i\.MessageBubble,\{isUser:\i,isIncognito:\i,responseId:(\i)\.responseId/,
                replace: "$self._mark({response:$1}),$&",
            },
        },
    ],

    start() {
        detachHost();
        open = false;
        held = false;
        ctrlHeld = false;
        try {
            initEffect();
            hydrate();
            const current = currentVisit();
            if (current != null) bump(current);
            scheduleCapture();
        } catch (e) {
            logger.error("Hydrate failed:", e);
        }
        if (!keys) {
            keys = new AbortController();
            const { signal } = keys;
            window.addEventListener("keydown", onKeyDown, { capture: true, signal });
            window.addEventListener("keyup", onKeyUp, { capture: true, signal });
            window.addEventListener("blur", onWindowBlur, { signal });
            document.addEventListener("visibilitychange", onVisibility, { signal });
            document.addEventListener("beforeinput", onBeforeInput, { capture: true, signal });
        }
    },

    stop() {
        if (bumpTimer) {
            window.clearTimeout(bumpTimer);
            bumpTimer = 0;
        }
        unbindEffectSync();
        keys?.abort();
        keys = null;
        open = false;
        held = false;
        ctrlHeld = false;
        thumbs.clear();
        detachHost();
    },

    onSettingsChange() {
        try {
            writeVisits(capVisits(readVisits()));
        } catch (e) {
            logger.error("Settings update failed:", e);
        }
    },

    zustand: {
        RoutingStore: {
            selector: (s: RoutingStoreState) => routeConvId(s.route),
            handler(id: string | null) {
                if (open) return;
                const current = currentVisit();
                if (current == null) return;
                if (id && isHomeId(current) && !isHomeId(id)) return;
                scheduleBump();
            },
        },
        ChatPageStore: {
            selector: (s: ChatPageStoreState) => `${s.conversationId ?? ""}|${s.projectId ?? ""}`,
            handler() {
                if (open) return;
                const id = currentVisit();
                if (id == null) return;
                scheduleBump();
            },
        },
        ResponseStore: {
            selector: (s: ResponseStoreState) => {
                const id = currentVisit();
                if (!id || isHomeId(id)) return "";
                const list = s.byConversationId[id];
                const last = list?.[list.length - 1];
                return last ? `${last.responseId}:${last.message?.length ?? 0}` : "";
            },
            handler() {
                if (open) return;
                const id = currentVisit();
                if (id && isDenied(id)) scheduleBump();
                scheduleCapture();
            },
        },
    },
});
