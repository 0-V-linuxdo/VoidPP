#!/usr/bin/env bun
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseModulesFromChunk } from "../reporter/chunks.ts";
import { collectAllPatches, extractPatches } from "../reporter/extract.ts";
import { canonicalizeMatch } from "../src/utils/patches.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".voidpp-cache/grok-chunks");
const SLOW_MS = 50;

function loadPatches() {
    return [
        ...collectAllPatches(),
        ...extractPatches(join(ROOT, "sites/grok/plugins/GrokMenus/index.js")),
        ...extractPatches(join(ROOT, "sites/grok/plugins/GrokChatBar/index.js")),
        ...extractPatches(join(ROOT, "sites/grok/settings-host.js")),
    ];
}

function regexLead(source) {
    let i = 0;
    if (source[i] === "^") i++;
    for (;;) {
        if (source.startsWith("(?:", i)) {
            i += 3;
            continue;
        }
        if (source[i] === "(" && source[i + 1] !== "?") {
            i += 1;
            continue;
        }
        break;
    }
    if (source.startsWith("\\i", i)) return "\\i";
    if (source[i] === "[") return "character-class";
    return null;
}

function checkRegexFinds(patches) {
    const fails = [];
    const matchWarns = [];
    for (const p of patches) {
        for (const f of p.find) {
            if (f.kind !== "regex" || !f.regex) continue;
            const kind = regexLead(f.regex.source);
            if (kind) fails.push({ plugin: p.plugin, file: p.file, kind, raw: f.raw });
        }
        for (const r of p.replacement) {
            if (r.match.kind !== "regex" || !r.match.regex) continue;
            if (regexLead(r.match.regex.source) === "\\i") {
                matchWarns.push({ plugin: p.plugin, raw: r.match.raw });
            }
        }
    }
    for (const w of matchWarns) console.warn(`WARN match starts with \\i  ${w.plugin}  ${w.raw}`);
    if (fails.length) {
        for (const f of fails) console.error(`FAIL find starts with ${f.kind}  ${f.plugin}  ${f.raw}`);
        throw new Error(`${fails.length} regex find(s) start with \\i or a character class`);
    }
    console.log(`find-guard ok  patches ${patches.length}  match-\\i-warn ${matchWarns.length}`);
}

function moduleMatchesFind(factory, finds) {
    for (const f of finds) {
        if (f.kind === "string") {
            if (!factory.includes(f.value)) return false;
        } else {
            const re = canonicalizeMatch(f.regex);
            re.lastIndex = 0;
            if (!re.test(factory)) return false;
        }
    }
    return true;
}

function now() {
    return performance.now();
}

function main() {
    const patches = loadPatches();
    checkRegexFinds(patches);
    if (process.argv.includes("--check-finds")) return;

    mkdirSync(OUT, { recursive: true });
    const files = readdirSync(OUT).filter(n => n.endsWith(".js") && !n.startsWith("_"));
    const modules = new Map();
    const fileOf = new Map();
    for (const name of files) {
        const source = readFileSync(join(OUT, name), "utf8");
        const parsed = parseModulesFromChunk(source);
        if (!parsed.length) {
            const id = modules.size + 1e9;
            modules.set(id, { id, factory: source, chunkName: name });
            fileOf.set(id, name);
            continue;
        }
        for (const { id, offset, length } of parsed) {
            if (modules.has(id)) continue;
            modules.set(id, { id, factory: source.slice(offset, offset + length), chunkName: name });
            fileOf.set(id, name);
        }
    }
    console.log(`files ${files.length}  modules ${modules.size}`);

    const slow = [];
    const rows = [];
    for (const p of patches) {
        const findLabel = p.find.map(f => f.value ?? f.raw).join(" | ").slice(0, 90);
        const tFind = now();
        const matched = [];
        for (const mod of modules.values()) {
            if (moduleMatchesFind(mod.factory, p.find)) matched.push(mod);
        }
        const findMs = now() - tFind;
        if (findMs >= SLOW_MS) {
            const line = `SLOW FIND ${findMs.toFixed(1)}ms  ${p.plugin}  ${findLabel}  modules=${matched.length}`;
            console.log(line);
            slow.push({ kind: "find", ms: findMs, plugin: p.plugin, find: findLabel, matched: matched.length });
        }

        const reps = [];
        for (let i = 0; i < p.replacement.length; i++) {
            const r = p.replacement[i];
            let compiled = null;
            if (r.match.kind === "regex") {
                try { compiled = canonicalizeMatch(r.match.regex); }
                catch (e) {
                    reps.push({ i, noWarn: r.noWarn, error: String(e), hits: 0, modules: [], testMs: 0, replaceMs: 0 });
                    continue;
                }
            }
            const hitMods = [];
            let testMs = 0;
            let replaceMs = 0;
            for (const mod of matched) {
                const tTest = now();
                let ok = false;
                if (compiled) {
                    compiled.lastIndex = 0;
                    ok = compiled.test(mod.factory);
                } else {
                    ok = mod.factory.includes(r.match.value);
                }
                testMs += now() - tTest;
                if (!ok) continue;
                hitMods.push({ id: mod.id, file: fileOf.get(mod.id), bytes: mod.factory.length });
                const tRep = now();
                if (compiled) {
                    compiled.lastIndex = 0;
                    mod.factory.replace(compiled, "$&");
                }
                replaceMs += now() - tRep;
            }
            const matchLabel = (r.match.value ?? r.match.raw).slice(0, 120);
            if (testMs >= SLOW_MS || replaceMs >= SLOW_MS) {
                const line = `SLOW MATCH test=${testMs.toFixed(1)}ms replace=${replaceMs.toFixed(1)}ms hits=${hitMods.length}  ${p.plugin}  ${matchLabel}`;
                console.log(line);
                slow.push({
                    kind: "match",
                    testMs,
                    replaceMs,
                    plugin: p.plugin,
                    match: matchLabel,
                    hits: hitMods.length,
                    files: [...new Set(hitMods.map(m => m.file))],
                    bytes: hitMods.map(m => m.bytes),
                });
            }
            reps.push({
                i,
                noWarn: r.noWarn,
                match: matchLabel,
                hits: hitMods.length,
                modules: hitMods.slice(0, 6),
                testMs,
                replaceMs,
            });
        }
        const anyHit = reps.some(r => r.hits > 0);
        const liveMiss = reps.filter(r => r.hits === 0 && !r.noWarn && !p.noWarn);
        const legacyMiss = reps.filter(r => r.hits === 0 && (r.noWarn || p.noWarn));
        rows.push({
            plugin: p.plugin,
            file: p.file.replace(ROOT + "/", ""),
            noWarn: p.noWarn,
            find: findLabel,
            findMs,
            matched: matched.length,
            matchedFiles: [...new Set(matched.slice(0, 8).map(m => fileOf.get(m.id)))],
            anyHit,
            liveMiss: liveMiss.map(r => r.match),
            legacyMiss: legacyMiss.map(r => r.match),
            reps,
        });
    }

    writeFileSync(join(OUT, "_patch-report.json"), JSON.stringify({ slow, rows }, null, 2));
    const real = rows.filter(r => r.liveMiss.length);
    const fullyApplied = rows.filter(r => r.matched && r.reps.every(x => x.hits > 0 || x.noWarn || r.noWarn));
    console.log(`patches ${rows.length}  fully-ok ${fullyApplied.length}  live-miss-patches ${real.length}  slow ${slow.length}`);
    for (const r of real) {
        console.log(`REAL ${r.plugin}  find=${r.find}  modules=${r.matched}  miss=${r.liveMiss.length}`);
        for (const m of r.liveMiss) console.log(`    ${m}`);
    }
}

main();
