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
import { find, findByPropsLazy, isZustandStore, requireModule, search } from "../turbopack";

export const ChatPageStore: ChatPageStoreModule = findByPropsLazy("useChatPageStore");
export const ConversationStore: ConversationStoreModule = findByPropsLazy("useConversationStore", "createOptimisticConversation");
export const FeatureStore: FeatureStoreModule = findByPropsLazy("useFeatureStore");
export const FilesPageStore: FilesPageStoreModule = findByPropsLazy("useFilesPageStore", "useAssetsList");
export const MediaStore: MediaStoreModule = findByPropsLazy("useMediaStore", "useImagineModeStore");

function hookFromFactory<T>(label: string, accept: (value: unknown) => value is T): T | null {
    const legacy = find((mod: Record<string, unknown>) => accept(mod?.[label])) as Record<string, T> | null;
    if (legacy && accept(legacy[label])) return legacy[label];

    for (const id of Object.keys(search(label))) {
        const mod = requireModule<Record<string, unknown>>(Number(id));
        if (!mod || typeof mod !== "object") continue;
        for (const value of Object.values(mod)) {
            if (accept(value)) return value;
        }
    }
    return find(accept) ?? null;
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

// The live bundle exports these hooks as short keys. The zustand name survives only inside the factory.
export const ModesStore: ModesStoreModule = proxyLazy(() => {
    const hook = hookFromFactory("useModesStore", isModesHook);
    return hook ? { useModesStore: hook } : null;
}, Infinity);
export const ResponseStore: ResponseStoreModule = findByPropsLazy("useResponseStore", "createOptimisticResponse");
export const RoutingStore: RoutingStoreModule = proxyLazy(() => {
    const hook = hookFromFactory("useRoutingStore", isRoutingHook);
    return hook ? { useRoutingStore: hook } : null;
}, Infinity);

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
function sessionModule(): SessionStoreModule | null {
    const legacy = find((mod: Record<string, unknown>) => typeof mod?.useSession === "function" && typeof mod?.SessionStoreProvider === "function") as SessionStoreModule | null;
    if (legacy?.useSession) return legacy;

    for (const id of Object.keys(search(SESSION_MARKER))) {
        const num = Number(id);
        const required = requireModule<Record<string, unknown>>(num);
        const runtime = getRuntimeModuleCache()?.[num];
        const hit = readSessionModule(required)
            ?? readSessionModule(runtime?.namespaceObject)
            ?? (runtime?.exports !== required ? readSessionModule(runtime?.exports) : null);
        if (hit) return hit;
    }
    return null;
}

export const SessionStore: SessionStoreModule = proxyLazy(() => sessionModule(), Infinity);
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
function settingsDialogHook(): SettingsDialogStoreModule["useSettingsDialogStore"] | null {
    const legacy = find((mod: Record<string, unknown>) => isSettingsDialogHook(mod?.useSettingsDialogStore)) as Record<string, SettingsDialogStoreModule["useSettingsDialogStore"]> | null;
    if (legacy && isSettingsDialogHook(legacy.useSettingsDialogStore)) return legacy.useSettingsDialogStore;

    for (const id of Object.keys(search("useSettingsDialogStore"))) {
        const mod = requireModule<Record<string, unknown>>(Number(id));
        if (!mod || typeof mod !== "object") continue;
        for (const value of Object.values(mod)) {
            if (isSettingsDialogHook(value)) return value;
        }
    }
    return null;
}

export const SettingsDialogStore: SettingsDialogStoreModule = proxyLazy(() => {
    const hook = settingsDialogHook();
    return hook ? { useSettingsDialogStore: hook } : null;
}, Infinity);

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
function pluginsDialogHook(): PluginsDialogHook | null {
    for (const id of Object.keys(search("usePluginsDialogStore"))) {
        const mod = requireModule<Record<string, unknown>>(Number(id));
        if (!mod || typeof mod !== "object") continue;
        for (const value of Object.values(mod)) {
            if (isPluginsDialogHook(value)) return value;
        }
    }
    const legacy = find((mod: Record<string, unknown>) => isPluginsDialogHook(mod?.usePluginsDialogStore)) as { usePluginsDialogStore?: PluginsDialogHook } | null;
    return legacy && isPluginsDialogHook(legacy.usePluginsDialogStore) ? legacy.usePluginsDialogStore : null;
}

export const PluginsDialogStore: { usePluginsDialogStore: PluginsDialogHook } = proxyLazy(() => {
    const hook = pluginsDialogHook();
    return hook ? { usePluginsDialogStore: hook } : null;
}, Infinity);
export const SettingsStore: SettingsStoreModule = findByPropsLazy("useSettingsStore", "modelConfigOverrideSchema");
export const SubscriptionsStore: SubscriptionsStoreModule = findByPropsLazy("useSubscriptionsStore");
export const TextToSpeechStore: TextToSpeechStoreModule = findByPropsLazy("useTextToSpeechStore");
export const MessageStore: MessageStoreModule = proxyLazy(() => {
    const hook = hookFromFactory("useMessageStore", isMessageHook);
    return hook ? { useMessageStore: hook } : null;
}, Infinity);
