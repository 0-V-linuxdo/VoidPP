// @ts-nocheck
import { U, whenApi } from "../../u.js";
import { OptionType } from "../utils/types.ts";

function api() {
    return U;
}

export function definePluginSettings(def, checks) {
    const ds = {
        def,
        checks: checks ?? {},
        pluginName: null,
        get store() {
            if (!this.pluginName) throw new Error("插件注册前不能访问 settings.store");
            return api().Settings.plugins[this.pluginName];
        },
        get plain() {
            if (!this.pluginName) throw new Error("插件注册前不能访问 settings.plain");
            return api().PlainSettings.plugins[this.pluginName] ??= {};
        },
        use(keys) {
            const React = api().findReact?.() || api().react;
            const [, force] = React.useReducer(x => x + 1, 0);
            const name = this.pluginName;
            React.useEffect(() => {
                const prefix = `plugins.${name}.`;
                const fn = (_, path) => {
                    const key = path.slice(prefix.length).split(".")[0];
                    if (!keys || keys.includes(key)) force();
                };
                api().SettingsStore.addPrefixChangeListener(prefix, fn);
                return () => api().SettingsStore.removePrefixChangeListener?.(prefix, fn);
            }, [name]);
            return this.store;
        },
        withPrivateSettings() { return this; },
    };
    return ds;
}

export const Settings = new Proxy({}, {
    get(_, key) { return api().Settings[key]; },
    set(_, key, value) { api().Settings[key] = value; return true; },
    ownKeys() { return Reflect.ownKeys(api().Settings); },
    getOwnPropertyDescriptor(_, key) {
        return { configurable: true, enumerable: true, value: api().Settings[key] };
    },
});

export const PlainSettings = new Proxy({}, {
    get(_, key) { return api().PlainSettings[key]; },
    set(_, key, value) { api().PlainSettings[key] = value; return true; },
    ownKeys() { return Reflect.ownKeys(api().PlainSettings); },
    getOwnPropertyDescriptor(_, key) {
        return { configurable: true, enumerable: true, value: api().PlainSettings[key] };
    },
});

export const SettingsStore = new Proxy({}, {
    get(_, key) {
        const s = api().SettingsStore;
        if (key in s) return s[key].bind?.(s) ?? s[key];
        if (key === "store") return api().Settings;
        if (key === "plain") return api().PlainSettings;
        if (key === "markReady" || key === "flush") return () => {};
        return undefined;
    },
});

export const pluginPath = (name, key) => key ? `plugins.${name}.${key}` : `plugins.${name}`;

export function migratePluginSettings(name, ...oldNames) {
    return api().migratePluginSettings(name, ...oldNames);
}
export function migratePluginSetting(pluginName, newKey, oldKey) {
    return api().migratePluginSetting(pluginName, newKey, oldKey);
}
export function migrateSettingsToPlugin(targetPlugin, sourcePlugin, ...settingKeys) {
    const run = () => {
        if (!U) return;
        const source = U.PlainSettings.plugins[sourcePlugin];
        if (!source) return;
        const target = U.PlainSettings.plugins[targetPlugin] ??= { enabled: false };
        for (const key of settingKeys) {
            if (key in source && !(key in target)) {
                target[key] = source[key];
                delete source[key];
            }
        }
        U.SettingsStore.markAsChanged?.(`plugins.${targetPlugin}`);
    };
    if (!U) { whenApi(run); return; }
    run();
}

export function getSettingsPluginData() {
    return api().Settings.plugins.Settings ?? {};
}
export function updateSettingsPluginData(patch) {
    Object.assign(api().Settings.plugins.Settings ??= { enabled: true }, patch);
    api().SettingsStore.markAsChanged?.("plugins.Settings");
}
export function mergePluginSettings(name, patch) {
    Object.assign(api().Settings.plugins[name] ??= {}, patch);
    api().SettingsStore.markAsChanged?.(`plugins.${name}`);
}
export function getPinnedPlugins() {
    const v = getSettingsPluginData().pinnedPlugins;
    return Array.isArray(v) ? v : [];
}
export function getStarredPlugins() {
    const v = getSettingsPluginData().starredPlugins;
    return Array.isArray(v) ? v : [];
}
export function isPluginPinned(name) { return getPinnedPlugins().includes(name); }
export function isPluginStarred(name) { return getStarredPlugins().includes(name); }
export function togglePluginPinned(name) {
    const list = getPinnedPlugins().filter(n => n !== name);
    if (!getPinnedPlugins().includes(name)) list.unshift(name);
    updateSettingsPluginData({ pinnedPlugins: list });
    return list.includes(name);
}
export function togglePluginStarred(name) {
    const cur = getStarredPlugins();
    const on = cur.includes(name);
    const list = on ? cur.filter(n => n !== name) : [...cur, name];
    updateSettingsPluginData({ starredPlugins: list });
    return !on;
}
export function resolveDefault(setting) {
    if (!setting) return undefined;
    if (setting.type === 4) return setting.options?.find(o => o.default)?.value;
    return setting.default;
}

export function primeSettingsSync() {}
export function initSettings() { return Promise.resolve(); }
export { OptionType };
