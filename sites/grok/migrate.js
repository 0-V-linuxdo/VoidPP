// Copy Void++ GM/IDB settings into the Userscript++ store once.
import { U } from "./u.js";

const OLD_KEY = "VoidPPSettings";
const LEGACY_KEY = "VoidSettings";
const FLAG = "voidppValuesBackfill";
const RENAME = {
    AvatarPluginsFlyout: "ConnectorsFlyout",
    BetterAvatarPlugins: "ConnectorsFlyout",
    NoSidebarPlugins: "ConnectorsFlyout",
};
const SKIP = new Set(["ChatBarButtonAPI", "ContextMenuAPI", "Settings", "Plugins", "PluginsFlyout"]);
const GLOBALS = [
    ["showVoidPPMenu", "showSiteEntry"],
    ["pinnedPlugins", "pinnedPlugins"],
    ["starredPlugins", "starredPlugins"],
    ["knownPlugins", "knownPlugins"],
    ["themesEnabled", "themesEnabled"],
    ["onlineThemesEnabled", "onlineThemesEnabled"],
    ["themes", "sites.grok.themes"],
    ["customCSS", "sites.grok.customCSS"],
    ["customCSSEnabled", "sites.grok.customCSSEnabled"],
];

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

const getIn = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

function setIn(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    let o = obj;
    for (const k of keys) o = o[k] && typeof o[k] === "object" ? o[k] : (o[k] = {});
    o[last] = value;
}

function fill(bag, had, touched) {
    if (!bag?.plugins) return;
    const { plugins } = U.PlainSettings;
    for (const [name, entry] of Object.entries(bag.plugins)) {
        const dest = RENAME[name] || name;
        if (SKIP.has(dest) || !entry || typeof entry !== "object") continue;
        for (const [key, value] of Object.entries(entry)) {
            const path = `${dest}.${key}`;
            if ((key === "enabled" && value !== true) || had.has(path) || touched.has(path)) continue;
            (plugins[dest] ??= {})[key] = value;
            touched.add(path);
        }
    }
    const oldSys = bag.plugins.Settings ?? {};
    for (const [from, to] of GLOBALS) {
        const path = `Settings.${to}`;
        if (oldSys[from] == null || had.has(path) || touched.has(path)) continue;
        setIn(plugins.Settings ??= {}, to, oldSys[from]);
        touched.add(path);
    }
}

function isDefault(path) {
    const [name, key] = path.split(".");
    const s = U.plugins[name]?.settings?.def?.[key];
    const def = s?.type === U.OptionType.SELECT ? s.options?.find(o => o.default)?.value : s?.default;
    return def !== undefined && JSON.stringify(def) === JSON.stringify(getIn(U.PlainSettings.plugins, path));
}

function persist(touched) {
    for (const path of touched) {
        if (!U.plugins[path.split(".")[0]] || isDefault(path)) continue;
        U.SettingsStore.markAsChanged(`plugins.${path}`);
    }
    (U.PlainSettings.plugins.Settings ??= {})[FLAG] = true;
    U.SettingsStore.markAsChanged(`plugins.Settings.${FLAG}`);
}

export function migrateVoidSettings() {
    const plugins = U.PlainSettings?.plugins;
    if (!plugins || plugins.Settings?.[FLAG]) return;
    const had = new Set();
    for (const [name, entry] of Object.entries(plugins)) {
        if (entry && typeof entry === "object") for (const key of Object.keys(entry)) had.add(`${name}.${key}`);
    }
    for (const [, to] of GLOBALS) if (getIn(plugins.Settings, to) != null) had.add(`Settings.${to}`);
    const touched = new Set();
    const gm = [readGm(OLD_KEY), readGm(LEGACY_KEY)];
    for (const bag of [...gm, readLocal(OLD_KEY), readLocal(LEGACY_KEY)]) fill(bag, had, touched);
    Promise.all([
        ...gm,
        idbGet("VoidPP", OLD_KEY).then(parseBag),
        idbGet("Void", LEGACY_KEY).then(parseBag),
        U.onceReady,
    ]).then(bags => {
        for (const bag of bags) fill(bag, had, touched);
        persist(touched);
    });
}
