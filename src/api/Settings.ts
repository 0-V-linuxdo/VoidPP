/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect } from "@turbopack/common/react";
import { LEGACY_WRITE_STOPPED } from "@utils/constants";
import { idbDelete, idbGet } from "@utils/idb";
import { Logger } from "@utils/Logger";
import { mergeDefaults } from "@utils/misc";
import { useForceUpdater } from "@utils/react";
import { LEGACY_STORAGE_KEY, parseStoredSettings, settingsBagHasPlugins, SettingsStore as SettingsStoreClass, STORAGE_KEY } from "@utils/SettingsStore";
import { type DefinedSettings, OptionType, type PluginSettingDef, type PluginSettingValue, type SettingsChecks, type SettingsDefinition } from "@utils/types";

const logger = new Logger("Settings");

export interface Settings {
    plugins: {
        [plugin: string]: {
            enabled?: boolean;
            [setting: string]: unknown;
        };
    };
}

const DefaultSettings: Settings = { plugins: {} };

const settings = {} as Settings;
mergeDefaults(settings, DefaultSettings);

export const SettingsStore = new SettingsStoreClass(settings);

export const PlainSettings = settings;
export const Settings = SettingsStore.store;

export const pluginPath = (name: string, key?: string) => key ? `plugins.${name}.${key}` : `plugins.${name}`;

async function readGmValue(key: string): Promise<unknown> {
    if (typeof GM_getValue !== "function") return null;
    try {
        const value = GM_getValue(key, null) as unknown;
        if (value != null && typeof (value as { then?: unknown }).then === "function") {
            return await (value as Promise<unknown>);
        }
        return value;
    } catch (e) {
        logger.warn("Failed to read GM storage:", e);
        return null;
    }
}

async function readKey(key: string): Promise<Record<string, unknown> | null> {
    const gm = parseStoredSettings(await readGmValue(key));
    if (settingsBagHasPlugins(gm)) return gm;

    try {
        const idb = parseStoredSettings(await idbGet(key) ?? null);
        if (settingsBagHasPlugins(idb)) return idb;
    } catch (e) {
        logger.warn("Failed to read IndexedDB:", e);
    }

    try {
        const ls = parseStoredSettings(localStorage.getItem(key));
        if (settingsBagHasPlugins(ls)) return ls;
    } catch (e) {
        logger.warn("Failed to read localStorage:", e);
    }

    return null;
}

async function dropLegacySettings() {
    if (typeof GM_deleteValue === "function") {
        try { GM_deleteValue(LEGACY_STORAGE_KEY); } catch {}
    }
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch {}
    try { await idbDelete(LEGACY_STORAGE_KEY); } catch (e) {
        logger.warn("Failed to drop legacy settings:", e);
    }
}

async function readStoredSettings(): Promise<{ parsed: Record<string, unknown>; fromLegacy: boolean } | null> {
    const next = await readKey(STORAGE_KEY);
    if (next) return { parsed: next, fromLegacy: false };
    const legacy = await readKey(LEGACY_STORAGE_KEY);
    if (legacy) return { parsed: legacy, fromLegacy: true };
    return null;
}

export async function initSettings(): Promise<void> {
    const stored = await readStoredSettings();
    if (stored) Object.assign(settings, stored.parsed);
    mergeDefaults(settings, DefaultSettings);
    const meta = settings.plugins.Settings;
    if (meta && meta.enabled === false) meta.enabled = true;
    if (stored?.fromLegacy) {
        logger.info(`Copied ${LEGACY_STORAGE_KEY} → ${STORAGE_KEY}; writes to ${LEGACY_STORAGE_KEY} stopped at ${LEGACY_WRITE_STOPPED}`);
    }
    if (stored) SettingsStore.flush();
    await dropLegacySettings();
}

export function migratePluginSettings(name: string, ...oldNames: string[]) {
    const { plugins } = SettingsStore.plain;
    if (name in plugins) return;

    for (const oldName of oldNames) {
        if (oldName in plugins) {
            logger.info(`Migrating settings from old name ${oldName} to ${name}`);
            plugins[name] = plugins[oldName];
            delete plugins[oldName];
            SettingsStore.markAsChanged();
            break;
        }
    }
}

export function migratePluginSetting(pluginName: string, newKey: string, oldKey: string) {
    const pluginSettings = SettingsStore.plain.plugins[pluginName];
    if (!pluginSettings || !(oldKey in pluginSettings) || newKey in pluginSettings) return;

    logger.info(`Migrating setting ${oldKey} -> ${newKey} in ${pluginName}`);
    pluginSettings[newKey] = pluginSettings[oldKey];
    delete pluginSettings[oldKey];
    SettingsStore.markAsChanged();
}

export function migrateSettingsToPlugin(targetPlugin: string, sourcePlugin: string, ...settingKeys: string[]) {
    const source = SettingsStore.plain.plugins[sourcePlugin];
    if (!source) return;

    const target = SettingsStore.plain.plugins[targetPlugin] ??= { enabled: false };
    let changed = false;

    for (const key of settingKeys) {
        if (key in source && !(key in target)) {
            target[key] = source[key];
            delete source[key];
            changed = true;
        }
    }

    if (changed) {
        logger.info(`Migrated settings [${settingKeys.join(", ")}] from ${sourcePlugin} to ${targetPlugin}`);
        SettingsStore.markAsChanged();
    }
}

export interface SettingsPluginData {
    themes?: import("@api/Themes").ThemeData[];
    themesEnabled?: boolean;
    customCSS?: string;
    customCSSEnabled?: boolean;
    knownPlugins?: Record<string, number>;
    chunkFingerprint?: string[];
    pinnedPlugins?: string[];
    starredPlugins?: string[];
    [key: string]: unknown;
}

export function getSettingsPluginData(): SettingsPluginData {
    return (Settings.plugins.Settings as SettingsPluginData) ?? {};
}

export function updateSettingsPluginData(patch: Partial<SettingsPluginData>) {
    Settings.plugins.Settings = { ...(Settings.plugins.Settings ?? { enabled: true }), ...patch };
}

export function getPinnedPlugins(): string[] {
    return getSettingsPluginData().pinnedPlugins ?? [];
}

export function isPluginPinned(name: string): boolean {
    return getPinnedPlugins().includes(name);
}

export function togglePluginPinned(name: string): boolean {
    const current = getPinnedPlugins();
    const pinned = current.includes(name);
    updateSettingsPluginData({
        pinnedPlugins: pinned ? current.filter(n => n !== name) : [name, ...current],
    });
    return !pinned;
}

export function getStarredPlugins(): string[] {
    return getSettingsPluginData().starredPlugins ?? [];
}

export function isPluginStarred(name: string): boolean {
    return getStarredPlugins().includes(name);
}

export function togglePluginStarred(name: string): boolean {
    const current = getStarredPlugins();
    const starred = current.includes(name);
    updateSettingsPluginData({
        starredPlugins: starred ? current.filter(n => n !== name) : [name, ...current],
    });
    return !starred;
}

export function mergePluginSettings(name: string, patch: Record<string, unknown>) {
    Settings.plugins[name] = { ...(Settings.plugins[name] ?? { enabled: false }), ...patch };
}

export function resolveDefault(setting: PluginSettingDef): PluginSettingValue | undefined {
    if ("default" in setting) return setting.default as PluginSettingValue;
    if (setting.type === OptionType.SELECT) return setting.options.find(o => o.default)?.value;
    return undefined;
}

export function definePluginSettings<Def extends SettingsDefinition, Checks extends SettingsChecks<Def>, PrivateSettings extends object = {}>(def: Def, checks?: Checks) {
    let _pluginName = "";

    type Store = DefinedSettings<Def, Checks, PrivateSettings>["store"];

    const definedSettings: DefinedSettings<Def, Checks, PrivateSettings> = {
        get store() {
            if (!_pluginName) throw new Error("Cannot access settings before plugin is initialized");
            return Settings.plugins[_pluginName] as unknown as Store;
        },
        get plain() {
            if (!_pluginName) throw new Error("Cannot access settings before plugin is initialized");
            return PlainSettings.plugins[_pluginName] as unknown as Store;
        },
        def,
        checks: (checks ?? {}) as Checks,
        get pluginName() {
            return _pluginName;
        },
        set pluginName(name: string) {
            _pluginName = name;
            if (!name) return;

            if (!PlainSettings.plugins[name]) PlainSettings.plugins[name] = {};

            SettingsStore.setDefaultGetter(pluginPath(name), key => {
                const setting = def[key];
                return setting ? resolveDefault(setting) : undefined;
            });
        },
        use(keys) {
            const forceUpdate = useForceUpdater();

            useEffect(() => {
                const prefix = pluginPath(_pluginName);
                let listener: (path: string) => void = forceUpdate;
                if (keys?.length) {
                    const watched = keys.map(k => `${prefix}.${String(k)}`);
                    listener = path => {
                        if (watched.some(p => path.startsWith(p) || p.startsWith(path + "."))) forceUpdate();
                    };
                }
                SettingsStore.addPrefixChangeListener(prefix, listener);
                return () => SettingsStore.removePrefixChangeListener(prefix, listener);
            }, []);

            return definedSettings.store;
        },
        withPrivateSettings<T extends object>() {
            return this as unknown as DefinedSettings<Def, Checks, T>;
        },
    };

    return definedSettings;
}
