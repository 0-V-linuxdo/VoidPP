import { U } from "../../u.js";

function api() {
    if (!U) throw new Error("Userscript++ API is not bound yet");
    return U;
}

export const plugins = new Proxy({}, {
    get(_, key) { return api().plugins[key]; },
    ownKeys() { return Reflect.ownKeys(api().plugins); },
    getOwnPropertyDescriptor(_, key) {
        return { configurable: true, enumerable: true, value: api().plugins[key] };
    },
});

export const isPluginEnabled = name => api().isPluginEnabled(name);
export const togglePlugin = name => api().togglePlugin(name);
export function startPlugin(plugin, _force) {
    const name = typeof plugin === "string" ? plugin : plugin?.name;
    return api().startPlugin(name);
}
export function stopPlugin(plugin) {
    const name = typeof plugin === "string" ? plugin : plugin?.name;
    return api().stopPlugin(name);
}
export function registerPlugin(def) { return api().registerPlugin(def); }
export function addPatch(patch, pluginName) { return api().addPatch(patch, pluginName); }
export function isNewPlugin(name) {
    const p = api().plugins[name];
    if (!p?.updatedAt) return false;
    return Date.now() - p.updatedAt < 7 * 24 * 60 * 60 * 1000;
}
export function initPluginManager() {}
export function registerEnabledPatches() {}
export function retryFailedPlugins() {}
export function startAllPlugins() {}
