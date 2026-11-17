/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type {
    ChatPageStoreModule,
    ConversationStoreModule,
    FeatureStoreModule,
    FilesPageStoreModule,
    MediaStoreModule,
    MessageStoreModule,
    ModesStoreModule,
    ResponseStoreModule,
    RoutingStoreModule,
    SessionStoreModule,
    SettingsDialogStoreModule,
    SettingsStoreModule,
    SubscriptionsStoreModule,
    TextToSpeechStoreModule,
} from "@grok-types/stores";
import { proxyLazy } from "@utils/lazy";

import { getFnSource } from "../fnSource";
import { getRuntimeModuleCache } from "../patchTurbopack";
import { find, findByProps, findByPropsLazy, findStore, isZustandStore, requireModule, search } from "../turbopack";

const hookHit = new Map<string, unknown>();
const didLegacy = new Set<string>();
const inspected = new Set<string>();

function moduleValues(id: string | number): unknown[] {
    const num = Number(id);
    const required = requireModule<Record<string, unknown>>(num);
    const runtime = getRuntimeModuleCache()?.[num];
    const bags = [required, runtime?.namespaceObject, runtime?.exports];
    const out: unknown[] = [];
    const seen = new Set<unknown>();
    for (const bag of bags) {
        if (!bag || typeof bag !== "object") continue;
        for (const value of Object.values(bag as Record<string, unknown>)) {
            if (seen.has(value)) continue;
            seen.add(value);
            out.push(value);
        }
    }
    return out;
}

function takeFromSearch<T>(label: string, accept: (value: unknown) => value is T): T | null {
    for (const id of Object.keys(search(label))) {
        const key = `${label}\0${id}`;
        const values = moduleValues(id);
        if (!values.length) continue;
        for (const value of values) {
            if (accept(value)) {
                inspected.add(key);
                return value;
            }
        }
        inspected.add(key);
    }
    return null;
}

export const ChatPageStore: ChatPageStoreModule = findByPropsLazy("useChatPageStore");
export const ConversationStore: ConversationStoreModule = findByPropsLazy("useConversationStore", "createOptimisticConversation");
export const FeatureStore: FeatureStoreModule = findByPropsLazy("useFeatureStore");
export const FilesPageStore: FilesPageStoreModule = findByPropsLazy("useFilesPageStore", "useAssetsList");
export const MediaStore: MediaStoreModule = findByPropsLazy("useMediaStore", "useImagineModeStore");

function hookFromFactory<T>(label: string, accept: (value: unknown) => value is T): T | null {
    const cached = hookHit.get(label);
    if (cached) return cached as T;
    if (!didLegacy.has(label)) {
        didLegacy.add(label);
        const legacy = find((mod: Record<string, unknown>) => accept(mod?.[label])) as Record<string, T> | null;
        if (legacy && accept(legacy[label])) {
            hookHit.set(label, legacy[label]);
            return legacy[label];
        }
    }
    const hit = takeFromSearch(label, accept);
    if (hit) hookHit.set(label, hit);
    return hit;
}

function isModesHook(value: unknown): value is ModesStoreModule["useModesStore"] {
    if (!isZustandStore(value)) return false;
    try {
        const state = value.getState() as { selectedModeId?: unknown; setSelectedModeId?: unknown; ensureLoaded?: unknown };
        return !!state
            && typeof state === "object"
            && "selectedModeId" in state
            && typeof state.setSelectedModeId === "function"
            && typeof state.ensureLoaded === "function";
    } catch {
        return false;
    }
}

function isRoutingHook(value: unknown): value is RoutingStoreModule["useRoutingStore"] {
    if (!isZustandStore(value)) return false;
    try {
        const state = value.getState() as { route?: { page?: unknown }; push?: unknown };
        return !!state?.route && typeof state.route === "object" && "page" in state.route && typeof state.push === "function";
    } catch {
        return false;
    }
}

function isMessageHook(value: unknown): value is MessageStoreModule["useMessageStore"] {
    if (!isZustandStore(value)) return false;
    try {
        const state = value.getState() as { conversations?: unknown };
        return !!state && typeof state.conversations === "object" && state.conversations !== null;
    } catch {
        return false;
    }
}

function namedOrStore<T>(label: string, storeName: string, accept: (value: unknown) => value is T): T | null {
    const hook = hookFromFactory(label, accept);
    if (hook) return hook;
    const store = findStore(storeName);
    return accept(store) ? store : null;
}

export const ModesStore: ModesStoreModule = proxyLazy(() => {
    const hook = namedOrStore("useModesStore", "Modes", isModesHook);
    return hook ? { useModesStore: hook } : null;
});
export const ResponseStore: ResponseStoreModule = findByPropsLazy("useResponseStore", "createOptimisticResponse");
export const RoutingStore: RoutingStoreModule = proxyLazy(() => {
    const hook = namedOrStore("useRoutingStore", "Routing", isRoutingHook);
    return hook ? { useRoutingStore: hook } : null;
});

const SESSION_MARKER = "useSession must be used within SessionStoreProvider";

function isSessionHook(value: unknown): value is SessionStoreModule["useSession"] {
    if (typeof value !== "function") return false;
    try {
        return getFnSource(value).includes(SESSION_MARKER);
    } catch {
        return false;
    }
}

function readSessionModule(mod: Record<string, unknown> | null | undefined): SessionStoreModule | null {
    if (!mod || typeof mod !== "object") return null;
    if (typeof mod.useSession === "function" && typeof mod.SessionStoreProvider === "function") return mod as unknown as SessionStoreModule;
    for (const value of Object.values(mod)) {
        if (isSessionHook(value)) return { useSession: value } as SessionStoreModule;
    }
    return null;
}

/** Named exports exist, but this module is not in the finder cache. `requireModule` of the factory still returns them. */
let sessionHit: SessionStoreModule | null = null;
let sessionLegacy = false;

function sessionModule(): SessionStoreModule | null {
    if (sessionHit) return sessionHit;
    if (!sessionLegacy) {
        sessionLegacy = true;
        const legacy = find((mod: Record<string, unknown>) => typeof mod?.useSession === "function" && typeof mod?.SessionStoreProvider === "function") as SessionStoreModule | null;
        if (legacy?.useSession) return (sessionHit = legacy);
    }
    for (const id of Object.keys(search(SESSION_MARKER))) {
        const key = `session\0${id}`;
        if (inspected.has(key)) continue;
        inspected.add(key);
        const num = Number(id);
        const required = requireModule<Record<string, unknown>>(num);
        const runtime = getRuntimeModuleCache()?.[num];
        const hit = readSessionModule(required)
            ?? readSessionModule(runtime?.namespaceObject)
            ?? (runtime?.exports !== required ? readSessionModule(runtime?.exports) : null);
        if (hit) return (sessionHit = hit);
    }
    return null;
}

export const SessionStore: SessionStoreModule = proxyLazy(() => sessionModule());
function isSettingsDialogHook(value: unknown): value is SettingsDialogStoreModule["useSettingsDialogStore"] {
    if (typeof value !== "function" || typeof (value as { getState?: unknown }).getState !== "function") return false;
    try {
        const state = (value as { getState: () => { setOpen?: unknown; setTab?: unknown; open?: unknown } }).getState();
        return !!state && typeof state.setOpen === "function" && typeof state.setTab === "function" && "open" in state;
    } catch {
        return false;
    }
}

/** Named export is gone. The hook is a short key on the factory that still contains `useSettingsDialogStore`. */
export const SettingsDialogStore: SettingsDialogStoreModule = proxyLazy(() => {
    const hook = hookFromFactory("useSettingsDialogStore", isSettingsDialogHook);
    return hook ? { useSettingsDialogStore: hook } : null;
});

interface PluginsDialogHook {
    getState(): { open: boolean; setOpen(open: boolean): void };
}

function isPluginsDialogHook(value: unknown): value is PluginsDialogHook {
    if (typeof value !== "function" || typeof (value as { getState?: unknown }).getState !== "function") return false;
    try {
        const state = (value as PluginsDialogHook).getState();
        return !!state && typeof state.setOpen === "function" && "open" in state && !("setTab" in state);
    } catch {
        return false;
    }
}

/** Named export is gone. The hook is a short key on the factory that still contains `usePluginsDialogStore`. */
export const PluginsDialogStore: { usePluginsDialogStore: PluginsDialogHook } = proxyLazy(() => {
    const hook = hookFromFactory("usePluginsDialogStore", isPluginsDialogHook);
    return hook ? { usePluginsDialogStore: hook } : null;
});
function isSettingsHook(value: unknown): value is SettingsStoreModule["useSettingsStore"] {
    if (!isZustandStore(value)) return false;
    try {
        const state = value.getState() as { isIncognito?: unknown };
        return !!state && typeof state === "object" && "isIncognito" in state;
    } catch {
        return false;
    }
}

export const SettingsStore: SettingsStoreModule = proxyLazy(() => {
    const named = findByProps("useSettingsStore") as SettingsStoreModule | null;
    if (named && isSettingsHook(named.useSettingsStore)) return named;
    const hook = namedOrStore("useSettingsStore", "Settings", isSettingsHook);
    return hook ? { useSettingsStore: hook } as SettingsStoreModule : null;
});
export const SubscriptionsStore: SubscriptionsStoreModule = findByPropsLazy("useSubscriptionsStore");
export const TextToSpeechStore: TextToSpeechStoreModule = findByPropsLazy("useTextToSpeechStore");
export const MessageStore: MessageStoreModule = proxyLazy(() => {
    const hook = namedOrStore("useMessageStore", "Message", isMessageHook);
    return hook ? { useMessageStore: hook } : null;
});
