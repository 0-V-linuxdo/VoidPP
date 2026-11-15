import { U } from "./u.js";
import { common } from "./common.js";

function asMenuFn(v) {
    if (typeof v === "function") return v;
    if (v && typeof v === "object" && ("render" in v || "$$typeof" in v)) return v;
    return null;
}

function fnSrc(fn) {
    try { return Function.prototype.toString.call(fn); } catch { return ""; }
}

function readAccountMenuKit(mod) {
    if (!mod || typeof mod !== "object") return null;
    const buckets = [mod];
    for (const key of Object.getOwnPropertyNames(mod)) {
        try { buckets.push(mod[key]); } catch { /* getter */ }
    }
    for (const obj of buckets) {
        if (!obj || typeof obj !== "object" || !("SubmenuTrigger" in obj)) continue;
        const trigger = asMenuFn(obj.SubmenuTrigger);
        if (!trigger) continue;
        const src = fnSrc(trigger);
        if (!src.includes("Menu.SubmenuTrigger") || src.includes("__scope")) continue;
        const item = asMenuFn(obj.Item);
        const content = asMenuFn(obj.SubmenuContent);
        const root = asMenuFn(obj.SubmenuRoot);
        if (!item || !content || !root || !fnSrc(item).includes("Menu.Item")) continue;
        const mapped = { Sub: root, Trigger: trigger, Content: content, Item: item, desktop: true };
        const sep = asMenuFn(obj.Separator);
        if (sep) mapped.Separator = sep;
        return mapped;
    }
    return null;
}

export function accountMenuParts() {
    try {
        const cache = typeof U.getModuleCache === "function" ? U.getModuleCache() : null;
        if (cache) {
            for (const [, exp] of cache) {
                const hit = readAccountMenuKit(exp);
                if (hit) return hit;
            }
        }
        const ids = Object.keys(U.search?.("Menu.SubmenuTrigger") || {});
        for (const id of ids) {
            const mod = typeof U.requireModule === "function" ? U.requireModule(Number(id)) : null;
            const hit = readAccountMenuKit(mod);
            if (hit) return hit;
        }
    } catch { /* kit not loaded yet */ }
    return {
        Sub: common.DropdownMenuSub,
        Trigger: common.DropdownMenuSubTrigger,
        Content: common.DropdownMenuSubContent,
        Item: common.DropdownMenuItem,
        Separator: common.DropdownMenuSeparator,
        desktop: false,
    };
}

export function accountMenuSelect(desktop, run) {
    return desktop ? { onClick: run } : { onSelect: run };
}
