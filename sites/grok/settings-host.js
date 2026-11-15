// Inject Void++ settings pages into Grok's desktop dialog. Patches match 20261114.29–.30.
import { U, h, Fragment, ErrorBoundary, useSubscription } from "./u.js";
import { common, whenCommon } from "./common.js";
import { accountMenuParts, accountMenuSelect } from "./menu-kit.js";
import { UnplugIcon, PaletteIcon, BracesIcon, TestTubeIcon, BellIcon, Settings2Icon, FileDownIcon, RotateCcwIcon, VoidPPIcon } from "./lucide.js";

const GROUP_ID = "voidpp";
const groupLabel = () => U.scriptName || "Void++";
const ENTRY_PATH = "plugins.Settings.showSiteEntry";
const PLUGINS_TIP = "Toggle features. Some need a reload. Click the sliders icon to configure.";

let logger = null;
const log = () => (logger ??= new U.Logger("GrokSettings", "#a5b4fc"));
const pages = () => U.settingsPages || [];
const pageById = id => pages().find(p => p.id === id);
const pageId = key => (pages().find(p => p.key === key || p.id === key) || pages()[0])?.id;
const entryShown = () => U.PlainSettings.plugins.Settings?.showSiteEntry !== false;

const LUCIDE = {
    plugins: UnplugIcon,
    themes: PaletteIcon,
    quickCss: BracesIcon,
    experiments: TestTubeIcon,
    keybinds: Settings2Icon,
    notifications: BellIcon,
    backup: FileDownIcon,
    updates: RotateCcwIcon,
};

function lucideFor(page) {
    return LUCIDE[page?.key] || LUCIDE[page?.id] || UnplugIcon;
}

function grokNavIcon(Icon) {
    return function GrokNavIcon({ size, width, height, ...rest }) {
        const dim = width ?? height ?? (typeof size === "number" ? `${0.25 * size}rem` : size) ?? "1rem";
        return h(Icon, { ...rest, width: dim, height: dim });
    };
}

function PluginsLabel() {
    const { Tooltip } = U.components;
    const label = h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, "Plugins");
    if (!Tooltip) return label;
    return h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, "Plugins",
        h(Tooltip, { content: PLUGINS_TIP }, h("span", { className: "uspp-tip", "aria-label": PLUGINS_TIP, style: { display: "inline-flex", opacity: 0.7 } }, h(U.icons.InfoIcon, { size: 3.5 }))));
}

function tabEntries() {
    return pages().map(p => ({
        id: p.id,
        group: GROUP_ID,
        icon: grokNavIcon(lucideFor(p)),
        i18nKey: p.label,
        defaultLabel: p.label,
        description: p.key === "plugins" ? PLUGINS_TIP : undefined,
        visible: () => true,
        component: p.component,
    }));
}

function tabLabel(tab) {
    if (!tab) return null;
    const p = pageById(tab.id);
    if (p?.key === "plugins") return "Plugins";
    return tab.defaultLabel || tab.i18nKey || p?.label || tab.id;
}

function navLeading(id) {
    const p = pageById(id) || pages().find(x => x.key === id);
    if (!p) return null;
    return h(lucideFor(p), { width: 18, height: 18, className: "void-settings-nav-icon" });
}

function openSettingsTab(tabId) {
    const store = common.SettingsDialogStore;
    const hook = store?.useSettingsDialogStore;
    if (!hook || typeof hook.getState !== "function") return false;
    const st = hook.getState();
    try {
        if (typeof st.openTab === "function") st.openTab(tabId);
        else {
            st.setTab?.(tabId);
            st.setOpen?.(true);
        }
        return true;
    } catch (e) {
        log().error("打开设置失败", e);
        return false;
    }
}

function openPluginOverSettings(plugin) {
    const started = Date.now();
    const tick = () => {
        const dlg = document.querySelector('[role="dialog"][data-state="open"]');
        if (dlg || Date.now() - started > 1500) U.openPluginSettings(plugin);
        else setTimeout(tick, 50);
    };
    setTimeout(tick, 30);
}

function open({ tab, plugin } = {}) {
    if (!openSettingsTab(pageId(plugin ? "plugins" : (tab || "plugins")))) return false;
    if (plugin) openPluginOverSettings(plugin);
    return true;
}
const isOpen = () => !!document.querySelector("[role=\"dialog\"] [data-uspp-page]");

function selectNavTab(id, setTab) {
    if (String(id).startsWith("uspp_")) {
        const store = common.SettingsDialogStore?.useSettingsDialogStore;
        const openTab = store && typeof store.getState === "function" ? store.getState().openTab : undefined;
        if (typeof openTab === "function") {
            openTab(id);
            return;
        }
    }
    setTab(id);
}

function resolveShownTab(opts) {
    const hook = common.SettingsDialogStore?.useSettingsDialogStore;
    const tab = hook && typeof hook.getState === "function" ? hook.getState().tab : undefined;
    if (String(tab || "").startsWith("uspp_")) return tab;
    if (String(opts.requestedTab || "").startsWith("uspp_")) return opts.requestedTab;
    if (opts.open && opts.isHosted(opts.normalized)) return opts.normalized;
    if (opts.open || opts.hostedSection == null) return opts.activeTab;
    return opts.hostedSection;
}

const primitives = {};
function setPrimitive(name, component) {
    primitives[name] = component;
    return component;
}

function pluginsWithSettings() {
    return Object.values(U.plugins)
        .filter(p => !p.hidden && !(p.chromiumOnly && !U.isChromium()) && U.getVisibleSettings(p).length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
}

const subscribeMenu = fn => {
    const off = U.subscribe(U.Events.PLUGIN_TOGGLE, fn);
    U.SettingsStore.addChangeListener(ENTRY_PATH, fn);
    return () => { off(); U.SettingsStore.removeChangeListener?.(ENTRY_PATH, fn); };
};

function glyph(Icon) {
    return Icon ? h(Icon, { width: 16, height: 16 }) : null;
}

function VoidPPMenu() {
    useSubscription(subscribeMenu);
    if (!entryShown()) return null;
    const menu = accountMenuParts();
    const { Sub, Trigger, Content, Item } = menu;
    if (!Sub || !Trigger || !Content || !Item) return null;
    const list = pluginsWithSettings();
    const pageItem = key => {
        const p = pages().find(x => x.key === key);
        return p && h(Item, { key, ...accountMenuSelect(menu.desktop, () => open({ tab: key })), "data-uspp-menu": key }, glyph(lucideFor(p)), p.label);
    };
    return h(Sub, { "data-uspp-avatar-menu": "" },
        h(Trigger, { "data-uspp-menu": "root" }, glyph(VoidPPIcon), groupLabel()),
        h(Content, null,
            list.length > 0 && h(Sub, null,
                h(Trigger, { "data-uspp-menu": "plugins" }, glyph(UnplugIcon), "Plugins"),
                h(Content, { "data-uspp-menu-list": "plugins", style: { maxHeight: "min(60vh, 420px)", overflowY: "auto" } },
                    list.map(p => h(Item, { key: p.name, ...accountMenuSelect(menu.desktop, () => open({ plugin: p })), "data-uspp-menu-plugin": p.name },
                        h(ErrorBoundary, { fallback: glyph(UnplugIcon) }, glyph(p.icon || UnplugIcon)), p.name)))),
            pageItem("themes"),
            pageItem("quickCss"),
            pageItem("experiments"),
            pageItem("backup")));
}

const WrappedMenu = ErrorBoundary.wrap ? ErrorBoundary.wrap(VoidPPMenu) : VoidPPMenu;
function renderAvatarMenu() {
    return h(ErrorBoundary, { key: "voidpp-avatar-menu", fallback: null, label: "avatar-menu" }, h(WrappedMenu));
}

const fallbacks = new Set();
function whenModule(keys, fn) {
    const m = U.findByProps(...keys);
    if (m) fn(m); else U.waitFor(x => keys.every(k => x && k in x), fn);
}
function hookExport(name, fn) {
    const C = U.findExportedComponent(name);
    if (C) fn(C); else U.waitFor(m => typeof m[name] === "function" || (m[name] && typeof m[name] === "object"), m => fn(m[name]));
}

function enableFallback(kind) {
    if (fallbacks.has(kind)) return;
    fallbacks.add(kind);
    if (kind === "registry") {
        whenModule(["NAV_GROUPS", "TAB_REGISTRY"], m => {
            try {
                const groups = m.NAV_GROUPS, reg = m.TAB_REGISTRY;
                if (Array.isArray(groups) && !groups.includes(GROUP_ID)) groups.push(GROUP_ID);
                if (Array.isArray(reg)) for (const e of tabEntries()) if (!reg.some(x => x?.id === e.id)) reg.push(e);
            } catch (e) { log().error("兜底注册设置标签失败", e); }
        });
        U.registerInjectionFallback("Settings", "设置标签注册");
    } else if (kind === "labels") {
        const ids = new Set(pages().map(p => p.id));
        const swap = (props, key, render) => {
            const c = props.children;
            if (typeof c === "string" && ids.has(c)) return render({ ...props, children: tabLabel({ id: c }) });
        };
        for (const tag of ["span", "div", "p", "h1", "h2", "h3"]) U.addRenderHook(tag, swap);
        U.registerInjectionFallback("Settings", "设置标签名");
    } else if (kind === "avatar") {
        hookExport("SupportIcon", Support => whenCommon(["DropdownMenuSub", "DropdownMenuSubTrigger"], SubC => {
            U.addRenderHook(SubC, (props, key, render) => {
                if (props["data-uspp-avatar-menu"] != null) return;
                const first = U.asArray(props.children)[0];
                if (!first || first.type !== common.DropdownMenuSubTrigger || !U.treeHas(first.props?.children, el => el.type === Support, 3)) return;
                return h(Fragment, { key }, renderAvatarMenu(), render());
            });
        }));
        U.registerInjectionFallback("Settings", "头像菜单");
    }
}

export function installSettingsFallbacks() {
    U.onPatchBypassed("Settings", results => {
        for (const r of results) {
            if (r.find.includes("registryTabs") || r.find.includes("TAB_REGISTRY") || r.find.includes("DesktopSettingsDialog")) enableFallback("registry");
            else if (r.find.includes("settings-nav-group")) enableFallback("labels");
            else if (r.find.includes("user-dropdown.help") || r.find.includes("avatar_menu_click")) enableFallback("avatar");
        }
    });
}

export const settingsHost = {
    get groupLabel() { return groupLabel(); },
    open,
    isOpen,
    navGroups(groups) {
        const list = Array.isArray(groups) ? groups : [];
        return list.includes(GROUP_ID) ? list : [...list, GROUP_ID];
    },
    tabRegistry(reg) {
        const list = Array.isArray(reg) ? reg : [];
        const ids = new Set(pages().map(p => p.id));
        return [...list.filter(t => !ids.has(t?.id)), ...tabEntries()];
    },
    tabLabel,
    renderAvatarMenu,
    openSettingsTab,
    _tabEntries: tabEntries,
    _tabLabel: tabLabel,
    _navLeading: navLeading,
    _selectNavTab: selectNavTab,
    _resolveShownTab: resolveShownTab,
    _setPrimitive: setPrimitive,
    _renderVoidPPMenu: renderAvatarMenu,
    patches: [
        {
            find: "avatar_menu_click",
            all: true,
            replacement: [
                {
                    match: /(?=\(0,\i\.jsxs\)\(\i\.W,\{children:\[\(0,\i\.jsxs\)\(\i\.f,\{ref:\i,children:\[.{0,260}"user-dropdown\.help")/,
                    replace: "$self._renderVoidPPMenu(),",
                },
                {
                    match: /\(0,(\i)\.jsxs\)\((\i)\.DropdownMenuSub,\{children:\[\(0,\1\.jsxs\)\(\2\.DropdownMenuSubTrigger,\{(?:\i:\i,)*children:\[.{0,240}"user-dropdown\.help"/,
                    replace: "$self._renderVoidPPMenu(),$&",
                    noWarn: true,
                },
            ],
        },
        {
            find: '"user-dropdown.help","Help"',
            all: true,
            replacement: {
                match: /(\(0,(\i)\.jsx\)\(\i,\{onOpenChangelog:\i\}\))/,
                replace: "(0,$2.jsx)($2.Fragment,{children:[$self._renderVoidPPMenu(),$1]})",
            },
        },
        {
            find: "registryTabs",
            replacement: [
                {
                    match: /\i\.filter\(\i=>\i\.visible\(\i\)&&!\(\i&&"team-overview"===\i\.id\)\)/,
                    replace: "[...$&,...$self._tabEntries()]",
                    noWarn: true,
                },
                {
                    match: /\i(?:\.\i)?\.filter\(\i=>\i\.visible\(\i\)\)(?=[\s\S]{0,1200}registryTabs)/,
                    replace: "[...$&,...$self._tabEntries()]",
                },
                {
                    match: /(\["general","grok","payments","data","other"),("team-management"\])/,
                    replace: '$1,"voidpp",$2',
                    noWarn: true,
                },
                {
                    match: /(case"other":return \i\("settings-nav-group\.other","Other"\);)(case"team-management":)/,
                    replace: '$1case"voidpp":return"Void++";$2',
                },
                {
                    match: /default:return\(0,\i(?:\.\i)?\)\("SettingsDialog:tabLabel",`No label for settings tab \${(\i)\.id}`\),\1\.id/,
                    replace: "default:return $self._tabLabel($1)",
                },
            ],
        },
        {
            find: "desktop-shell.settings.search-label",
            all: true,
            replacement: {
                match: /leading:\(0,(\i)\.jsx\)\((\i)\.f,\{name:(\i)\.X\[(\i)\.id\]\}\)/g,
                replace: "leading:$self._navLeading($4.id)||(0,$1.jsx)($2.f,{name:$3.X[$4.id]})",
            },
        },
        {
            find: '"DesktopSettingsDialog",0,function',
            replacement: [
                {
                    match: /let (\i)=\(0,(\i)\.z\)\((\i)\);return (\i)&&\(0,(\i)\.K\)\(\1\)\?\1:\4\|\|null===(\i)\?(\i):\6/,
                    replace: "let $1=(0,$2.z)($3);return $self._resolveShownTab({activeTab:$7,open:$4,requestedTab:$3,hostedSection:$6,normalized:$1,isHosted:$5.K})",
                },
                {
                    match: /\[(\i),(\i)\]=\(0,(\i)\.useState\)\((\i)\);(\i)&&\1!==\4&&\2\(\4\)([\s\S]{0,1200}?)(\i)=(\i)=>(\i)\(\(\)=>(\i)\(\8\)\),(\i)\[34\]=\9,(\i)\[35\]=\10,(\i)\[36\]=\7/,
                    replace: "[$1,$2]=(0,$3.useState)($4);$5&&$1!==$4&&$2($4)$6$7=$8=>$9(()=>{$self._selectNavTab($8,$10);$2($8);}),$11[34]=$9,$12[35]=$10,$13[36]=$7",
                },
            ],
        },
        {
            find: '"grok-bot","data","billing","dev","dev-flags"',
            replacement: {
                match: /(\["home","account","appearance","notifications","personality","grok-bot","data","billing","dev","dev-flags","behavior","usage")/,
                replace: '$1,"uspp_plugins_tab","uspp_themes_tab","uspp_quickcss_tab","uspp_backup_tab","uspp_keybinds_tab","uspp_notifications_tab","uspp_updates_tab","uspp_page_experiments"',
            },
        },
        {
            find: '["general","grok","payments","data","other","team-management"]',
            replacement: {
                match: /(\["general","grok","payments","data","other"),("team-management"\])/,
                replace: '$1,"voidpp",$2',
            },
        },
        {
            find: '"SettingsTitle",0,',
            all: true,
            noWarn: true,
            replacement: [
                {
                    match: /("SettingsTitle",0,)(?!function)(\i)/,
                    replace: '$1$self._setPrimitive("SettingsTitle",$2)',
                    noWarn: true,
                },
                {
                    match: /("SettingsTitle",0,)(function\(\i\)\{[\s\S]*?\})(?=\]\))/,
                    replace: '$1$self._setPrimitive("SettingsTitle",$2)',
                },
            ],
        },
    ],
};
