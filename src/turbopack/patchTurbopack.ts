/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { pageWindow } from "@utils/misc";
import type { Patch } from "@utils/types";

import { fnSourceCache, getFnSource } from "./fnSource";
import { injectionProxies, installInjectionSeam, proxyWithInjections, resolveInjections, setInjectionContext } from "./injection";
import { matchesAllPatterns, matchesPattern } from "./match";
import { chunkFingerprint, patchResults, patchStats, patchTimings, validateMisses } from "./patchReport";
import { type ModuleFactory, type PatchedModuleFactory, type PatchResult, SYM_ORIGINAL, SYM_PATCHED, SYM_PATCHED_BY, SYM_PATCHED_CODE, type TurbopackHelpers, type TurbopackModule, type TurbopackPushable } from "./types";

const logger = new Logger("TurbopackPatcher", "#e78284");

const FACTORY_PROBE_ID = 0x7ffffffe;

const motionSymbol = Symbol.for("motionComponentSymbol");

let compileCounter = 0;

const compileFactory: (code: string, header?: string, sourceUrl?: string) => ModuleFactory = IS_EXTENSION
    ? (code, header, sourceUrl) => {
        let body = `return(${code})`;
        if (header) body = `${header}\n${body}`;
        if (sourceUrl) body += `\n${sourceUrl}`;
        return new Function(body)() as ModuleFactory;
    }
    : (code, header, sourceUrl) => {
        const key = `__void_eval_${compileCounter++}`;
        const script = document.createElement("script");
        const nonce = [...document.scripts].map(el => el.nonce).find(Boolean);
        if (nonce) script.nonce = nonce;
        let src = `window["${key}"]=(${code});`;
        if (header) src = `${header}\n${src}`;
        if (sourceUrl) src += `\n${sourceUrl}`;
        script.textContent = src;
        try {
            (document.head ?? document.documentElement).appendChild(script);
        } finally {
            script.remove();
        }
        let fn = (pageWindow as any)[key] as ModuleFactory | undefined;
        (pageWindow as any)[key] = undefined;
        if (!fn) {
            fn = new Function(`return (${code});`)() as ModuleFactory;
        }
        if (!fn) throw new Error("Factory compilation failed (CSP?)");
        return fn;
    };

export const patches: Patch[] = [];
const moduleCache = new Map<number, any>();
const waitForSubscriptions = new Map<(mod: any) => boolean, (mod: any, id: number) => void>();

let originalPush: ((...args: any[]) => any) | null = null;
let runtimeModuleCache: Record<number, TurbopackModule> | null = null;
let runtimeFactoryRegistry: Map<number, ModuleFactory> | null = null;
let turbopackHelpers: TurbopackHelpers | null = null;

export let _resolveReady: () => void;
export const onceReady = new Promise<void>(r => (_resolveReady = r));

export function getModuleCache(): Map<number, Record<string, unknown>> {
    return moduleCache;
}
export function getRuntimeModuleCache(): Record<number, TurbopackModule> | null {
    return runtimeModuleCache;
}
let lastSyncRtCount = 0;
export function syncLazyModules(): void {
    if (!runtimeModuleCache) return;
    const keys = Object.keys(runtimeModuleCache);
    if (keys.length === lastSyncRtCount) return;
    for (const id of keys) {
        const numId = Number(id);
        const mod = runtimeModuleCache[numId];
        if (mod?.exports == null) continue;
        if (!moduleCache.has(numId)) notifyModuleLoaded(mod.exports, numId);
    }
    lastSyncRtCount = keys.length;
}
export function getRuntimeFactoryRegistry(): Map<number, ModuleFactory> | null {
    return runtimeFactoryRegistry;
}
export function getTurbopackHelpers(): TurbopackHelpers | null {
    return turbopackHelpers;
}

setInjectionContext(moduleCache, getRuntimeFactoryRegistry);

export function addWaitForSubscription(filter: (mod: any) => boolean, cb: (mod: any, id: number) => void) {
    waitForSubscriptions.set(filter, cb);
}

export function removeWaitForSubscription(filter: (mod: any) => boolean) {
    waitForSubscriptions.delete(filter);
}

const moduleLoadListeners = new Set<() => void>();

export function onModuleLoad(cb: () => void): () => void {
    moduleLoadListeners.add(cb);
    return () => moduleLoadListeners.delete(cb);
}

const badExports = new WeakSet();

const IGNORED_TYPES = [HTMLElement, ArrayBuffer, MessagePort, Map, Set, WeakMap, WeakSet] as const;

function shouldIgnoreValue(value: any): boolean {
    if (value == null) return true;
    const t = typeof value;
    if (t !== "object" && t !== "function") return true;
    if (value === window || value === document || value === document.documentElement) return true;
    try {
        if ((value as Record<symbol | string, any>)[Symbol.toStringTag] === "DOMTokenList") return true;
        if ((value as Record<symbol, any>)[motionSymbol]) return true;
    } catch {
        return true;
    }
    return (
        IGNORED_TYPES.some(T => value instanceof T) ||
        ArrayBuffer.isView(value) ||
        (typeof WebSocket !== "undefined" && value instanceof WebSocket)
    );
}

let warnsSuppressed = false;
export function silenceWarns<T>(fn: () => T): T {
    if (warnsSuppressed) return fn();
    warnsSuppressed = true;
    const orig = console.warn;
    console.warn = (...args: any[]) => {
        if (args.some(a => typeof a === "string" && (a.includes("has been renamed to") || a.includes("silence this warning")))) return;
        if (args.length === 1 && args[0] === "") return;
        orig.apply(console, args);
    };
    try {
        return fn();
    } finally {
        console.warn = orig;
        warnsSuppressed = false;
    }
}

export function blacklistBadModules(): void {
    silenceWarns(() => {
        for (const [, exports] of moduleCache) {
            if (shouldIgnoreValue(exports)) {
                if (exports != null && (typeof exports === "object" || typeof exports === "function")) badExports.add(exports);
                continue;
            }
            if (typeof exports !== "object") continue;
            for (const key in exports) {
                try {
                    const v = exports[key];
                    if (shouldIgnoreValue(v) && v != null && (typeof v === "object" || typeof v === "function")) badExports.add(v);
                } catch {}
            }
        }
    });
}

export function isBlacklisted(value: any): boolean {
    if (value == null) return false;
    const t = typeof value;
    if (t !== "object" && t !== "function") return false;
    if (badExports.has(value)) return true;
    if (shouldIgnoreValue(value)) {
        badExports.add(value);
        return true;
    }
    return false;
}

function notifyModuleLoaded(exports: any, id: number) {
    if (exports == null || typeof exports.then === "function") return;
    const existing = moduleCache.get(id);
    if (existing === exports || (existing != null && existing === injectionProxies.get(id))) return;

    const injected = resolveInjections(id);
    const value = injected ? proxyWithInjections(exports, id, injected) : exports;
    moduleCache.set(id, value);

    if (waitForSubscriptions.size) {
        for (const [filter, callback] of waitForSubscriptions) {
            try {
                if (!waitForSubscriptions.has(filter)) continue;
                if (filter(exports)) {
                    waitForSubscriptions.delete(filter);
                    callback(exports, id);
                }
            } catch (e) {
                logger.error("WaitFor listener error:", e);
            }
        }
    }

    if (moduleLoadListeners.size) {
        for (const cb of moduleLoadListeners) {
            try {
                cb();
            } catch (e) {
                logger.error("Module load listener error:", e);
            }
        }
    }
}

interface LazyPatchResult {
    code: string;
    plugins: string[];
}

function patchFactory(moduleId: number, factory: ModuleFactory): LazyPatchResult | null {
    if (!patches.length) return null;

    const originalCode = getFnSource(factory);
    const codeLen = originalCode.length;
    let code = originalCode;
    const patchedBy = new Set<string>();

    for (let i = 0; i < patches.length; i++) {
        const patch = patches[i];
        if (patch.predicate) {
            try {
                if (!patch.predicate()) continue;
            } catch (e) {
                logger.error(`predicate threw for ${patch.plugin}:`, e);
                continue;
            }
        }

        const finds = Array.isArray(patch.find) ? patch.find : [patch.find];
        const maxFindLen = Math.max(0, ...finds.map(f => typeof f === "string" ? f.length : 0));
        if (maxFindLen > codeLen) continue;

        const findStart = IS_DEV ? performance.now() : 0;
        const findMatches = Array.isArray(patch.find) ? matchesAllPatterns(originalCode, patch.find) : matchesPattern(originalCode, patch.find);
        const findElapsed = IS_DEV ? performance.now() - findStart : 0;
        if (!findMatches) continue;

        const replacements = Array.isArray(patch.replacement) ? patch.replacement : [patch.replacement];

        if (patch.validateOnly) {
            for (const replacement of replacements) {
                if (replacement.predicate && !replacement.predicate()) continue;
                const { match } = replacement;
                const matches = matchesPattern(originalCode, match);
                if (!matches && !patch.noWarn && !replacement.noWarn) {
                    validateMisses.add(`${patch.plugin}: ${String(match)}`);
                }
            }
            if (!patch.all) patches.splice(i--, 1);
            continue;
        }

        const previousCode = code;
        let allSucceeded = true;
        let groupApplied = 0;
        let groupNoEffect = 0;
        let groupErrors = 0;
        const result: PatchResult = {
            plugin: patch.plugin,
            find: String(patch.find),
            moduleId,
            noWarn: patch.noWarn,
            replacements: [],
        };

        for (const replacement of replacements) {
            if (replacement.predicate) {
                try {
                    if (!replacement.predicate()) continue;
                } catch (e) {
                    logger.error(`replacement predicate threw for ${patch.plugin}:`, e);
                    continue;
                }
            }
            const lastCode = code;

            try {
                const { match } = replacement;
                const start = IS_DEV ? performance.now() : 0;
                const newCode = code.replace(match, replacement.replace as string);

                if (IS_DEV) patchTimings!.push({ plugin: patch.plugin, moduleId, match, findTime: findElapsed, replaceTime: performance.now() - start });

                if (newCode === code) {
                    groupNoEffect++;
                    result.replacements.push({ match: String(match), status: "noEffect" });
                    if (patch.group) {
                        allSucceeded = false;
                        break;
                    }
                    continue;
                }

                code = newCode;
                patchedBy.add(patch.plugin);
                groupApplied++;
                result.replacements.push({ match: String(match), status: "applied" });
            } catch (err) {
                groupErrors++;
                result.replacements.push({ match: String(replacement.match), status: "error" });
                logger.error(`Error in patch by ${patch.plugin} on module ${moduleId}:`, err);
                code = lastCode;

                if (patch.group) {
                    allSucceeded = false;
                    break;
                }
            }
        }

        if (patch.group && !allSucceeded) {
            code = previousCode;
            patchedBy.delete(patch.plugin);
            for (const r of result.replacements) {
                if (r.status === "applied") r.status = "reverted";
            }
            patchResults.push(result);
            if (!patch.noWarn) logger.warn(`Group patch by ${patch.plugin} failed, reverting`);
            continue;
        }

        patchResults.push(result);

        patchStats.applied += groupApplied;
        patchStats.noEffect += groupNoEffect;
        patchStats.errors += groupErrors;
        if (groupApplied) patchStats.patchedModules.add(moduleId);

        if (!patch.all) patches.splice(i--, 1);
    }

    if (!patchedBy.size) return null;
    return { code, plugins: [...patchedBy] };
}

function createLazyFactory(moduleId: number, patchResult: LazyPatchResult, original: ModuleFactory): PatchedModuleFactory {
    const { code, plugins } = patchResult;
    let compiled: ModuleFactory | null = null;

    const lazy: PatchedModuleFactory = function (this: any, helpers: TurbopackHelpers, mod?: TurbopackModule, exports?: Record<string, any>) {
        if (!compiled) {
            try {
                compiled = compileFactory(
                    code,
                    `// Turbopack Module ${moduleId} - Patched by ${plugins.join(", ")}`,
                    `//# sourceURL=file:///TurbopackModule${moduleId}`,
                );
            } catch (err) {
                logger.error(`Failed to compile patched module ${moduleId} (${plugins.join(", ")}), using original:`, err);
                patchStats.errors++;
                compiled = original;
            }
        }
        compiled.call(this, helpers, mod, exports);
    };

    Object.defineProperty(lazy, "name", { value: `VoidPPPatched_${moduleId}` });
    lazy.toString = () => getFnSource(original);
    lazy[SYM_ORIGINAL] = original;
    lazy[SYM_PATCHED] = true;
    lazy[SYM_PATCHED_BY] = plugins;
    lazy[SYM_PATCHED_CODE] = code;
    return lazy;
}

function createFactoryWrapper(
    moduleId: number,
    factory: ModuleFactory,
    exec: (ctx: any, helpers: TurbopackHelpers, mod: TurbopackModule | undefined, exports: Record<string, any> | undefined) => void,
): ModuleFactory {
    const wrapped = function (this: any, helpers: TurbopackHelpers, mod?: TurbopackModule, exports?: Record<string, any>) {
        captureRuntimeState(helpers);
        try {
            exec(this, helpers, mod, exports);
        } finally {
            try {
                const actualId = mod?.id ?? moduleId;
                if (mod?.exports != null) notifyModuleLoaded(mod.exports, actualId);
            } catch (e) {
                logger.error(`Module notification error for ${mod?.id ?? moduleId}:`, e);
            }
            fnSourceCache.delete(factory);
        }
    };
    wrapped.toString = () => getFnSource(factory);
    return wrapped;
}

function wrapFactory(moduleId: number, factory: ModuleFactory): ModuleFactory {
    const patchResult = patchFactory(moduleId, factory);
    const patched = patchResult ? createLazyFactory(moduleId, patchResult, factory) : factory;
    const original = (patched as PatchedModuleFactory)[SYM_ORIGINAL] ?? factory;
    const isPatched = !!(patched as PatchedModuleFactory)[SYM_PATCHED];

    const wrapped = createFactoryWrapper(moduleId, factory, (ctx, helpers, mod, exports) => {
        try {
            patched.call(ctx, helpers, mod, exports);
        } catch (err) {
            if (!isPatched) throw err;
            patchStats.runtimeFallbacks++;
            logger.error(`Patched module ${mod?.id ?? moduleId} errored, using original:`, err);
            try {
                original.call(ctx, helpers, mod, exports);
            } catch (origErr) {
                logger.error(`Original module ${mod?.id ?? moduleId} also errored:`, origErr);
                throw origErr;
            }
        }
    }) as PatchedModuleFactory;

    wrapped[SYM_ORIGINAL] = original;
    if (isPatched) {
        wrapped[SYM_PATCHED] = true;
        wrapped[SYM_PATCHED_BY] = (patched as PatchedModuleFactory)[SYM_PATCHED_BY];
        wrapped[SYM_PATCHED_CODE] = (patched as PatchedModuleFactory)[SYM_PATCHED_CODE];
    }

    return wrapped;
}

let chunksWithFactories = 0;
let chunksWithoutFactories = 0;

function patchChunkEntry(entry: any[]): any[] {
    if (typeof entry[0] === "string") chunkFingerprint.add(entry[0]);

    let patchedEntry: any[] | null = null;
    const wrappedInChunk = new Map<ModuleFactory, ModuleFactory>();

    for (let i = 1; i < entry.length; i++) {
        if (typeof entry[i] !== "function") continue;

        const prev = entry[i - 1];
        if (typeof prev !== "number") continue;

        if (!patchedEntry) patchedEntry = [...entry];
        const factory = entry[i] as ModuleFactory;
        const existing = wrappedInChunk.get(factory);
        if (existing) {
            patchedEntry[i] = existing;
        } else {
            const wrapped = wrapFactory(prev, factory);
            wrappedInChunk.set(factory, wrapped);
            patchedEntry[i] = wrapped;
        }
    }

    if (entry.length > 2) {
        if (wrappedInChunk.size) chunksWithFactories++;
        else chunksWithoutFactories++;

        if (IS_DEV && !chunksWithFactories && chunksWithoutFactories >= 5)
            logger.warn("No [id, factory] pairs found in first chunks — Turbopack format may have changed");
    }

    return patchedEntry ?? entry;
}

function handleChunkPush(...args: any[]) {
    for (let i = 0; i < args.length; i++) {
        if (Array.isArray(args[i])) {
            try {
                args[i] = patchChunkEntry(args[i]);
            } catch (e) {
                logger.error("Failed to patch chunk entry:", e);
            }
        }
    }
    return originalPush!(...args);
}

function scanCache(cache: Record<number, TurbopackModule>): number {
    let count = 0;
    for (const id in cache) {
        const mod = cache[id];
        if (mod?.exports == null) continue;
        const numId = Number(id);
        if (moduleCache.get(numId) !== mod.exports) {
            notifyModuleLoaded(mod.exports, numId);
            count++;
        }
    }
    return count;
}

export function rescanRuntimeModules(): void {
    if (!runtimeModuleCache) return;
    const count = scanCache(runtimeModuleCache);
    if (count > 0) logger.info(`Rescan found ${count} new/updated modules`);
}

function captureFactoryRegistry(): Map<number, ModuleFactory> | null {
    const origMapSet = Map.prototype.set;
    let captured: Map<number, any> | null = null;

    Map.prototype.set = function (key: any, value: any) {
        if (!captured && key === FACTORY_PROBE_ID && typeof value === "function") {
            captured = this;
        }
        return origMapSet.call(this, key, value);
    };

    try {
        originalPush!(["void-factory-probe", FACTORY_PROBE_ID, () => {}]);
    } finally {
        Map.prototype.set = origMapSet;
    }

    const registry = captured as Map<number, ModuleFactory> | null;
    registry?.delete(FACTORY_PROBE_ID);

    if (registry) {
        let valid = 0;
        for (const [k, v] of registry) {
            if (typeof k === "number" && typeof v === "function" && ++valid >= 3) break;
        }
        if (valid < 3) {
            logger.debug("Captured Map doesn't look like a factory registry, discarding");
            return null;
        }
    }

    return registry;
}

const LOAD_BEARING_HELPERS = ["i", "r", "s", "v", "l", "c", "M"] as const;
let helperContractChecked = false;

function checkHelperContract(helpers: TurbopackHelpers): void {
    helperContractChecked = true;
    const missing = LOAD_BEARING_HELPERS.filter(h => helpers[h] == null);
    if (missing.length) logger.warn(`Turbopack runtime contract changed, missing helper(s): ${missing.join(", ")} — patching may be degraded.`);
}

function captureRuntimeState(helpers: TurbopackHelpers) {
    if (!turbopackHelpers) turbopackHelpers = helpers;
    if (!helperContractChecked) checkHelperContract(helpers);
    installInjectionSeam(helpers);
    if (!runtimeModuleCache && helpers.c) {
        runtimeModuleCache = helpers.c;
        const count = scanCache(runtimeModuleCache);
        if (IS_DEV) logger.debug(`Scanned ${count} existing modules`);
    }
    if (!runtimeFactoryRegistry && helpers.M) runtimeFactoryRegistry = helpers.M;
}

function captureModuleCache(factoryRegistry: Map<number, ModuleFactory>): void {
    const PROBE_ID = FACTORY_PROBE_ID - 1;
    factoryRegistry.set(PROBE_ID, ((helpers: TurbopackHelpers) => captureRuntimeState(helpers)) as ModuleFactory);

    originalPush!(["void-cache-probe", { otherChunks: [], runtimeModuleIds: [PROBE_ID] }]);

    queueMicrotask(() => factoryRegistry.delete(PROBE_ID));
}

function wrapExistingFactories() {
    runtimeFactoryRegistry = captureFactoryRegistry();
    if (runtimeFactoryRegistry) {
        const registry = runtimeFactoryRegistry;
        const wrapped = new Map<ModuleFactory, ModuleFactory>();

        const ensureWrapped = (id: number, factory: ModuleFactory): ModuleFactory => {
            const existing = wrapped.get(factory);
            const w = existing ?? wrapFactory(id, factory);
            if (!existing) wrapped.set(factory, w);
            registry.set(id, w);
            return w;
        };

        const origGet = registry.get.bind(registry);
        registry.get = function (id: number) {
            const factory = origGet(id);
            if (factory == null || (factory as PatchedModuleFactory)[SYM_ORIGINAL]) return factory;
            return ensureWrapped(id, factory);
        } as any;

        for (const [id, factory] of registry) {
            if ((factory as PatchedModuleFactory)[SYM_ORIGINAL]) continue;
            ensureWrapped(id, factory);
        }
    }
    if (!runtimeModuleCache && runtimeFactoryRegistry) {
        captureModuleCache(runtimeFactoryRegistry);
    }
}

function adoptTurbopack(tp: TurbopackPushable, drain?: () => void): void {
    originalPush = tp.push.bind(tp);
    tp.push = handleChunkPush;
    drain?.();
    try {
        wrapExistingFactories();
    } catch (e) {
        logger.error("Failed to wrap existing factories:", e);
    }
}

export function patchTurbopack(): void {
    const existingTp = pageWindow.TURBOPACK;

    if (existingTp && !Array.isArray(existingTp) && typeof existingTp.push === "function") {
        adoptTurbopack(existingTp);
        return;
    }

    const queuedChunks: any[][] = [];
    if (Array.isArray(existingTp)) queuedChunks.push(...(existingTp as any[][]));

    let currentTurbopack: TurbopackPushable | any[] = existingTp ?? [];

    Object.defineProperty(pageWindow, "TURBOPACK", {
        configurable: true,
        get() {
            return currentTurbopack;
        },
        set(newValue: any) {
            if (newValue && !Array.isArray(newValue) && typeof (newValue as TurbopackPushable).push === "function") {
                const tp = newValue as TurbopackPushable;
                adoptTurbopack(tp, () => {
                    currentTurbopack = tp;
                    for (const chunk of queuedChunks) {
                        try {
                            handleChunkPush(chunk);
                        } catch (e) {
                            logger.error("Failed to process queued chunk:", e);
                        }
                    }
                    queuedChunks.length = 0;
                });
            } else {
                currentTurbopack = newValue as TurbopackPushable | any[];
            }
        },
    });

    if (Array.isArray(currentTurbopack)) {
        const origPush = currentTurbopack.push.bind(currentTurbopack);
        (currentTurbopack as any[]).push = (...args: any[]) => {
            queuedChunks.push(...(args as any[][]));
            return origPush(...args);
        };
    }
}
