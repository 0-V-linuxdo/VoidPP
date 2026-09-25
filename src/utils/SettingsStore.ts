/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isObject } from "./guards";
import { idbSet } from "./idb";
import { Logger } from "./Logger";
import { mapGetOrCreate } from "./misc";

const logger = new Logger("SettingsStore");

export const STORAGE_KEY = "VoidPPSettings";
export const LEGACY_STORAGE_KEY = "VoidSettings";
const SAVE_DEBOUNCE_MS = 100;

type Listener = (path: string) => void;

export function parseStoredSettings(raw?: unknown): Record<string, unknown> | null {
    if (isObject(raw)) return raw;
    if (typeof raw !== "string" || !raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (isObject(parsed)) return parsed;
        if (typeof parsed === "string") {
            const nested = JSON.parse(parsed);
            return isObject(nested) ? nested : null;
        }
        return null;
    } catch {
        return null;
    }
}

export function settingsBagHasPlugins(parsed: Record<string, unknown> | null): parsed is Record<string, unknown> {
    if (!parsed) return false;
    const { plugins } = parsed;
    return isObject(plugins) && Object.keys(plugins).length > 0;
}

export class SettingsStore<T extends object> {
    private globalListeners = new Set<Listener>();
    private pathListeners = new Map<string, Set<Listener>>();
    private prefixListeners = new Map<string, Set<Listener>>();
    private defaultGetters = new Map<string, (key: string) => unknown>();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private proxyCache = new WeakMap<object, T>();
    private ready = false;

    public declare store: T;
    public declare plain: T;

    constructor(plain: T) {
        this.plain = plain;
        this.store = this.makeProxy(plain as Record<string, unknown>);
    }

    public markReady() {
        if (this.ready) return;
        this.ready = true;
        window.addEventListener("beforeunload", () => this.flush(), { once: true });
    }

    public flush() {
        if (!this.ready) return;
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
        this.save();
    }

    public setDefaultGetter(prefix: string, getter: (key: string) => unknown): void {
        this.defaultGetters.set(prefix, getter);
    }

    private makeProxy(target: Record<string, unknown>, path = ""): T {
        const cached = this.proxyCache.get(target);
        if (cached) return cached as T;

        const proxy = new Proxy(target, {
            get: (t, key: string) => {
                let value = t[key];
                if (value === undefined && key !== "__proto__") {
                    const fullPath = path ? `${path}.${key}` : key;
                    for (const [prefix, getter] of this.defaultGetters) {
                        if (fullPath.startsWith(prefix)) {
                            const settingKey = fullPath.slice(prefix.length + 1);
                            if (settingKey && !settingKey.includes(".")) {
                                const defaultVal = getter(settingKey);
                                if (defaultVal !== undefined) {
                                    t[key] = defaultVal;
                                    value = defaultVal;
                                }
                                break;
                            }
                        }
                    }
                }
                if (isObject(value)) {
                    return this.makeProxy(value, path ? `${path}.${key}` : key);
                }
                return value;
            },
            set: (t, key: string, value) => {
                if (t[key] === value) return true;
                t[key] = value;
                const fullPath = path ? `${path}.${key}` : key;
                this.notifyListeners(fullPath);
                return true;
            },
            deleteProperty: (t, key: string) => {
                if (!(key in t)) return true;
                delete t[key];
                const fullPath = path ? `${path}.${key}` : key;
                this.notifyListeners(fullPath);
                return true;
            },
        });

        this.proxyCache.set(target, proxy as T);
        return proxy as T;
    }

    private invokeListeners(listeners: Set<Listener>, path: string) {
        for (const l of Array.from(listeners)) {
            try { l(path); } catch (e) { logger.error("Settings listener error:", e); }
        }
    }

    private notifyListeners(path: string) {
        this.invokeListeners(this.globalListeners, path);

        const listeners = this.pathListeners.get(path);
        if (listeners) this.invokeListeners(listeners, path);

        for (const [prefix, set] of Array.from(this.prefixListeners)) {
            if (path.startsWith(prefix)) this.invokeListeners(set, path);
        }

        this.scheduleSave();
    }

    private scheduleSave() {
        if (!this.ready || this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.save();
        }, SAVE_DEBOUNCE_MS);
    }

    private save() {
        if (!this.ready) return;
        const { plugins } = this.plain as { plugins?: unknown };
        if (!isObject(plugins) || !Object.keys(plugins).length) return;

        try {
            const json = JSON.stringify(this.plain);
            if (typeof GM_setValue === "function") {
                try { GM_setValue(STORAGE_KEY, this.plain); }
                catch {
                    try { GM_setValue(STORAGE_KEY, json); }
                    catch (e2) { logger.warn("Failed to save settings to GM:", e2); }
                }
            } else {
                try { localStorage.setItem(STORAGE_KEY, json); } catch {}
            }
            idbSet(STORAGE_KEY, json).catch(e => logger.warn("Failed to save settings to IndexedDB:", e));
        } catch (e) {
            logger.error("Failed to save settings:", e);
        }
    }

    public markAsChanged() {
        this.notifyListeners("");
    }

    public addGlobalChangeListener(listener: Listener) {
        this.globalListeners.add(listener);
    }

    public removeGlobalChangeListener(listener: Listener) {
        this.globalListeners.delete(listener);
    }

    private addToMap(map: Map<string, Set<Listener>>, key: string, listener: Listener) {
        mapGetOrCreate(map, key, () => new Set<Listener>()).add(listener);
    }

    private removeFromMap(map: Map<string, Set<Listener>>, key: string, listener: Listener) {
        const set = map.get(key);
        if (set) { set.delete(listener); if (!set.size) map.delete(key); }
    }

    public addChangeListener(path: string, listener: Listener) { this.addToMap(this.pathListeners, path, listener); }
    public removeChangeListener(path: string, listener: Listener) { this.removeFromMap(this.pathListeners, path, listener); }
    public addPrefixChangeListener(prefix: string, listener: Listener) { this.addToMap(this.prefixListeners, prefix, listener); }
    public removePrefixChangeListener(prefix: string, listener: Listener) { this.removeFromMap(this.prefixListeners, prefix, listener); }
}
