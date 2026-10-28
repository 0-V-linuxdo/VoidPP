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

import { find, findByPropsLazy, isZustandStore } from "../turbopack";

export const ChatPageStore: ChatPageStoreModule = findByPropsLazy("useChatPageStore");
export const ConversationStore: ConversationStoreModule = findByPropsLazy("useConversationStore", "createOptimisticConversation");
export const FeatureStore: FeatureStoreModule = findByPropsLazy("useFeatureStore");
export const FilesPageStore: FilesPageStoreModule = findByPropsLazy("useFilesPageStore", "useAssetsList");
export const MediaStore: MediaStoreModule = findByPropsLazy("useMediaStore", "useImagineModeStore");
export const MessageStore: MessageStoreModule = findByPropsLazy("useMessageStore", "nodeToResponse");
function modesHook(): ModesStoreModule["useModesStore"] | null {
    const legacy = find((mod: { useModesStore?: unknown }) => typeof mod?.useModesStore === "function" && typeof (mod.useModesStore as { getState?: unknown }).getState === "function") as { useModesStore?: ModesStoreModule["useModesStore"] } | null;
    if (legacy?.useModesStore) return legacy.useModesStore;
    return find((value: unknown) => {
        if (!isZustandStore(value)) return false;
        try {
            const state = value.getState() as { selectedModeId?: unknown; modes?: unknown; ensureLoaded?: unknown; setSelectedModeId?: unknown };
            return !!state
                && typeof state === "object"
                && "selectedModeId" in state
                && Array.isArray(state.modes)
                && typeof state.ensureLoaded === "function"
                && typeof state.setSelectedModeId === "function";
        } catch {
            return false;
        }
    });
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
