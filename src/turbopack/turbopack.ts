// @ts-nocheck
/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { U } from "../../sites/grok/u.js";
import { proxyLazy } from "@utils/lazy";

export { fnSourceCache, getFnSource } from "./fnSource";
export { matchesAllPatterns, matchesPattern } from "./match";

function api() {
    if (!U) return null;
    return U;
}

function call(name, ...args) {
    const u = api();
    if (!u) return null;
    return u[name](...args);
}

// Always return a callable. `waitFor(filters.byProps("x"), …)` runs at module
// eval, before bindApi(U). A missing method threw TypeError and aborted the IIFE.
export const filters = new Proxy({}, {
    get(_, key) {
        if (typeof key === "symbol") return undefined;
        return (...args) => {
            const impl = api()?.filters?.[key];
            if (typeof impl === "function") return impl(...args);
            return mod => {
                const impl2 = api()?.filters?.[key];
                if (typeof impl2 !== "function") return false;
                const f = impl2(...args);
                return typeof f === "function" ? !!f(mod) : !!f;
            };
        };
    },
});

export const find = (filter, ...rest) => call("find", filter, ...rest);
export const findAll = (filter, ...rest) => call("findAll", filter, ...rest) ?? [];
export const findByProps = (...keys) => call("findByProps", ...keys);
export const findByCode = (...code) => call("findByCode", ...code);
export const findByDisplayName = name => call("findByDisplayName", name);
export const findComponentByCode = (...code) => call("findComponentByCode", ...code);
export const findExportedComponent = (...names) => call("findExportedComponent", ...names);
export const findStore = name => call("findStore", name);
export const findModuleId = (...a) => call("findModuleId", ...a);
export const findModuleFactory = (...a) => call("findModuleFactory", ...a);
export const mapMangledModule = (...a) => call("mapMangledModule", ...a);
export const requireModule = id => call("requireModule", id);
export const search = (...a) => call("search", ...a) ?? {};
export const findCssClasses = (...a) => call("findCssClasses", ...a) ?? {};
export const findBulk = (...a) => call("findBulk", ...a) ?? [];
export const extractAndLoadChunks = (...a) => call("extractAndLoadChunks", ...a);
export const extractAndLoadChunksLazy = (...a) => call("extractAndLoadChunksLazy", ...a);
export const loadChunk = (...a) => call("loadChunk", ...a);
export const importModule = (...a) => call("importModule", ...a);
export const getAllStores = () => call("getAllStores") ?? [];
export const isZustandStore = val => {
    const u = api();
    if (u?.isZustandStore) return u.isZustandStore(val);
    return typeof val === "function"
        && typeof val.getState === "function"
        && typeof val.setState === "function"
        && typeof val.subscribe === "function";
};

export function waitFor(filter, callback, timeoutMs) {
    let off = () => {};
    const start = () => {
        const u = api();
        if (!u) {
            setTimeout(start, 0);
            return;
        }
        const f = typeof filter === "function" ? filter : () => false;
        off = u.waitFor(f, callback, timeoutMs) || (() => {});
    };
    start();
    return () => off();
}

export const findLazy = filter => proxyLazy(() => find(filter));
export const findByPropsLazy = (...keys) => proxyLazy(() => findByProps(...keys));
export const findByCodeLazy = (...code) => proxyLazy(() => findByCode(...code));
export const findByDisplayNameLazy = name => proxyLazy(() => findByDisplayName(name));
export const findComponentByCodeLazy = (...code) => proxyLazy(() => findComponentByCode(...code));
export const findExportedComponentLazy = (...names) => proxyLazy(() => findExportedComponent(...names));
export const findStoreLazy = name => proxyLazy(() => findStore(name));
export const findCssClassesLazy = (...a) => proxyLazy(() => findCssClasses(...a));
export const mapMangledModuleLazy = (...a) => proxyLazy(() => mapMangledModule(...a));

export function reportFailedFinders() {}
