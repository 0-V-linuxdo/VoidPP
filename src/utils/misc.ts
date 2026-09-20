/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isObject } from "./guards";

export const pageWindow: typeof globalThis = typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis;

export function mergeDefaults<T extends object>(target: T, defaults: T): T {
    for (const [key, defaultValue] of Object.entries(defaults)) {
        const value = (target as Record<string, unknown>)[key];
        if (isObject(value)) {
            mergeDefaults(value as Record<string, unknown>, defaultValue as Record<string, unknown>);
        } else if (value === undefined) {
            (target as Record<string, unknown>)[key] = defaultValue;
        }
    }
    return target;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function copyToClipboard(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        if (typeof GM_setClipboard === "function") {
            GM_setClipboard(text);
        }
    }
}

export function onlyOnce<T extends (...args: never[]) => unknown>(fn: T): T {
    let result: unknown;
    let f: T | null = fn;
    return ((...args: unknown[]) => {
        if (!f) return result;
        result = f(...(args as never[]));
        f = null;
        return result;
    }) as unknown as T;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return ((...args: unknown[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...(args as never[])), ms);
    }) as unknown as T;
}

const FETCH_TIMEOUT_MS = 30_000;

export function fetchExternal(url: string): Promise<Response> {
    if (IS_EXTENSION || typeof GM_xmlhttpRequest === "undefined") {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    }

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url,
            responseType: "blob",
            timeout: FETCH_TIMEOUT_MS,
            onload(resp) {
                resolve(new Response(resp.response, {
                    status: resp.status,
                    statusText: resp.statusText,
                }));
            },
            ontimeout() { reject(new Error("fetch timeout")); },
            onerror() { reject(new Error("fetch error")); },
            onabort() { reject(new Error("fetch aborted")); },
        });
    });
}

export interface ExternalStore {
    notify(): void;
    subscribe(callback: () => void): () => void;
    getSnapshot(): number;
}

export function createExternalStore(): ExternalStore {
    const listeners = new Set<() => void>();
    let version = 0;

    return {
        notify() {
            version++;
            for (const fn of listeners) fn();
        },
        subscribe(callback: () => void) {
            listeners.add(callback);
            return () => { listeners.delete(callback); };
        },
        getSnapshot() {
            return version;
        },
    };
}

export interface SelectionStore<T> extends ExternalStore {
    has(id: T): boolean;
    toggle(id: T): void;
    add(id: T): void;
    remove(id: T): void;
    clear(): void;
    all(): T[];
    size(): number;
}

export function createSelectionStore<T>(): SelectionStore<T> {
    const set = new Set<T>();
    const store = createExternalStore();
    return {
        ...store,
        has: id => set.has(id),
        toggle(id) { if (set.has(id)) set.delete(id); else set.add(id); store.notify(); },
        add(id) { if (!set.has(id)) { set.add(id); store.notify(); } },
        remove(id) { if (set.delete(id)) store.notify(); },
        clear() { if (set.size) { set.clear(); store.notify(); } },
        all: () => [...set],
        size: () => set.size,
    };
}

const pad = (n: number) => String(n).padStart(2, "0");

function hms(totalSeconds: number): [h: number, m: number, s: number] {
    return [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60];
}

export function formatCountdown(totalSeconds: number): string {
    if (totalSeconds <= 0) return "0:00";
    const [h, m, s] = hms(totalSeconds);
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatDuration(totalSeconds: number): string {
    if (totalSeconds <= 0) return "0m";
    const [h, m] = hms(totalSeconds);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    return h > 0 ? `${h}h` : `${m}m`;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

const FILENAME_ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/g;
const WHITESPACE_RUN = /\s+/g;

export function sanitizeFilename(title: string, fallback = "file"): string {
    return title.replaceAll(FILENAME_ILLEGAL, "").trim().replaceAll(WHITESPACE_RUN, "-") || fallback;
}

export function mapGetOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
    let value = map.get(key);
    if (value === undefined) {
        value = create();
        map.set(key, value);
    }
    return value;
}

export function safeUrl(url: string): string | null {
    try {
        const { protocol } = new URL(url);
        return protocol === "https:" || protocol === "http:" || protocol === "mailto:" ? url : null;
    } catch {
        return null;
    }
}

export function randomId(prefix = ""): string {
    const tail = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return prefix ? `${prefix}-${tail}` : tail;
}

export function sortedEntries<V extends { order?: number }>(map: Map<string, V>): [string, V][] {
    return [...map.entries()].toSorted(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0));
}

export function sendBrowserNotification(title: string, body: string, icon = "/favicon.ico"): void {
    if (Notification.permission === "granted") {
        new Notification(title, { body, icon });
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(p => { if (p === "granted") new Notification(title, { body, icon }); }).catch(() => {});
    }
}
