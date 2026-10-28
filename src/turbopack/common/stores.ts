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
export const MessageStore: MessageStoreModule = findByPropsLazy("useMessageStore", "nodeToResponse");
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

function modesHook(): ModesStoreModule["useModesStore"] | null {
    const legacy = find((mod: { useModesStore?: unknown }) => isModesHook(mod?.useModesStore)) as { useModesStore?: ModesStoreModule["useModesStore"] } | null;
    if (legacy?.useModesStore) return legacy.useModesStore;

    // The factory still contains the zustand label. The export key is a short letter (`U`).
    for (const id of Object.keys(search("useModesStore"))) {
        const mod = requireModule<Record<string, unknown>>(Number(id));
        if (!mod || typeof mod !== "object") continue;
        for (const value of Object.values(mod)) {
            if (isModesHook(value)) return value;
        }
    }

    return find(isModesHook) ?? null;
}

// The live bundle exports the store as a short key (`U`), not `useModesStore`.
// The name survives only as the zustand label inside the factory.
export const ModesStore: ModesStoreModule = proxyLazy(() => {
    const hook = modesHook();
    return hook ? { useModesStore: hook } : null;
}, Infinity);
export const ResponseStore: ResponseStoreModule = findByPropsLazy("useResponseStore", "createOptimisticResponse");
export const RoutingStore: RoutingStoreModule = findByPropsLazy("useRoutingStore", "formatUrl");
export const SessionStore: SessionStoreModule = findByPropsLazy("useSession", "SessionStoreProvider");
export const SettingsDialogStore: SettingsDialogStoreModule = findByPropsLazy("useSettingsDialogStore");
export const SettingsStore: SettingsStoreModule = findByPropsLazy("useSettingsStore", "modelConfigOverrideSchema");
export const SubscriptionsStore: SubscriptionsStoreModule = findByPropsLazy("useSubscriptionsStore");
export const TextToSpeechStore: TextToSpeechStoreModule = findByPropsLazy("useTextToSpeechStore");
