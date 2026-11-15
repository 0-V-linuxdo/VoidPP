// Copy Void++ GM/IDB settings into the Userscript++ store once.
import { U } from "./u.js";

const OLD_KEY = "VoidPPSettings";
const LEGACY_KEY = "VoidSettings";
const FLAG = "voidppMigrated";
const ENABLE_FLAG = "voidppEnabledBackfill";
const RENAME = {
    AvatarPluginsFlyout: "ConnectorsFlyout",
    BetterAvatarPlugins: "ConnectorsFlyout",
    NoSidebarPlugins: "ConnectorsFlyout",
};
const SKIP = new Set(["ChatBarButtonAPI", "ContextMenuAPI", "Settings", "Plugins"]);

function parseBag(raw) {
    try {
        let v = raw;
        for (let i = 0; i < 3 && typeof v === "string"; i++) v = JSON.parse(v);
        if (v && typeof v === "object" && v.plugins && typeof v.plugins === "object") return v;
    } catch { /* ignore */ }
    return null;
}

function readGm(key) {
    try {
        if (typeof GM_getValue !== "function") return null;
        const v = GM_getValue(key, null);
        if (v && typeof v.then === "function") return v.then(parseBag).catch(() => null);
        return parseBag(v);
    } catch {
        return null;
    }
}

function readLocal(key) {
    try { return parseBag(localStorage.getItem(key)); } catch { return null; }
}

function idbGet(dbName, key) {
    return new Promise(resolve => {
        try {
            const req = indexedDB.open(dbName);
            req.onerror = () => resolve(null);
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("kv")) { resolve(null); return; }
                const g = db.transaction("kv", "readonly").objectStore("kv").get(key);
                g.onsuccess = () => resolve(g.result ?? null);
                g.onerror = () => resolve(null);
            };
        } catch { resolve(null); }
    });
}

function applyEnabled(oldPlugins) {
    if (!oldPlugins || !U?.PlainSettings?.plugins) return 0;
    let n = 0;
    for (const [name, bag] of Object.entries(oldPlugins)) {
        if (!bag || typeof bag !== "object" || bag.enabled !== true) continue;
        const dest = RENAME[name] || name;
        if (SKIP.has(dest) || dest === "Settings") continue;
        const cur = U.PlainSettings.plugins[dest] ??= {};
        if (cur.enabled === false || cur.enabled === true) continue;
        cur.enabled = true;
        n++;
        U.SettingsStore.markAsChanged?.(`plugins.${dest}`);
        try { U.setPluginEnabled?.(dest, true); } catch { /* plugins may not be registered yet */ }
    }
    return n;
}

function backfillEnabled() {
    const sys = U.PlainSettings.plugins.Settings ??= {};
    if (sys[ENABLE_FLAG]) return;
    const mark = () => {
        sys[ENABLE_FLAG] = true;
        U.SettingsStore.markAsChanged?.("plugins.Settings");
    };
    const fromSync = parseBag(readLocal(OLD_KEY)) || parseBag(readLocal(LEGACY_KEY));
    if (fromSync) applyEnabled(fromSync.plugins);
    const gm = readGm(OLD_KEY) || readGm(LEGACY_KEY);
    const gmWait = gm && typeof gm.then === "function"
        ? gm.then(bag => { if (bag) applyEnabled(bag.plugins); })
        : (gm && applyEnabled(gm.plugins), Promise.resolve());
    Promise.all([
        gmWait,
        idbGet("VoidPP", OLD_KEY).then(parseBag).then(bag => { if (bag) applyEnabled(bag.plugins); }),
        idbGet("Void", LEGACY_KEY).then(parseBag).then(bag => { if (bag) applyEnabled(bag.plugins); }),
    ]).then(mark).catch(mark);
}

export function migrateVoidSettings() {
    if (!U || !U.PlainSettings || typeof U.PlainSettings !== "object" || !U.PlainSettings.plugins) return;
    const sys = U.PlainSettings.plugins.Settings ??= {};
    if (!sys[FLAG]) {
        const current = U.PlainSettings.plugins;
        const already = Object.keys(current).some(k => k !== "Settings" && current[k] && typeof current[k] === "object");
        const old = (() => {
            const g = readGm(OLD_KEY) || readGm(LEGACY_KEY);
            if (g && typeof g.then === "function") return null;
            return g || readLocal(OLD_KEY) || readLocal(LEGACY_KEY);
        })();
        if (old) {
            const oldPlugins = old.plugins || {};
            if (!already) {
                for (const [name, bag] of Object.entries(oldPlugins)) {
                    if (name === "Settings" || !bag || typeof bag !== "object") continue;
                    U.PlainSettings.plugins[name] ??= { ...bag };
                    U.SettingsStore.markAsChanged?.(`plugins.${name}`);
                }
            }
            const oldSys = oldPlugins.Settings || {};
            if (typeof oldSys.showVoidPPMenu === "boolean" && sys.showSiteEntry == null) {
                sys.showSiteEntry = oldSys.showVoidPPMenu;
            }
            for (const key of ["pinnedPlugins", "starredPlugins", "knownPlugins"]) {
                if (sys[key] == null && oldSys[key] != null) sys[key] = oldSys[key];
            }
            const sites = sys.sites && typeof sys.sites === "object" ? sys.sites : (sys.sites = {});
            const grok = sites.grok && typeof sites.grok === "object" ? sites.grok : (sites.grok = {});
            if (!Array.isArray(grok.themes) && Array.isArray(oldSys.themes)) grok.themes = oldSys.themes;
            if (grok.quickCss == null && typeof oldSys.customCSS === "string") grok.quickCss = oldSys.customCSS;
            if (grok.quickCssEnabled == null && typeof oldSys.customCSSEnabled === "boolean") grok.quickCssEnabled = oldSys.customCSSEnabled;
            if (sys.themesEnabled == null && typeof oldSys.themesEnabled === "boolean") sys.themesEnabled = oldSys.themesEnabled;
        }
        sys[FLAG] = true;
        U.SettingsStore.markAsChanged?.("plugins.Settings");
    }
    backfillEnabled();
}
