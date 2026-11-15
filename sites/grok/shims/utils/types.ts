/* Void++ types on Userscript++. StartAt.TurbopackReady maps to SiteReady. */
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

export default function definePlugin(p) {
    return p;
}
