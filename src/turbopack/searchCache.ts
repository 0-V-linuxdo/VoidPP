/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { matchesAllPatterns } from "./match";
import { getRuntimeFactoryRegistry } from "./patchTurbopack";

const META = Symbol.for("uspp.voidpp.factory");
const srcById = new Map<string | number, string>();
const hitsByKey = new Map<string, { out: Record<string, unknown>; seen: Set<string | number> }>();

function factorySource(id: string | number, factory: unknown): string {
    const cached = srcById.get(id);
    if (cached !== undefined) return cached;
    const orig = (factory as { [META]?: { original?: unknown } })?.[META]?.original ?? factory;
    let src = "";
    try {
        src = typeof orig === "function" ? Function.prototype.toString.call(orig) : String(orig);
    } catch {
        src = "";
    }
    srcById.set(id, src);
    return src;
}

function eachFactory(fn: (id: string | number, factory: unknown) => void) {
    const reg = getRuntimeFactoryRegistry();
    if (reg == null) return;
    if (reg instanceof Map) {
        for (const [id, factory] of reg) fn(id, factory);
        return;
    }
    if (typeof reg !== "object") return;
    const obj = reg as Record<string, unknown>;
    for (const id of Object.keys(obj)) fn(Number.isNaN(+id) ? id : +id, obj[id]);
}

export function searchFactories(...patterns: Array<string | RegExp>): Record<string, unknown> {
    const key = patterns.map(String).join("\0");
    let state = hitsByKey.get(key);
    if (!state) {
        state = { out: {}, seen: new Set() };
        hitsByKey.set(key, state);
    }
    eachFactory((id, factory) => {
        if (state.seen.has(id) || typeof factory !== "function") return;
        state.seen.add(id);
        const src = factorySource(id, factory);
        if (!src || !matchesAllPatterns(src, patterns)) return;
        state.out[id as string] = factory;
    });
    return state.out;
}
