/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { PlainSettings, SettingsStore } from "@api/Settings";
import { ListOrderedIcon } from "@components/icons";
import type { ChatPageStoreState } from "@grok-types/stores/ChatPageStore";
import type { MessageStoreState } from "@grok-types/stores/MessageStore";
import type { ModesStoreState } from "@grok-types/stores/ModesStore";
import type { ResponseStoreState } from "@grok-types/stores/ResponseStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

import {
    modeChatKey,
    modeHydrateKey,
    modePickerKey,
    modeQueueKey,
    modeRouteKey,
    onModeChatPage,
    onModeHydrate,
    onModePicker,
    onModeQueue,
    onModeRoute,
    onModeSettingsChange,
    onModeStreamEnd,
    startMode,
    stopMode,
} from "./mode";
import {
    onPersistNav,
    onPersistQueue,
    persistChatKey,
    persistQueueKey,
    persistResponseKey,
    persistRouteKey,
    startPersist,
    stopPersist,
} from "./persist";
import { settings } from "./settings";

const logger = new Logger("BetterQueue");

function dropName(list: unknown): string[] | undefined {
    if (!Array.isArray(list)) return undefined;
    const next = list.filter((n): n is string => typeof n === "string" && n !== "ModeSync" && n !== "QueuePersist");
    return next.length === list.length ? undefined : next;
}

function migrateLegacy() {
    const plugins = PlainSettings.plugins;
    const mode = plugins.ModeSync;
    const persist = plugins.QueuePersist;
    if (!mode && !persist) return;

    const target = plugins.BetterQueue ??= {};
    if (mode?.enabled === false) {
        if (!("showQueueMode" in target)) target.showQueueMode = false;
        if (!("stickyOnNavigate" in target)) target.stickyOnNavigate = false;
    }
    if (persist?.enabled === false && !("persistAcrossRefresh" in target)) target.persistAcrossRefresh = false;
    if (mode?.enabled === false && persist?.enabled === false && typeof target.enabled !== "boolean") target.enabled = false;

    delete plugins.ModeSync;
    delete plugins.QueuePersist;

    const meta = plugins.Settings;
    if (meta) {
        const pinned = dropName(meta.pinnedPlugins);
        const starred = dropName(meta.starredPlugins);
        if (pinned) meta.pinnedPlugins = pinned;
        if (starred) meta.starredPlugins = starred;
        const known = meta.knownPlugins;
        if (known && typeof known === "object") {
            delete (known as Record<string, unknown>).ModeSync;
            delete (known as Record<string, unknown>).QueuePersist;
        }
    }

    SettingsStore.markAsChanged();
    logger.info("Migrated ModeSync / QueuePersist into BetterQueue");
}

const pluginName = Object.getOwnPropertyDescriptor(settings, "pluginName");
if (pluginName?.set && pluginName.get) {
    Object.defineProperty(settings, "pluginName", {
        configurable: true,
        enumerable: true,
        get: pluginName.get,
        set(name: string) {
            if (name === "BetterQueue") migrateLegacy();
            pluginName.set!.call(settings, name);
        },
    });
}

function applyPersist() {
    if (settings.store.persistAcrossRefresh) startPersist();
    else stopPersist();
}

export default definePlugin({
    name: "BetterQueue",
    icon: ListOrderedIcon,
    description: "Keep each queued message's mode, and restore unsent rows after a refresh.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.TurbopackReady,
    settings,
    managedStyle: "betterQueue",
    cleanupSelectors: [".void-ms-qchip", ".void-ms-qmenu"],

    start() {
        startMode();
        applyPersist();
    },

    onSettingsChange() {
        applyPersist();
        onModeSettingsChange();
    },

    stop() {
        stopPersist();
        stopMode();
    },

    events: {
        streamEnd: onModeStreamEnd,
    },

    zustand: {
        ModesStore: {
            selector: (s: ModesStoreState) => modePickerKey(s),
            handler: onModePicker,
        },
        ChatPageStore: {
            selector: (s: ChatPageStoreState) => `${modeChatKey(s)}|${persistChatKey(s)}`,
            handler: () => {
                onModeChatPage();
                onPersistNav();
            },
        },
        MessageStore: {
            selector: (s: MessageStoreState) => `${modeQueueKey(s)}|${persistQueueKey(s)}`,
            handler: () => {
                onModeQueue();
                onPersistQueue();
            },
        },
        RoutingStore: {
            selector: (s: RoutingStoreState) => `${modeRouteKey(s)}|${persistRouteKey(s)}`,
            handler: () => {
                onModeRoute();
                onPersistNav();
            },
        },
        ResponseStore: {
            selector: (s: ResponseStoreState) => `${modeHydrateKey(s)}|${persistResponseKey(s)}`,
            handler: () => {
                onModeHydrate();
                onPersistNav();
            },
        },
    },
});
