/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { TextQuoteIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";

import { startJump, stopJump } from "./jump";
import { chatSel, hydrateSel, onChat, onNav, routeSel, startSticky, stopSticky } from "./sticky";

const logger = new Logger("BetterQuotes");

const settings = definePluginSettings({
    jumpToPassage: {
        type: OptionType.BOOLEAN,
        description: "Click the composer quote chip or a sent quote card to scroll to the exact passage.",
        default: true,
    },
    persistAcrossChats: {
        type: OptionType.BOOLEAN,
        description: "Keep the composer quote card when switching chats and coming back.",
        default: true,
    },
});

function dropName(list: unknown): string[] | undefined {
    if (!Array.isArray(list)) return undefined;
    const next = list.filter((n): n is string => typeof n === "string" && n !== "QuoteJump" && n !== "QuoteSticky");
    return next.length === list.length ? undefined : next;
}

function migrateLegacy() {
    const plugins = PlainSettings.plugins;
    const jump = plugins.QuoteJump;
    const sticky = plugins.QuoteSticky;
    if (!jump && !sticky) return;

    const target = plugins.BetterQuotes ??= {};
    if (jump?.enabled === false && !("jumpToPassage" in target)) target.jumpToPassage = false;
    if (sticky?.enabled === false && !("persistAcrossChats" in target)) target.persistAcrossChats = false;
    if (jump?.enabled === false && sticky?.enabled === false && typeof target.enabled !== "boolean") target.enabled = false;

    delete plugins.QuoteJump;
    delete plugins.QuoteSticky;

    const meta = plugins.Settings;
    if (meta) {
        const pinned = dropName(meta.pinnedPlugins);
        const starred = dropName(meta.starredPlugins);
        if (pinned) meta.pinnedPlugins = pinned;
        if (starred) meta.starredPlugins = starred;
        const known = meta.knownPlugins;
        if (known && typeof known === "object") {
            delete (known as Record<string, unknown>).QuoteJump;
            delete (known as Record<string, unknown>).QuoteSticky;
        }
    }

    SettingsStore.markAsChanged();
    logger.info("Migrated QuoteJump / QuoteSticky into BetterQuotes");
}

const pluginName = Object.getOwnPropertyDescriptor(settings, "pluginName");
if (pluginName?.set && pluginName.get) {
    Object.defineProperty(settings, "pluginName", {
        configurable: true,
        enumerable: true,
        get: pluginName.get,
        set(name: string) {
            if (name === "BetterQuotes") migrateLegacy();
            pluginName.set!.call(settings, name);
        },
    });
}

function apply() {
    if (settings.store.jumpToPassage) startJump();
    else stopJump();
    if (settings.store.persistAcrossChats) startSticky();
    else stopSticky();
}

export default definePlugin({
    name: "BetterQuotes",
    icon: TextQuoteIcon,
    description: "Scroll a composer quote chip to the exact passage, and keep that quote card when switching chats.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    startAt: StartAt.TurbopackReady,
    settings,
    managedStyle: "betterQuotes",
    cleanupSelectors: [".void-qs-chip"],

    start: apply,
    onSettingsChange: apply,
    stop() {
        stopJump();
        stopSticky();
    },

    zustand: {
        ChatPageStore: {
            selector: chatSel,
            handler: onChat,
        },
        RoutingStore: {
            selector: routeSel,
            handler: onNav,
        },
        ResponseStore: {
            selector: hydrateSel,
            handler: onNav,
        },
    },
});
