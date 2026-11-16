import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function voidppPlugins(srcRoot) {
    const site = join(srcRoot, "sites/grok");
    const ALIASES = {
        "@utils/types": join(site, "shims/utils/types.ts"),
        "@utils/css": join(site, "shims/utils/css.ts"),
        "@api/Settings": join(site, "shims/api/Settings.ts"),
        "@api/PluginManager": join(site, "shims/api/PluginManager.ts"),
        "@api/Events": join(site, "shims/api/Events.ts"),
        "@api/Themes": join(site, "shims/api/Themes.ts"),
        "@api/ChatBarButtons": join(site, "shims/api/ChatBarButtons.ts"),
        "@api/ContextMenus": join(site, "shims/api/ContextMenus.ts"),
        "@api/Notifications": join(site, "shims/api/Notifications.ts"),
        "@api/Notices": join(site, "shims/api/Notices.ts"),
        "@api/Modals": join(site, "shims/api/Modals.ts"),
        "@api/StreamEvents": join(site, "shims/api/StreamEvents.ts"),
        "@api/BuildHealth": join(site, "shims/api/BuildHealth.ts"),
        react: join(site, "shims/react.ts"),
    };
    const aliasFilter = new RegExp(`^(${Object.keys(ALIASES).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`);
    const firstExisting = (base, exts) => {
        for (const ext of exts) {
            if (existsSync(base + ext)) return { path: base + ext };
        }
        return { path: base };
    };
    return [
        {
            name: "voidpp-alias",
            setup(b) {
                b.onResolve({ filter: aliasFilter }, args => ({ path: ALIASES[args.path] }));
                b.onResolve({ filter: /^@components$/ }, () => ({ path: join(srcRoot, "src/components/index.ts") }));
                b.onResolve({ filter: /^@components\// }, args => firstExisting(join(srcRoot, "src/components", args.path.slice("@components/".length)), ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]));
                b.onResolve({ filter: /^@utils\// }, args => {
                    if (args.path === "@utils/types") return { path: ALIASES["@utils/types"] };
                    return firstExisting(join(srcRoot, "src/utils", args.path.slice("@utils/".length)), ["", ".ts", ".tsx", ".js"]);
                });
                b.onResolve({ filter: /^@turbopack\// }, args => firstExisting(join(srcRoot, "src/turbopack", args.path.slice("@turbopack/".length)), ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]));
                b.onResolve({ filter: /^@grok-types$/ }, () => firstExisting(join(srcRoot, "packages/grok-types/index"), [".ts", ".d.ts"]));
                b.onResolve({ filter: /^@grok-types\// }, args => firstExisting(join(srcRoot, "packages/grok-types", args.path.slice("@grok-types/".length)), ["", ".ts", ".d.ts", "/index.ts", "/index.d.ts"]));
                b.onResolve({ filter: /^@plugins\// }, args => firstExisting(join(srcRoot, "src/plugins", args.path.slice("@plugins/".length)), ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]));
                b.onResolve({ filter: /^@api\// }, args => {
                    if (ALIASES[args.path]) return { path: ALIASES[args.path] };
                    return firstExisting(join(srcRoot, "src/api", args.path.slice("@api/".length)), ["", ".ts", ".tsx"]);
                });
            },
        },
        {
            name: "voidpp-css",
            setup(b) {
                b.onLoad({ filter: /\.css$/ }, args => {
                    const css = readFileSync(args.path, "utf8");
                    const file = basename(args.path, ".css");
                    const dir = basename(dirname(args.path));
                    const name = file === "styles" ? dir : file;
                    return {
                        contents: `import {registerStyle} from ${JSON.stringify(ALIASES["@utils/css"])};registerStyle(${JSON.stringify(name)},${JSON.stringify(css)});`,
                        loader: "js",
                    };
                });
            },
        },
    ];
}
