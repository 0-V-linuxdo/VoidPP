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
export const SessionStore: SessionStoreModule = findByPropsLazy("useSession", "SessionStoreProvider");
export const SettingsDialogStore: SettingsDialogStoreModule = findByPropsLazy("useSettingsDialogStore");
export const SettingsStore: SettingsStoreModule = findByPropsLazy("useSettingsStore", "modelConfigOverrideSchema");
export const SubscriptionsStore: SubscriptionsStoreModule = findByPropsLazy("useSubscriptionsStore");
export const TextToSpeechStore: TextToSpeechStoreModule = findByPropsLazy("useTextToSpeechStore");
export const MessageStore: MessageStoreModule = proxyLazy(() => {
    const hook = hookFromFactory("useMessageStore", isMessageHook);
    return hook ? { useMessageStore: hook } : null;
}, Infinity);
