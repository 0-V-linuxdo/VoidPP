/*
 * Void++ plugin types on Userscript++.
 * Plugins keep `export default definePlugin({...})`; this returns the Userscript++
 * factory `U => U.definePlugin(def)`, so every plugin entry is a factory that only
 * touches the framework through its own `U`.
 */
export const StartAt = Object.freeze({
    Init: "Init",
    DOMContentLoaded: "DOMContentLoaded",
    SiteReady: "SiteReady",
    TurbopackReady: "SiteReady",
});

export const OptionType = Object.freeze({
    STRING: 0,
    NUMBER: 1,
    BIGINT: 2,
    BOOLEAN: 3,
    SELECT: 4,
    SLIDER: 5,
    COMPONENT: 6,
    CUSTOM: 7,
});

export default function definePlugin<T extends object>(def: T): (U: { definePlugin: (d: T) => T }) => T {
    return U => U.definePlugin(def);
}
