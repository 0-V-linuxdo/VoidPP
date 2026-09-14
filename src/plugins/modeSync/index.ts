/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { ListOrderedIcon } from "@components/icons";
import type { ModelMode } from "@grok-types/enums/models";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { ModesStoreState } from "@grok-types/stores/ModesStore";
import { ChatPageStore, ModesStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const logger = new Logger("ModeSync");

const SEND_MODES = new Set(["auto", "fast", "expert", "heavy"]);
const CHAT_POST = /\/rest\/app-chat\/conversations/;
const PICK_SEL = "[data-query-bar-mode-select], .void-cms-pin";
const MENU_SEL = "[role='menuitem'], [role='option'], [data-radix-collection-item]";
const STICKY_MS = 1000;
const RESTORE_AT = [0, 80, 200, 500, 900] as const;
const WRAP_KEYS = ["sendResponse", "establishNewConversation"] as const;

const settings = definePluginSettings({
    stickyOnNavigate: {
        type: OptionType.BOOLEAN,
        description: "Keep the selected mode when switching chats.",
        default: true,
    },
});

type SendFn = (...args: any[]) => any;

let applying = false;
let userPicking = false;
let intentId = "";
let navAt = 0;
let origFetch: typeof fetch | null = null;
let hookedWindow: typeof globalThis | null = null;
const origFns = new Map<string, SendFn>();
const wrappedFns = new Map<string, SendFn>();
const restoreTimers: ReturnType<typeof setTimeout>[] = [];
let abort: AbortController | null = null;

function pageWindow(): typeof globalThis {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
}

function pickerId(): string {
    try {
        return String(ModesStore.useModesStore.getState().selectedModeId || "");
    } catch {
        return "";
    }
}

function liveId(): string {
    return intentId || pickerId();
}

function applyToStores(id: string) {
    if (!id || applying) return;
    applying = true;
    try {
        const modes = ModesStore.useModesStore.getState();
        if (modes.selectedModeId !== id) modes.setSelectedModeId(id);
        if (!SEND_MODES.has(id)) return;
        const chat = ChatPageStore.useChatPageStore.getState();
        if (chat.modelMode !== id) chat.setModelMode(id as ModelMode);
    } catch (e) {
        logger.debug("apply failed", e);
    } finally {
        applying = false;
    }
}

function clearRestore() {
    for (const t of restoreTimers) clearTimeout(t);
    restoreTimers.length = 0;
}

function rememberIntent(id: string) {
    if (!id) return;
    intentId = id;
    userPicking = false;
    clearRestore();
    navAt = 0;
}

function onPicker(id: string) {
    if (applying) return;
    const recentNav = performance.now() - navAt < STICKY_MS;
    if (userPicking || !recentNav) rememberIntent(id);
    if (userPicking || !recentNav) applyToStores(id);
}

function onNavigate() {
    const snap = liveId();
    if (snap) intentId = snap;
    wrapSendFns();
    if (!settings.store.stickyOnNavigate || !snap) return;
    navAt = performance.now();
    clearRestore();
    for (const delay of RESTORE_AT) {
        restoreTimers.push(setTimeout(() => applyToStores(snap), delay));
    }
}

function apiModelMode(id: string, existing: unknown): unknown {
    if (!SEND_MODES.has(id)) return existing;
    try {
        const conv = ChatPageStore.modelModeToModelConfigModelMode;
        if (typeof conv === "function") {
            const mapped = conv(id as ModelMode);
            if (mapped) return mapped;
        }
    } catch (e) {
        logger.debug("mode map failed", e);
    }
    if (typeof existing === "string" && existing.startsWith("MODEL_MODE_")) {
        return `MODEL_MODE_${id.toUpperCase()}`;
    }
    return id;
}

function patchPayload(raw: unknown, id: string): boolean {
    if (!raw || typeof raw !== "object") return false;
    const rec = raw as Record<string, unknown>;
    rec.modeId = id;
    if (SEND_MODES.has(id)) rec.modelMode = apiModelMode(id, rec.modelMode);
    return true;
}

function patchSendArgs(args: unknown[], id: string) {
    const first = args[0];
    if (!first || typeof first !== "object") return;
    patchPayload(first, id);
}

function rewriteJsonBody(text: string, id: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (rec.isAsyncChat !== true && rec.skipCancelCurrentInflightRequests !== true) return null;
    if (!patchPayload(rec, id)) return null;
    try {
        return JSON.stringify(parsed);
    } catch {
        return null;
    }
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

function wrapSendFns() {
    let state: ChatPageStoreState;
    try {
        state = ChatPageStore.useChatPageStore.getState();
    } catch {
        return;
    }
    const next: Record<string, SendFn> = {};
    for (const key of WRAP_KEYS) {
        const current = state[key] as SendFn | undefined;
        if (typeof current !== "function") continue;
        if (wrappedFns.get(key) === current) continue;
        origFns.set(key, current);
        const orig = current;
        const wrapped: SendFn = function voidModeSyncSend(this: unknown, ...args: unknown[]) {
            const id = liveId();
            if (id) {
                applyToStores(id);
                patchSendArgs(args, id);
            }
            return orig.apply(this, args);
        };
        wrappedFns.set(key, wrapped);
        next[key] = wrapped;
    }
    if (Object.keys(next).length) ChatPageStore.useChatPageStore.setState(next as Partial<ChatPageStoreState>);
}

function unwrapSendFns() {
    if (!origFns.size) return;
    try {
        const state = ChatPageStore.useChatPageStore.getState();
        const next: Partial<ChatPageStoreState> = {};
        for (const [key, orig] of origFns) {
            if (state[key as keyof ChatPageStoreState] === wrappedFns.get(key)) {
                (next as Record<string, SendFn>)[key] = orig;
            }
        }
        if (Object.keys(next).length) ChatPageStore.useChatPageStore.setState(next);
    } catch (e) {
        logger.debug("unwrap send failed", e);
    }
    origFns.clear();
    wrappedFns.clear();
}

function hookFetch() {
    if (origFetch) return;
    const w = pageWindow();
    origFetch = w.fetch;
    hookedWindow = w;
    w.fetch = function voidModeSyncFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = requestUrl(input);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (method === "POST" && CHAT_POST.test(url)) {
            const id = liveId();
            const raw = init?.body;
            if (id && typeof raw === "string") {
                const next = rewriteJsonBody(raw, id);
                if (next && next !== raw) {
                    applyToStores(id);
                    return origFetch!.call(w, input, { ...init, body: next });
                }
            }
        }
        return origFetch!.call(w, input, init);
    } as typeof fetch;
}

function unhookFetch() {
    if (!origFetch || !hookedWindow) return;
    hookedWindow.fetch = origFetch;
    origFetch = null;
    hookedWindow = null;
}

function onPointerDown(e: Event) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest(PICK_SEL)) {
        userPicking = true;
        return;
    }
    if (userPicking && t.closest(MENU_SEL)) return;
    userPicking = false;
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Tab" && e.shiftKey) userPicking = true;
}

function onStreamEnd() {
    wrapSendFns();
    const id = liveId();
    if (id) applyToStores(id);
}

export default definePlugin({
    name: "ModeSync",
    icon: ListOrderedIcon,
    description: "Send queued messages with the current model and keep the picker when switching chats.",
    authors: [Devs.p],
    tags: ["chat"],
    enabledByDefault: true,
    settings,
    startAt: StartAt.TurbopackReady,

    start() {
        intentId = pickerId();
        abort = new AbortController();
        const { signal } = abort;
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal });
        document.addEventListener("keydown", onKeyDown, { capture: true, signal });
        try {
            wrapSendFns();
            hookFetch();
        } catch (e) {
            logger.warn("Failed to hook send path", e);
        }
    },

    stop() {
        abort?.abort();
        abort = null;
        clearRestore();
        unhookFetch();
        unwrapSendFns();
        applying = false;
        userPicking = false;
        navAt = 0;
    },

    events: {
        streamEnd: onStreamEnd,
    },

    zustand: {
        ModesStore: {
            selector: (s: ModesStoreState) => s.selectedModeId,
            handler: onPicker,
        },
        ChatPageStore: {
            selector: (s: ChatPageStoreState) => s.conversationId ?? "",
            handler: (id, prev) => {
                if (id === prev) return;
                onNavigate();
            },
        },
    },
});
