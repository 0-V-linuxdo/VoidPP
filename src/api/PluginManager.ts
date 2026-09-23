/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as allStores from "@turbopack/common/stores";
import { onModuleLoad, patches, rescanRuntimeModules } from "@turbopack/patchTurbopack";
import { filters, waitFor } from "@turbopack/turbopack";
import { disableStyle, enableStyle } from "@utils/css";
import { SYM_LAZY_GET } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { canonicalizeFind, canonicalizeReplacement, countCaptureGroups, invalidBackrefs } from "@utils/patches";
import { type Patch, type Plugin, StartAt } from "@utils/types";

import { addChatBarButton, removeChatBarButton } from "./ChatBarButtons";
import { addContextMenuItem, type ContextMenuItemDef, type ContextMenuLocation, removeContextMenuItem } from "./ContextMenus";
import { dispatch, subscribe as subscribeEvent, type VoidPPEvent } from "./Events";
import { getSettingsPluginData, mergePluginSettings, PlainSettings, pluginPath, Settings, SettingsStore, updateSettingsPluginData } from "./Settings";

const logger = new Logger("PluginManager", "#b4befe");

export const plugins: Record<string, Plugin> = {};
const pluginUnsubscribers = new Map<string, Array<() => void>>();
let initialized = false;

const storeRegistry = allStores as unknown as Record<string, Record<string, unknown>>;

function runUnsubs(pluginName: string) {
    const unsubs = pluginUnsubscribers.get(pluginName);
    if (!unsubs) return;
    for (const unsub of unsubs) {
        try { unsub(); } catch (e) { logger.error(`Unsub error in ${pluginName}:`, e); }
    }
    pluginUnsubscribers.delete(pluginName);
}

function markAsEnabledDependency(plugin: Plugin) {
    mergePluginSettings(plugin.name, { enabled: true });
    plugin.isDependency = true;
}

function removePluginContextMenuItems(plugin: Plugin) {
    if (!plugin.contextMenuItems) return;
    for (const location of Object.keys(plugin.contextMenuItems)) {
        removeContextMenuItem(location as ContextMenuLocation, plugin.name);
    }
}

export function isPluginEnabled(pluginName: string): boolean {
    const plugin = plugins[pluginName];
    if (!plugin) return false;
    if (plugin.chrome && !(window as { chrome?: unknown }).chrome) return false;
    if (plugin.required || plugin.isDependency) return true;
    return Settings.plugins[pluginName]?.enabled ?? plugin.enabledByDefault ?? false;
}

export function togglePlugin(name: string): boolean {
    const plugin = plugins[name];
    if (!plugin || plugin.required || plugin.isDependency) return false;

    const enabled = isPluginEnabled(name);
    mergePluginSettings(name, { enabled: !enabled });
    if (!enabled) startPlugin(plugin, true);
    else stopPlugin(plugin);
    dispatch("pluginToggle");
    return !!(plugin.patches?.length || plugin.requiresRestart);
}

export function addPatch(newPatch: Omit<Patch, "plugin">, pluginName: string) {
    const patch = newPatch as Patch;
    patch.plugin = pluginName;

    if (patch.predicate && !patch.predicate()) return;

    canonicalizeFind(patch);

    if (!Array.isArray(patch.replacement)) {
        patch.replacement = [patch.replacement];
    }

    const pluginPath = `VoidPP.plugins[${JSON.stringify(pluginName)}]`;
    for (const replacement of patch.replacement) {
        if (IS_DEV && typeof replacement.replace === "string") {
            const groups = countCaptureGroups(replacement.match instanceof RegExp ? replacement.match.source : String(replacement.match));
            for (const ref of invalidBackrefs(replacement.replace, groups)) {
                logger.warn(`${pluginName}: replace references $${ref} but match has ${groups} capture group(s)`);
            }
        }
        canonicalizeReplacement(replacement, pluginPath);
    }

    patches.push(patch);
}

function startDependenciesRecursive(plugin: Plugin, visiting = new Set<string>()) {
    if (!plugin.dependencies) return true;

    for (const depName of plugin.dependencies) {
        const dep = plugins[depName];
        if (!dep) {
            logger.warn(`Missing dependency ${depName} for ${plugin.name}`);
            return false;
        }

        if (dep.started) continue;

        if (visiting.has(depName)) {
            logger.error(`Circular dependency detected: ${plugin.name} -> ${depName}`);
            return false;
        }

        markAsEnabledDependency(dep);

        visiting.add(depName);
        if (!startDependenciesRecursive(dep, visiting)) return false;
        if (!startPlugin(dep)) return false;
    }

    return true;
}

type Subscribable = { subscribe: (...args: unknown[]) => () => void };

function isSubscribable(val: unknown): val is Subscribable {
    return val != null && typeof (val as { subscribe?: unknown }).subscribe === "function";
}

function resolveStoreHook(storeName: string): Subscribable | null {
    const lazy = storeRegistry[storeName];
    if (!lazy) return null;

    const resolved = (lazy as { [SYM_LAZY_GET]?: () => Record<string, unknown> })[SYM_LAZY_GET]?.() ?? lazy;
    if (!resolved) return null;

    const hook = resolved[`use${storeName}`];
    if (isSubscribable(hook)) return hook;

    return Object.values(resolved).find(isSubscribable) ?? null;
}

function ensureMethodsBound(plugin: Plugin) {
    for (const key of Object.keys(plugin)) {
        if (key === "start" || key === "stop") continue;
        const val = (plugin as unknown as Record<string, unknown>)[key];
        if (typeof val === "function" && !(val as { $$voidBound?: boolean }).$$voidBound) {
            const bound = val.bind(plugin);
            (bound as { $$voidBound?: boolean }).$$voidBound = true;
            (plugin as unknown as Record<string, unknown>)[key] = bound;
        }
    }
}

export function startPlugin(plugin: Plugin, silent = false): boolean {
    if (plugin.started) return true;

    try {
        if (!startDependenciesRecursive(plugin)) {
            logger.error(`Failed to start dependencies for ${plugin.name}`);
            return false;
        }

        ensureMethodsBound(plugin);

        if (plugin.managedStyle) enableStyle(plugin.managedStyle);

        if (!plugin.hidden && !silent) logger.info(`Starting plugin ${plugin.name}`);
        plugin.start?.();

        if (plugin.chatBarButton) {
            addChatBarButton(plugin.name, plugin.chatBarButton);
        }

        if (plugin.contextMenuItems) {
            for (const [location, def] of Object.entries(plugin.contextMenuItems)) {
                addContextMenuItem(location as ContextMenuLocation, plugin.name, def as ContextMenuItemDef);
            }
        }

        const unsubs: Array<() => void> = [];
        pluginUnsubscribers.set(plugin.name, unsubs);

        if (plugin.events) {
            for (const [event, handler] of Object.entries(plugin.events) as [VoidPPEvent, ((data: unknown) => void) | undefined][]) {
                if (handler) unsubs.push(subscribeEvent(event, handler));
            }
        }

        if (plugin.zustand) {
            for (const [storeName, sub] of Object.entries(plugin.zustand)) {
                const wrappedHandler = (current: unknown, prev: unknown) => {
                    try {
                        sub.handler(current, prev);
                    } catch (e) {
                        logger.error(`Zustand handler error in ${plugin.name} for ${storeName}:`, e);
                    }
                };

                const attach = (store: Subscribable) => {
                    if (!sub.selector) {
                        unsubs.push(store.subscribe(wrappedHandler));
                        return;
                    }
                    try {
                        const unsub = store.subscribe(sub.selector, wrappedHandler);
                        if (typeof unsub !== "function") throw new Error("selector subscribe returned no unsubscribe");
                        unsubs.push(unsub);
                    } catch (e) {
                        logger.warn(`${plugin.name}: selector subscribe failed for ${storeName}`, e);
                        const select = sub.selector;
                        let prev: unknown;
                        const getState = (store as { getState?: () => unknown }).getState;
                        if (typeof getState === "function") {
                            try { prev = select(getState.call(store)); } catch { prev = undefined; }
                        }
                        unsubs.push(store.subscribe((state: unknown) => {
                            let cur: unknown;
                            try { cur = select(state); } catch (err) {
                                logger.error(`Zustand selector error in ${plugin.name} for ${storeName}:`, err);
                                return;
                            }
                            if (Object.is(cur, prev)) return;
                            const old = prev;
                            prev = cur;
                            wrappedHandler(cur, old);
                        }));
                    }
                };

                const store = resolveStoreHook(storeName);
                if (store) {
                    attach(store);
                    continue;
                }

                let cancelled = false;
                const cancelWait = waitFor(filters.byProps(`use${storeName}`), () => {
                    if (cancelled) return;
                    const resolved = resolveStoreHook(storeName);
                    if (resolved) attach(resolved);
                    else logger.warn(`Store "${storeName}" resolved module missing hook for plugin ${plugin.name}`);
                });
                unsubs.push(() => { cancelled = true; cancelWait(); });
            }
        }

        if (plugin.onSettingsChange) {
            const prefix = pluginPath(plugin.name);
            const listener = () => plugin.onSettingsChange!();
            SettingsStore.addPrefixChangeListener(prefix, listener);
            unsubs.push(() => SettingsStore.removePrefixChangeListener(prefix, listener));
        }

        plugin.started = true;
        return true;
    } catch (e) {
        logger.error(`Failed to start plugin ${plugin.name}:`, e);
        if (plugin.managedStyle) disableStyle(plugin.managedStyle);
        removeChatBarButton(plugin.name);
        removePluginContextMenuItems(plugin);
        runUnsubs(plugin.name);
        return false;
    }
}

export function stopPlugin(plugin: Plugin): boolean {
    if (!plugin.started) return true;

    try { plugin.stop?.(); } catch (e) { logger.error(`Error in ${plugin.name}.stop():`, e); }

    runUnsubs(plugin.name);

    const tryCleanup = (fn: () => void) => { try { fn(); return false; } catch (e) { logger.error(`Cleanup error in ${plugin.name}:`, e); return true; } };

    const failed = [
        tryCleanup(() => removeChatBarButton(plugin.name)),
        tryCleanup(() => removePluginContextMenuItems(plugin)),
        tryCleanup(() => { if (plugin.managedStyle && !plugin.patches?.length) disableStyle(plugin.managedStyle); }),
        tryCleanup(() => { if (plugin.cleanupSelectors) for (const s of plugin.cleanupSelectors) for (const el of document.querySelectorAll(s)) el.remove(); }),
    ].some(Boolean);

    plugin.started = false;
    if (failed) logger.error(`Plugin ${plugin.name} stopped with errors`);
    return !failed;
}

export function startAllPlugins(target: StartAt): void {
    for (const [name, plugin] of Object.entries(plugins)) {
        if (!isPluginEnabled(name)) continue;
        if ((plugin.startAt ?? StartAt.Init) !== target) continue;
        try { startPlugin(plugin); } catch (e) { logger.error(`Unexpected error starting ${name}:`, e); }
    }
}

export function registerPlugin(plugin: Plugin) {
    if (plugins[plugin.name]) return;

    plugins[plugin.name] = plugin;
    plugin.started = false;

    if (plugin.settings) {
        plugin.settings.pluginName = plugin.name;
    }
}

const NEW_PLUGIN_TTL = 2 * 24 * 60 * 60 * 1000;

export function isNewPlugin(name: string): boolean {
    const seen = getSettingsPluginData().knownPlugins?.[name];
    return seen != null && Date.now() - seen < NEW_PLUGIN_TTL;
}

function trackNewPlugins() {
    const known = getSettingsPluginData().knownPlugins ?? {};
    const visible = Object.keys(plugins).filter(n => !plugins[n].hidden && !plugins[n].required);
    let changed = false;

    for (const name of visible) {
        if (!(name in known)) {
            known[name] = Date.now();
            changed = true;
        }
    }

    if (changed) updateSettingsPluginData({ knownPlugins: known });
}

function pruneOrphanedPluginSettings() {
    const stored = PlainSettings.plugins;
    const orphaned = Object.keys(stored).filter(name => !plugins[name]);
    for (const name of orphaned) {
        logger.info(`Pruning settings for removed plugin: ${name}`);
        delete stored[name];
    }
    if (orphaned.length) SettingsStore.markAsChanged();
}

function promoteCleanerDefault() {
    const data = getSettingsPluginData();
    if (data.cleanerDefaultOn) return;
    mergePluginSettings("Cleaner", { enabled: true });
    updateSettingsPluginData({ cleanerDefaultOn: 1 });
}

export function initPluginManager() {
    if (initialized) return;
    initialized = true;

    pruneOrphanedPluginSettings();
    trackNewPlugins();
    promoteCleanerDefault();

    const neededApis = new Set<string>();

    for (const [name, plugin] of Object.entries(plugins)) {
        if (!isPluginEnabled(name)) continue;

        for (const d of plugin.dependencies ?? []) {
            const dep = plugins[d];
            if (!dep) {
                logger.warn(`Plugin ${name} has unresolved dependency ${d}`);
                continue;
            }
            markAsEnabledDependency(dep);
        }

        if (plugin.chatBarButton) neededApis.add("ChatBarButtonAPI");
        if (plugin.contextMenuItems) neededApis.add("ContextMenuAPI");
    }

    for (const api of neededApis) {
        const dep = plugins[api];
        if (dep) markAsEnabledDependency(dep);
    }

    for (const [name, plugin] of Object.entries(plugins)) {
        const enabled = isPluginEnabled(name);

        if (enabled) ensureMethodsBound(plugin);

        if (plugin.patches) {
            try {
                for (const patch of plugin.patches) {
                    if (enabled) addPatch(patch, name);
                    else if (IS_DEV) addPatch({ ...patch, validateOnly: true }, name);
                }
            } catch (e) {
                logger.error(`Failed to register patches for ${name}`, e);
            }
        }
    }
}

const RETRY_TIMEOUT_MS = 15_000;
const RETRY_DEBOUNCE_MS = 200;

const getFailed = () =>
    Object.values(plugins).filter(
        p => !p.started && isPluginEnabled(p.name) && (p.startAt ?? StartAt.Init) === StartAt.TurbopackReady,
    );

export function retryFailedPlugins() {
    if (!getFailed().length) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryRetry = () => {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            retryTimer = null;
            rescanRuntimeModules();
            for (const p of getFailed()) startPlugin(p, true);

            if (!getFailed().length) {
                unsub();
                clearTimeout(timeout);
                logger.info("All previously failed plugins started after late module load");
            }
        }, RETRY_DEBOUNCE_MS);
    };

    const unsub = onModuleLoad(tryRetry);

    const timeout = setTimeout(() => {
        unsub();
        if (retryTimer) clearTimeout(retryTimer);
        rescanRuntimeModules();
        const remaining = getFailed();
        for (const p of remaining) startPlugin(p, true);
        const stillFailed = getFailed();
        if (stillFailed.length) {
            logger.warn(`${stillFailed.length} plugin(s) still failed after retry window: ${stillFailed.map(p => p.name).join(", ")}`);
        }
    }, RETRY_TIMEOUT_MS);
}
