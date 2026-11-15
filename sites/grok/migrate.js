// Copy Void++ GM/IDB settings into the Userscript++ store once.
import { U } from "./u.js";

const OLD_KEY = "VoidPPSettings";
const LEGACY_KEY = "VoidSettings";
const FLAG = "voidppMigrated";

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
        if (v && typeof v.then === "function") return null;
        return parseBag(v);
    } catch {
        return null;
    }
}

export function migrateVoidSettings() {
    if (!U || !U.PlainSettings || typeof U.PlainSettings !== "object" || !U.PlainSettings.plugins) return;
    const sys = U.PlainSettings.plugins.Settings ??= {};
    if (sys[FLAG]) return;

    const current = U.PlainSettings.plugins;
    const already = Object.keys(current).some(k => k !== "Settings" && current[k] && typeof current[k] === "object");
    const old = readGm(OLD_KEY) || readGm(LEGACY_KEY);
    if (!old) {
        sys[FLAG] = true;
        return;
    }

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

    sys[FLAG] = true;
    U.SettingsStore.markAsChanged?.("plugins.Settings");
}
