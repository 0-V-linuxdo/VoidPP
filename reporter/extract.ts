/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve } from "path";

import { parseArg, positionOf, skipBalanced, splitArgs, walkObjectEntries } from "./ast";
import type { SourceSpan } from "./fmt";

interface MatchLiteral {
    kind: "string" | "regex";
    value: string;
    regex?: RegExp;
    raw: string;
    span: SourceSpan;
}

export interface PatchSpec {
    plugin: string;
    file: string;
    span: SourceSpan;
    find: MatchLiteral[];
    replacement: ReplacementSpec[];
    all: boolean;
    group: boolean;
    noWarn: boolean;
}

export interface ReplacementSpec {
    match: MatchLiteral;
    replace: { kind: "string" | "function"; value: string; raw: string; span: SourceSpan };
    noWarn: boolean;
}

export type FinderKind =
    | "byProps" | "byCode" | "byDisplayName" | "byStoreName" | "byEventName" | "componentByCode"
    | "exportedComponent" | "cssClasses" | "bulk" | "mapMangled" | "unknown";

export interface FinderSpec {
    plugin: string;
    file: string;
    span: SourceSpan;
    kind: FinderKind;
    call: string;
    args: Array<{ kind: "string" | "regex" | "identifier" | "unknown"; value?: string; regex?: RegExp; raw: string }>;
}

const PLUGIN_DIR = resolve("sites/grok/plugins");
const SRC_DIR = resolve("src");

const FINDER_CALLS: Record<string, FinderKind> = {
    findByProps: "byProps",
    findByPropsLazy: "byProps",
    findByCode: "byCode",
    findByCodeLazy: "byCode",
    findByDisplayName: "byDisplayName",
    findByDisplayNameLazy: "byDisplayName",
    findStore: "byStoreName",
    findStoreLazy: "byStoreName",
    findByEventName: "byEventName",
    findByEventNameLazy: "byEventName",
    findComponentByCode: "componentByCode",
    findComponentByCodeLazy: "componentByCode",
    findExportedComponent: "exportedComponent",
    findExportedComponentLazy: "exportedComponent",
    findCssClasses: "cssClasses",
    findCssClassesLazy: "cssClasses",
    findBulk: "bulk",
    mapMangledModule: "mapMangled",
    mapMangledModuleLazy: "mapMangled",
};

const FILTER_CALLS: Record<string, FinderKind> = {
    byProps: "byProps",
    byCode: "byCode",
    byDisplayName: "byDisplayName",
    byStoreName: "byStoreName",
    componentByCode: "componentByCode",
};

const FINDER_CALL_RE = /(?:\b|\.)(findByProps(?:Lazy)?|findByCode(?:Lazy)?|findByDisplayName(?:Lazy)?|findStore(?:Lazy)?|findByEventName(?:Lazy)?|findComponentByCode(?:Lazy)?|findExportedComponent(?:Lazy)?|findCssClasses(?:Lazy)?|findBulk|mapMangledModule(?:Lazy)?)\s*\(/g;
const FILTER_CALL_RE = /\bfilters\.(byProps|byCode|byDisplayName|byStoreName|componentByCode)\s*\(/g;
const FINDER_DETECT_RE = /find(?:By|Store|Exported|Component|Css|Bulk|ModuleFactory)|mapMangledModule|filters\.|waitFor\b/;
const NAME_RE = /name:\s*"([^"]+)"/;

function walkDir(dir: string, out: string[], predicate: (path: string) => boolean): void {
    for (const name of readdirSync(dir)) {
        const full = resolve(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walkDir(full, out, predicate);
        else if (predicate(full)) out.push(full);
    }
}

export function scanPluginIndexFiles(): string[] {
    const out: string[] = [];
    if (!existsSync(PLUGIN_DIR)) return out;
    for (const name of readdirSync(PLUGIN_DIR)) {
        const dir = resolve(PLUGIN_DIR, name);
        if (!statSync(dir).isDirectory()) continue;
        pushIndex(dir, out);
        for (const sub of readdirSync(dir)) {
            const subDir = resolve(dir, sub);
            if (statSync(subDir).isDirectory()) pushIndex(subDir, out);
        }
    }
    return out;
}

function pushIndex(dir: string, out: string[]): void {
    for (const ext of [".tsx", ".ts", ".js"]) {
        const p = resolve(dir, `index${ext}`);
        if (existsSync(p)) { out.push(p); return; }
    }
}

export function scanAllSourceFiles(): string[] {
    const out: string[] = [];
    if (!existsSync(SRC_DIR)) return out;
    walkDir(SRC_DIR, out, p => /\.(?:ts|tsx)$/.test(p) && !p.endsWith(".d.ts"));
    return out;
}

function pluginNameFromSource(src: string, fallback: string): string {
    const idx = src.indexOf("definePlugin(");
    if (idx === -1) return fallback;
    return src.slice(idx).match(NAME_RE)?.[1] ?? fallback;
}

function litToFindEntry(raw: string, span: SourceSpan): MatchLiteral | null {
    const a = parseArg(raw);
    if (a.kind === "string") return { kind: "string", value: a.value ?? "", raw, span };
    if (a.kind === "regex") {
        try { return { kind: "regex", value: a.raw, regex: new RegExp(a.regex!.pattern, a.regex!.flags), raw, span }; }
        catch { return null; }
    }
    return null;
}

function litToReplace(raw: string, span: SourceSpan): ReplacementSpec["replace"] {
    const a = parseArg(raw);
    if (a.kind === "string") return { kind: "string", value: a.value ?? "", raw, span };
    return { kind: "function", value: a.raw, raw, span };
}

export function extractPatches(file: string): PatchSpec[] {
    const src = readFileSync(file, "utf-8");
    const patchesIdx = src.indexOf("patches:");
    if (patchesIdx === -1) return [];
    const bracketStart = src.indexOf("[", patchesIdx);
    if (bracketStart === -1) return [];
    const bracketEnd = skipBalanced(src, bracketStart, "[", "]");
    if (bracketEnd === src.length) return [];

    const pluginName = pluginNameFromSource(src, file);
    const body = src.slice(bracketStart + 1, bracketEnd - 1);
    const bodyOffset = bracketStart + 1;
    const out: PatchSpec[] = [];

    let i = 0;
    while (i < body.length) {
        while (i < body.length && (body[i] === "," || /\s/.test(body[i]))) i++;
        if (body[i] !== "{") { i++; continue; }
        const objStart = i;
        const objEnd = skipBalanced(body, objStart, "{", "}");
        if (objEnd === body.length) break;

        const patch = buildPatchFromObject(body.slice(objStart + 1, objEnd - 1), bodyOffset + objStart + 1, src, file, pluginName);
        if (patch) out.push(patch);
        i = objEnd;
    }
    return out;
}

function buildPatchFromObject(innerBody: string, innerAbs: number, src: string, file: string, pluginName: string): PatchSpec | null {
    const entries = walkObjectEntries(innerBody);
    const findEntries: PatchSpec["find"] = [];
    const replacements: ReplacementSpec[] = [];
    let all = false;
    let group = false;
    let noWarn = false;
    let firstFindSpan: SourceSpan | null = null;

    for (const e of entries) {
        const absOff = innerAbs + e.valueOffset;
        const pos = positionOf(src, absOff);
        const span: SourceSpan = { file, line: pos.line, col: pos.col, length: e.value.length };
        switch (e.key) {
            case "find": {
                firstFindSpan ??= span;
                const a = parseArg(e.value);
                if (a.kind === "array") {
                    for (const item of a.array ?? []) {
                        const subAbs = absOff + e.value.indexOf(item.raw);
                        const sp = positionOf(src, subAbs);
                        const entry = litToFindEntry(item.raw, { file, line: sp.line, col: sp.col, length: item.raw.length });
                        if (entry) findEntries.push(entry);
                    }
                } else {
                    const entry = litToFindEntry(e.value, span);
                    if (entry) findEntries.push(entry);
                }
                break;
            }
            case "replacement": {
                const a = parseArg(e.value);
                if (a.kind === "array") {
                    for (const item of a.array ?? []) {
                        const sub = parseReplacementObject(item.raw, absOff + e.value.indexOf(item.raw), src, file);
                        if (sub) replacements.push(sub);
                    }
                } else {
                    const single = parseReplacementObject(e.value, absOff, src, file);
                    if (single) replacements.push(single);
                }
                break;
            }
            case "all": all = /^\s*true\b/.test(e.value); break;
            case "group": group = /^\s*true\b/.test(e.value); break;
            case "noWarn": noWarn = /^\s*true\b/.test(e.value); break;
        }
    }

    if (!findEntries.length || !replacements.length) return null;
    return { plugin: pluginName, file, span: firstFindSpan ?? { file, line: 1, col: 1 }, find: findEntries, replacement: replacements, all, group, noWarn };
}

function parseReplacementObject(raw: string, offsetAbs: number, src: string, file: string): ReplacementSpec | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) return null;
    const body = trimmed.slice(1, -1);
    const bodyOffsetAbs = offsetAbs + raw.indexOf(trimmed) + 1;
    const entries = walkObjectEntries(body);
    let match: ReplacementSpec["match"] | null = null;
    let replace: ReplacementSpec["replace"] | null = null;
    let noWarn = false;
    for (const e of entries) {
        const absOff = bodyOffsetAbs + e.valueOffset;
        const pos = positionOf(src, absOff);
        const span: SourceSpan = { file, line: pos.line, col: pos.col, length: e.value.length };
        if (e.key === "match") match = litToFindEntry(e.value, span);
        else if (e.key === "replace") replace = litToReplace(e.value, span);
        else if (e.key === "noWarn") noWarn = /^\s*true\b/.test(e.value);
    }
    if (!match || !replace) return null;
    return { match, replace, noWarn };
}

export function extractFinders(file: string): FinderSpec[] {
    const src = readFileSync(file, "utf-8");
    if (!FINDER_DETECT_RE.test(src)) return [];
    const pluginName = pluginNameFromSource(src, file);
    const out: FinderSpec[] = [];

    for (const m of src.matchAll(FINDER_CALL_RE)) {
        if (m.index == null) continue;
        const prev = src[m.index - 1];
        if (prev === "\"" || prev === "'" || prev === "`") continue;
        const callName = m[1];
        const openParen = m.index + m[0].length - 1;
        const closeParen = skipBalanced(src, openParen, "(", ")");
        if (closeParen === src.length) continue;
        const args = parseFinderArgs(src.slice(openParen + 1, closeParen - 1));
        const pos = positionOf(src, m.index);
        out.push({
            plugin: pluginName, file,
            span: { file, line: pos.line, col: pos.col, length: m[0].length },
            kind: FINDER_CALLS[callName], call: callName, args,
        });
    }

    for (const m of src.matchAll(FILTER_CALL_RE)) {
        if (m.index == null) continue;
        const openParen = m.index + m[0].length - 1;
        const closeParen = skipBalanced(src, openParen, "(", ")");
        if (closeParen === src.length) continue;
        const args = parseFinderArgs(src.slice(openParen + 1, closeParen - 1));
        const pos = positionOf(src, m.index);
        out.push({
            plugin: pluginName, file,
            span: { file, line: pos.line, col: pos.col, length: m[0].length },
            kind: FILTER_CALLS[m[1]], call: `filters.${m[1]}`, args,
        });
    }
    return out;
}

function parseFinderArgs(inner: string): FinderSpec["args"] {
    return splitArgs(inner).map(part => {
        const a = parseArg(part);
        if (a.kind === "string") return { kind: "string", value: a.value, raw: a.raw };
        if (a.kind === "regex") {
            try { return { kind: "regex", regex: new RegExp(a.regex!.pattern, a.regex!.flags), raw: a.raw }; }
            catch { return { kind: "unknown", raw: a.raw }; }
        }
        if (a.kind === "identifier") return { kind: "identifier", value: a.value, raw: a.raw };
        return { kind: "unknown", raw: a.raw };
    });
}

export function collectAllPatches(): PatchSpec[] {
    const out: PatchSpec[] = [];
    for (const file of scanPluginIndexFiles()) out.push(...extractPatches(file));
    return out;
}

export function collectAllFinders(): FinderSpec[] {
    const out: FinderSpec[] = [];
    for (const file of scanAllSourceFiles()) out.push(...extractFinders(file));
    return out;
}
