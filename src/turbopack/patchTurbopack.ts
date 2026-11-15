// @ts-nocheck
/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { U } from "../../sites/grok/u.js";

function api() { return U; }

export const patches = new Proxy([], {
    get(_, key) {
        const list = api()?.patches;
        if (!list) return key === "length" ? 0 : undefined;
        return list[key];
    },
});

export function getModuleCache() {
    return api()?.getModuleCache?.() ?? new Map();
}
export function getRuntimeModuleCache() {
    return api()?.getRuntimeModuleCache?.() ?? null;
}
export function getRuntimeFactoryRegistry() {
    return api()?.getRuntimeFactoryRegistry?.() ?? null;
}
export function syncLazyModules() {
    api()?.syncLazyModules?.() || api()?.syncModuleCache?.();
}
export function rescanRuntimeModules() {
    api()?.rescanRuntimeModules?.();
}
export function isBlacklisted() { return false; }
export function blacklistBadModules() {}
export function silenceWarns() {}
export function onModuleLoad(cb) {
    return api()?.onModuleLoad(cb) ?? (() => {});
}
export let _resolveReady = () => {};
export const onceReady = new Promise(r => { _resolveReady = r; });
queueMicrotask(function wait() {
    const u = api();
    if (!u?.onceReady) { setTimeout(wait, 0); return; }
    Promise.resolve(u.onceReady).then(() => _resolveReady());
});

export function patchTurbopack() {}
export function getTurbopackHelpers() { return null; }
