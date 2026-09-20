/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ModuleFactory = (helpers: TurbopackHelpers, module?: TurbopackModule, exports?: Record<string, any>) => void;

export const SYM_ORIGINAL = Symbol("VoidPP.originalFactory");
export const SYM_PATCHED = Symbol("VoidPP.patched");
export const SYM_PATCHED_BY = Symbol("VoidPP.patchedBy");
export const SYM_PATCHED_CODE = Symbol("VoidPP.patchedCode");

export interface PatchedModuleFactory extends ModuleFactory {
    [SYM_ORIGINAL]?: ModuleFactory;
    [SYM_PATCHED]?: boolean;
    [SYM_PATCHED_BY]?: string[];
    [SYM_PATCHED_CODE]?: string;
    toString(): string;
}

export interface TurbopackRequireFn {
    (id: string): any;
    keys(): string[];
    resolve(id: string): number;
    import(id: string): Promise<any>;
}

export interface TurbopackHelpers {
    i(moduleId: number): any;
    r(moduleId: number): any;
    R(moduleId: number): any;
    s(exports: unknown[], moduleId?: number): void;
    q(path: string, value: unknown): void;
    j(exports: object | null, moduleId?: number): void;
    v(value: any, moduleId?: number): void;
    n(value: any, moduleId?: number): void;
    A(moduleId: number): Promise<any>;
    a(asyncModule: any, hasAwait: boolean): void;
    f(resolveMap: Record<string, { id(): number; module(): any }>): TurbopackRequireFn;
    z(specifier: string): never;
    t(): never;
    l(chunkPath: string): Promise<void>;
    L(chunkPath: string): Promise<void>;
    U: new (
        path: string,
    ) => URL;
    P(path?: string): string;
    b(chunkPaths: string[]): Worker;
    w(wasmPath: string, imports: any, fallback: any): Promise<any>;
    u(wasmPath: string, imports: any): Promise<any>;
    m: TurbopackModule;
    c: Record<number, TurbopackModule>;
    e: Record<string, any>;
    M: Map<number, ModuleFactory>;
    g: typeof globalThis;
}

export interface TurbopackModule {
    exports: any;
    error: any;
    id: number;
    namespaceObject: any;
}

export type FilterFn = (mod: any) => boolean;

export interface TurbopackPushable {
    push: (...args: any[]) => any;
    [key: string]: any;
}

export type PatchReplacementStatus = "applied" | "noEffect" | "error" | "reverted";

export interface PatchResult {
    plugin: string;
    find: string;
    moduleId: number;
    noWarn?: boolean;
    replacements: Array<{
        match: string;
        status: PatchReplacementStatus;
    }>;
}

export interface PatchStats {
    applied: number;
    noEffect: number;
    errors: number;
    runtimeFallbacks: number;
    patchedModules: Set<number>;
}

export interface PatchReport {
    stats: Omit<PatchStats, "patchedModules"> & { patchedModules: number[] };
    results: PatchResult[];
    orphaned: Array<{ plugin: string; find: string }>;
    pending: Array<{ plugin: string; find: string }>;
}
