#!/usr/bin/env node
// Build Void++ as a Userscript++ site script.
//   node scripts/build.mjs            production bundle → userscript/VoidPP.user.js (dev channel)
//   node scripts/build.mjs --dev      local sourcemap build, includes .dev plugins
//   node scripts/build.mjs --channel voidpp-beta|voidpp-stable
import { spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, cpSync, readdirSync, statSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const isDev = args.includes("--dev");
const channelArg = (() => {
    const i = args.indexOf("--channel");
    return i >= 0 ? args[i + 1] : null;
})();

const USPP_DIR = resolve(process.env.USPP_DIR || join(root, "../uspp-publish/repo"));
if (!existsSync(join(USPP_DIR, "scripts/build.mjs"))) {
    throw new Error(`Userscript++ not found at ${USPP_DIR}. Set USPP_DIR.`);
}

const SITE = join(root, "sites/grok");
const PLUGIN_SRC = join(root, "src/plugins");
const PLUGIN_DST = join(SITE, "plugins");
const SKIP = new Set([
    "settings",           // USPP Settings + settings-host
    "chatBarButtons",     // GrokChatBar
    "contextMenu",        // GrokMenus
    "pluginsFlyout",      // settings-host avatar menu
]);

function git(cmd) {
    try {
        return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}

const GIT_HASH = git("git rev-parse --short HEAD") || "unknown";
const REPO_URL = "https://github.com/0-V-linuxdo/VoidPP";

function pluginUpdatedAt(dir) {
    const rel = relative(root, dir).replaceAll("\\", "/") || ".";
    try {
        const out = execSync(`git log --format="%ct %s" -- ${JSON.stringify(rel)}`, { cwd: root, encoding: "utf8" });
        for (const line of out.trim().split("\n")) {
            if (!line) continue;
            const space = line.indexOf(" ");
            if (space < 0) continue;
            const sec = Number.parseInt(line.slice(0, space), 10);
            let subject = line.slice(space + 1);
            const bracket = subject.indexOf("] ");
            if (subject.startsWith("[") && bracket !== -1) subject = subject.slice(bracket + 2);
            if (/^(chore|brand|docs|ci|style|test|build):/i.test(subject)) continue;
            if (Number.isFinite(sec)) return sec * 1000;
        }
    } catch { /* ignore */ }
    return 0;
}

function stagePlugins() {
    for (const name of readdirSync(PLUGIN_DST)) {
        if (name === "GrokChatBar" || name === "GrokMenus" || name === "GrokMessages") continue;
        const p = join(PLUGIN_DST, name);
        try {
            if (lstatSync(p).isSymbolicLink() || statSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
        } catch { /* ignore */ }
    }

    const stamp = [];
    const visit = (base, nested) => {
        if (!existsSync(base)) return;
        for (const entry of readdirSync(base, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith("_") && !nested) {
                if (entry.isDirectory() && (entry.name === "_core" || entry.name === "_api")) {
                    visit(join(base, entry.name), true);
                }
                continue;
            }
            if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
            if (entry.name.endsWith(".extension")) continue;
            if (entry.name.endsWith(".dev") && !isDev) continue;

            let dirName = entry.name;
            if (dirName.endsWith(".chrome")) dirName = dirName.replace(/\.chrome$/, ".chromium");

            const src = join(base, entry.name);
            if (!existsSync(join(src, "index.ts")) && !existsSync(join(src, "index.tsx")) && !existsSync(join(src, "index.js"))) continue;
            const dst = join(PLUGIN_DST, dirName);
            if (existsSync(dst)) continue;
            symlinkSync(src, dst);
            const at = pluginUpdatedAt(src);
            if (at) stamp.push({ dir: dirName, at });
        }
    };
    visit(PLUGIN_SRC, false);
    return stamp;
}

function patchUsppBuild(srcText) {
    const pluginFile = join(root, "scripts/uspp-esbuild-plugins.mjs");
    let text = srcText;
    if (!text.includes("plugins: [scopeNames(")) {
        throw new Error("USPP build.mjs does not contain plugins: [scopeNames( — cannot inject aliases");
    }
    text = text.replace(
        /^(\/\/[^\n]*\n)+/,
        m => m + `import { voidppPlugins } from ${JSON.stringify(pluginFile)};\n`,
    );
    if (!text.includes("voidppPlugins")) {
        const nl = text.indexOf("\n");
        text = text.slice(0, nl + 1) + `import { voidppPlugins } from ${JSON.stringify(pluginFile)};\n` + text.slice(nl + 1);
    }
    text = text.replace(
        "plugins: [scopeNames(",
        `plugins: [...voidppPlugins(${JSON.stringify(root)}), scopeNames(`,
    );
    return text;
}

function patchUsppCore(srcText) {
    if (srcText.includes("getRuntimeModuleCache:")) return srcText;
    const needle = "onceReady, getAllStores:";
    if (!srcText.includes(needle)) throw new Error("cannot patch USPP core api for module cache");
    return srcText.replace(
        needle,
        "onceReady, getModuleCache: () => T.moduleCache, getRuntimeModuleCache: () => T.runtime.cache, getRuntimeFactoryRegistry: () => T.runtime.registry, syncLazyModules: () => { try { T.syncRuntimeCache(); } catch {} }, rescanRuntimeModules: () => { try { T.rescanRuntimeCache(); } catch {} }, getAllStores:",
    );
}

const PREVIEW_BOOT = `(function(){
  var h = location.hostname;
  if (!(h === "grok-sandbox.com" || /\\.grok-sandbox\\.com$/.test(h) || h === "artifacts.grokusercontent.com" || /\\.grokusercontent\\.com$/.test(h))) return;
  var ID = "void-better-canvas";
  function dark() {
    try { if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return true; } catch (e) {}
    return document.documentElement.classList.contains("dark");
  }
  function css(d) {
    var thumb = d ? "#4a4a52" : "#c4c4cc", track = d ? "#141416" : "#f4f4f5", hover = d ? "#9a9aa3" : "#8a8a94", scheme = d ? "dark" : "light";
    return "html,body,:root{color-scheme:"+scheme+"!important}*{scrollbar-width:thin!important;scrollbar-color:"+thumb+" "+track+"!important}*::-webkit-scrollbar{width:.5rem!important;height:.5rem!important}*::-webkit-scrollbar-track,*::-webkit-scrollbar-corner{background:"+track+"!important}*::-webkit-scrollbar-thumb{background-color:"+thumb+"!important;background-clip:padding-box!important;border:.125rem solid transparent!important;border-radius:999px!important}*::-webkit-scrollbar-thumb:hover{background-color:"+hover+"!important}";
  }
  function paint(doc, d) {
    var el = doc.getElementById(ID);
    if (!el) { el = doc.createElement("style"); el.id = ID; (doc.head || doc.documentElement).appendChild(el); }
    el.textContent = css(d);
  }
  function tree(d) {
    (function visit(doc) {
      try { paint(doc, d); } catch (e) {}
      try {
        doc.querySelectorAll("iframe").forEach(function(frame) {
          var src = "";
          try { src = frame.getAttribute("srcdoc") || frame.srcdoc || ""; } catch (e) { return; }
          if (src) {
            var scheme = d ? "dark" : "light";
            if (!(src.indexOf('id="'+ID+'"') >= 0 && src.indexOf("color-scheme:"+scheme) >= 0)) {
              var inject = '<meta name="color-scheme" content="'+scheme+'"><style id="'+ID+'">'+css(d)+"</style>";
              try { frame.srcdoc = inject + src.replace(/<meta\\s+name=["']color-scheme["'][^>]*>/gi, "").replace(/<style\\s+id=["']void-better-canvas["']>[\\s\\S]*?<\\/style>/gi, ""); } catch (e) {}
            }
          }
          try { if (frame.contentDocument) visit(frame.contentDocument); } catch (e) {}
        });
      } catch (e) {}
    })(document);
  }
  tree(dark());
  try { new MutationObserver(function(){ tree(dark()); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["srcdoc"] }); } catch (e) {}
})();
`;

function postProcess(userJs, metaJs, environment) {
    const drop = s => s.split("\n").filter(l =>
        !/^\/\/ @(noframes|inject-into|sandbox)\b/.test(l)
        && !/^\/\/ @grant\s+GM\.(setClipboard|notification)\s*$/.test(l)
    ).join("\n");
    let user = drop(userJs);
    let meta = drop(metaJs);
    const envLine = `// @environment  ${environment}`;
    const injectEnv = s => s.replace("// @license", `${envLine}\n// @license`);
    user = injectEnv(user);
    meta = injectEnv(meta);
    const fixUpdate = s => s.replace(/^(\/\/ @updateURL\s+)(\S+)$/m, (_, p, url) => p + url.replace(/VoidPP\.meta\.js$/, "VoidPP.user.js"));
    user = fixUpdate(user);
    meta = fixUpdate(meta);
    const headerEnd = user.indexOf("// ==/UserScript==");
    if (headerEnd < 0) throw new Error("missing userscript header");
    const after = user.indexOf("\n", headerEnd) + 1;
    const body = user.slice(after);
    const trap = `try {\n${body}\n} catch (__voidppE) { try { (typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window).__VOIDPP_ERR = String(__voidppE && __voidppE.stack || __voidppE); } catch (e2) {} throw __voidppE; }\n`;
    user = user.slice(0, after) + PREVIEW_BOOT + "\n" + trap;
    return { user, meta };
}

function main() {
    if (args.includes("--postprocess-only")) {
        const userPath = join(root, "userscript/VoidPP.user.js");
        const metaPath = join(root, "userscript/VoidPP.meta.js");
        if (!existsSync(userPath)) throw new Error(`missing ${userPath}`);
        const raw = readFileSync(userPath, "utf8");
        if (raw.includes("void-better-canvas") && raw.includes("__VOIDPP_ERR") && !/^\/\/ @sandbox\b/m.test(raw)) {
            console.log(`postprocessed ${userPath}  already done, skip`);
            return;
        }
        const { user, meta } = postProcess(raw, existsSync(metaPath) ? readFileSync(metaPath, "utf8") : "", "Development");
        writeFileSync(userPath, user);
        if (existsSync(metaPath)) writeFileSync(metaPath, meta);
        mkdirSync(join(root, "dist"), { recursive: true });
        writeFileSync(join(root, "dist/VoidPP.user.js"), user);
        console.log(`postprocessed ${userPath}  ${(user.length / 1024).toFixed(1)} KB`);
        return;
    }
    const stamp = stagePlugins();
    console.log(`staged ${stamp.length} dated plugins + live symlinks in ${PLUGIN_DST}`);
    const guard = spawnSync("bun", [join(root, "scripts/grok-chunk-bench.mjs"), "--check-finds"], {
        cwd: root,
        stdio: "inherit",
    });
    if (guard.status !== 0) process.exit(guard.status ?? 1);

    const tmp = mkdtempSync(join(tmpdir(), "voidpp-uspp-"));
    try {
        cpSync(USPP_DIR, tmp, {
            recursive: true,
            dereference: true,
            filter: (src) => !src.includes(`${join(USPP_DIR, "node_modules")}`) && !src.includes(`${join(USPP_DIR, ".git")}`),
        });
        const nm = join(USPP_DIR, "node_modules");
        if (existsSync(nm) && !existsSync(join(tmp, "node_modules"))) symlinkSync(nm, join(tmp, "node_modules"));

        const buildSrc = readFileSync(join(tmp, "scripts/build.mjs"), "utf8");
        writeFileSync(join(tmp, "scripts/build.mjs"), patchUsppBuild(buildSrc));
        const coreSrc = readFileSync(join(tmp, "core/index.js"), "utf8");
        writeFileSync(join(tmp, "core/index.js"), patchUsppCore(coreSrc));

        const outDir = isDev ? join(root, "dist") : join(root, "userscript");
        mkdirSync(outDir, { recursive: true });

        let patchedBuild = readFileSync(join(tmp, "scripts/build.mjs"), "utf8");
        const defineNeedle = "__USPP_SCRIPT__: JSON.stringify(script),";
        if (!patchedBuild.includes(defineNeedle)) throw new Error("define needle missing");
        patchedBuild = patchedBuild.replace(
            defineNeedle,
            `__USPP_SCRIPT__: JSON.stringify(script),
            IS_DEV: ${JSON.stringify(String(isDev))},
            IS_EXTENSION: "false",
            VERSION: ${JSON.stringify(JSON.stringify("[" + JSON.parse(readFileSync(join(SITE, "userscript.json"), "utf8")).version + "] v1.0.0"))},
            REPO_URL: ${JSON.stringify(JSON.stringify(REPO_URL))},
            GIT_HASH: ${JSON.stringify(JSON.stringify(GIT_HASH))},`,
        );
        writeFileSync(join(tmp, "scripts/build.mjs"), patchedBuild);

        const run = spawnSync(process.execPath, [join(tmp, "scripts/build.mjs"), "--site-dir", SITE, "--out", outDir, ...(isDev ? ["--dev"] : ["--prod"]), ...(channelArg ? ["--channel", channelArg] : [])], {
            cwd: tmp,
            stdio: "inherit",
            env: { ...process.env, VOIDPP_ROOT: root },
        });
        if (run.status !== 0) process.exit(run.status ?? 1);

        const base = isDev ? "VoidPP.dev" : "VoidPP";
        const userPath = join(outDir, `${base}.user.js`);
        const metaPath = join(outDir, `${base}.meta.js`);
        if (!existsSync(userPath)) throw new Error(`missing ${userPath}`);
        const environment = channelArg === "voidpp-stable" ? "Production" : channelArg === "voidpp-beta" ? "Beta" : isDev ? "Development" : "Development";
        const { user, meta } = postProcess(readFileSync(userPath, "utf8"), existsSync(metaPath) ? readFileSync(metaPath, "utf8") : "", environment);
        writeFileSync(userPath, user);
        if (existsSync(metaPath)) writeFileSync(metaPath, meta);
        if (!isDev) {
            mkdirSync(join(root, "dist"), { recursive: true });
            writeFileSync(join(root, "dist/VoidPP.user.js"), user);
        }
        console.log(`Void++ ${base}.user.js  ${(user.length / 1024).toFixed(1)} KB  ${environment}`);
    } finally {
        try { rmSync(join(tmp, "node_modules"), { force: true }); } catch { /* symlink */ }
    }
}

main();
