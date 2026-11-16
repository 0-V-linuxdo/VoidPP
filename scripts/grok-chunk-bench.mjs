#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseModulesFromChunk } from "../reporter/chunks.ts";
import { collectAllPatches, extractPatches } from "../reporter/extract.ts";
import { canonicalizeMatch } from "../src/utils/patches.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".voidpp-cache/grok-chunks");

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

function main() {
    mkdirSync(OUT, { recursive: true });
    const files = readdirSync(OUT).filter(n => n.endsWith(".js"));
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

    const patches = [
        ...collectAllPatches(),
        ...extractPatches(join(ROOT, "sites/grok/plugins/GrokMenus/index.js")),
        ...extractPatches(join(ROOT, "sites/grok/plugins/GrokChatBar/index.js")),
        ...extractPatches(join(ROOT, "sites/grok/settings-host.js")),
    ];

    const rows = [];
    for (const p of patches) {
        const matched = [];
        for (const mod of modules.values()) {
            if (moduleMatchesFind(mod.factory, p.find)) matched.push(mod);
        }
        const reps = [];
        for (let i = 0; i < p.replacement.length; i++) {
            const r = p.replacement[i];
            let compiled = null;
            if (r.match.kind === "regex") {
                try { compiled = canonicalizeMatch(r.match.regex); }
                catch (e) {
                    reps.push({ i, noWarn: r.noWarn, error: String(e), hits: 0, modules: [] });
                    continue;
                }
            }
            const hitMods = [];
            for (const mod of matched) {
                let ok = false;
                if (compiled) {
                    compiled.lastIndex = 0;
                    ok = compiled.test(mod.factory);
                } else {
                    ok = mod.factory.includes(r.match.value);
                }
                if (ok) hitMods.push({ id: mod.id, file: fileOf.get(mod.id) });
            }
            reps.push({
                i,
                noWarn: r.noWarn,
                match: (r.match.value ?? r.match.raw).slice(0, 120),
                hits: hitMods.length,
                modules: hitMods.slice(0, 6),
            });
        }
        const find = p.find.map(f => f.value ?? f.raw).join(" | ").slice(0, 90);
        const anyHit = reps.some(r => r.hits > 0);
        const liveMiss = reps.filter(r => r.hits === 0 && !r.noWarn && !p.noWarn);
        const legacyMiss = reps.filter(r => r.hits === 0 && (r.noWarn || p.noWarn));
        rows.push({
            plugin: p.plugin,
            file: p.file.replace(ROOT + "/", ""),
            noWarn: p.noWarn,
            find,
            matched: matched.length,
            matchedFiles: [...new Set(matched.slice(0, 8).map(m => fileOf.get(m.id)))],
            anyHit,
            liveMiss: liveMiss.map(r => r.match),
            legacyMiss: legacyMiss.map(r => r.match),
            reps,
        });
    }

    writeFileSync(join(OUT, "_patch-report.json"), JSON.stringify(rows, null, 2));
    const real = rows.filter(r => r.liveMiss.length);
    const fullyApplied = rows.filter(r => r.matched && r.reps.every(x => x.hits > 0 || x.noWarn || r.noWarn));
    console.log(`patches ${rows.length}  fully-ok ${fullyApplied.length}  live-miss-patches ${real.length}`);
    for (const r of real) {
        console.log(`REAL ${r.plugin}  find=${r.find}  modules=${r.matched}  miss=${r.liveMiss.length}`);
        for (const m of r.liveMiss) console.log(`    ${m}`);
    }
}

main();
