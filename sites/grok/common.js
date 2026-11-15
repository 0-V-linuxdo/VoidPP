// Grok 公共件的懒解析引用:模块未加载时为空,不抛错
import { U } from "./u.js";

const find = f => U.find(f);
const findStore = n => U.findStore(n);
const getReact = () => U.findReact();
const isZustandStore = v => U.isZustandStore(v);
const getFiber = el => U.getFiber(el);

const has = (v, k) => { try { return v[k] != null; } catch { return false; } };

const moduleFilters = {
    dropdown: v => has(v, "DROPDOWN_MENU_ICON_CLASSES") && has(v, "DropdownMenuItem"),
    contextMenu: v => has(v, "ContextMenuShortcut") && has(v, "ContextMenuItem"),
    select: v => has(v, "SelectTrigger") && has(v, "SelectValue") && !has(v, "Root"),
    switch: v => typeof v.Switch === "function" && !has(v, "Root") && !has(v, "Thumb"),
    button: v => has(v, "Button") && has(v, "IconButton") && has(v, "buttonVariants"),
    dialog: v => has(v, "DialogCloseButton") && has(v, "DialogContent"),
    tooltip: v => has(v, "TooltipGroup") && has(v, "TooltipContent"),
    input: v => has(v, "FIELD_ERROR_CLASSES") && has(v, "Input"),
    badge: v => typeof v.Badge === "function" && Object.keys(v).length <= 3,
    separator: v => typeof v.Separator === "function" && !has(v, "Root") && Object.keys(v).length <= 2,
    textarea: v => typeof v.Textarea === "function" && Object.keys(v).length <= 2,
    reactDomClient: v => typeof v.createRoot === "function" && typeof v.hydrateRoot === "function",
    reactDom: v => typeof v.createPortal === "function" && typeof v.flushSync === "function",
    toast: v => typeof v === "function" && typeof v.success === "function" && typeof v.dismiss === "function" && typeof v.getHistory === "function",
};

const cache = {};
let lastVersion = {};
function resolveModule(key) {
    if (cache[key]) return cache[key];
    // 被其他脚本包装执行的模块只在运行时缓存里,先并入再比较版本
    U.syncModuleCache();
    const v = U.moduleCacheVersion();
    if (lastVersion[key] === v) return null;
    lastVersion[key] = v;
    const m = find(moduleFilters[key]);
    if (m) cache[key] = m;
    return m || null;
}

const STORE_NAMES = ["ChatPage", "Conversation", "Message", "Response", "Routing", "SettingsDialog", "Settings", "Modes", "Feature", "Session", "Subscriptions"];
const storeCache = {};
function resolveStore(name) {
    if (storeCache[name]) return storeCache[name];
    const s = findStore(name);
    if (s && isZustandStore(s)) storeCache[name] = s;
    return s || null;
}

export const common = {};
const def = (name, get) => Object.defineProperty(common, name, { get, enumerable: true });

def("React", () => getReact());
for (const hook of ["useState", "useEffect", "useMemo", "useRef", "useCallback", "useContext", "useLayoutEffect", "useReducer", "useId", "useSyncExternalStore", "useTransition", "useDeferredValue", "useImperativeHandle", "memo", "forwardRef", "createContext", "createElement", "Fragment", "cloneElement", "isValidElement", "Children"]) {
    def(hook, () => getReact()?.[hook] ?? null);
}
def("ReactDOM", () => resolveModule("reactDom"));
def("ReactDOMClient", () => resolveModule("reactDomClient"));

const uiMap = {
    Button: ["button", "Button"], IconButton: ["button", "IconButton"],
    Dialog: ["dialog", "Dialog"], DialogContent: ["dialog", "DialogContent"], DialogTitle: ["dialog", "DialogTitle"],
    DialogDescription: ["dialog", "DialogDescription"], DialogHeader: ["dialog", "DialogHeader"], DialogFooter: ["dialog", "DialogFooter"],
    DialogClose: ["dialog", "DialogClose"], DialogCloseButton: ["dialog", "DialogCloseButton"], DialogTrigger: ["dialog", "DialogTrigger"],
    DropdownMenu: ["dropdown", "DropdownMenu"], DropdownMenuTrigger: ["dropdown", "DropdownMenuTrigger"], DropdownMenuContent: ["dropdown", "DropdownMenuContent"],
    DropdownMenuItem: ["dropdown", "DropdownMenuItem"], DropdownMenuSub: ["dropdown", "DropdownMenuSub"], DropdownMenuSubTrigger: ["dropdown", "DropdownMenuSubTrigger"],
    DropdownMenuSubContent: ["dropdown", "DropdownMenuSubContent"], DropdownMenuSeparator: ["dropdown", "DropdownMenuSeparator"], DropdownMenuLabel: ["dropdown", "DropdownMenuLabel"],
    DropdownMenuGroup: ["dropdown", "DropdownMenuGroup"], DropdownMenuPortal: ["dropdown", "DropdownMenuPortal"],
    ContextMenuItem: ["contextMenu", "ContextMenuItem"], ContextMenuSub: ["contextMenu", "ContextMenuSub"], ContextMenuSubTrigger: ["contextMenu", "ContextMenuSubTrigger"],
    ContextMenuSubContent: ["contextMenu", "ContextMenuSubContent"], ContextMenuSeparator: ["contextMenu", "ContextMenuSeparator"],
    Switch: ["switch", "Switch"],
    Select: ["select", "Select"], SelectTrigger: ["select", "SelectTrigger"], SelectContent: ["select", "SelectContent"], SelectItem: ["select", "SelectItem"], SelectValue: ["select", "SelectValue"],
    Input: ["input", "Input"], Textarea: ["textarea", "Textarea"],
    Tooltip: ["tooltip", "Tooltip"], TooltipTrigger: ["tooltip", "TooltipTrigger"], TooltipContent: ["tooltip", "TooltipContent"], TooltipProvider: ["tooltip", "TooltipProvider"],
    Separator: ["separator", "Separator"], Badge: ["badge", "Badge"],
};
for (const [name, [mod, key]] of Object.entries(uiMap)) {
    def(name, () => { const m = resolveModule(mod); try { return m ? m[key] ?? null : null; } catch { return null; } });
}

for (const s of STORE_NAMES) def(`${s}Store`, () => resolveStore(s));
def("Toaster", () => resolveModule("toast"));

// ---------- 订阅信息 ----------
// 旧版 Grok 有 useSubscriptionsStore;新版改为 React hook(useSubscriptions)加页面查询缓存(键 "subscriptions")
const once = filter => { let hit = null; return () => hit || (hit = find(filter) || null); };
const subsModule = once(v => has(v, "useSubscriptions") && has(v, "getSubscriptionTierName"));
const isQueryClient = v => typeof v?.getQueryCache === "function" && typeof v?.getQueryData === "function" && typeof v?.setQueryData === "function";
const exportedQueryClient = once(isQueryClient);
let fiberQueryClient = null;

/** 页面上的 React 根 fiber(不含框架自己的界面根):
 *  从挂载容器取(Grok 把根挂在 document 本身上),另外总是从页面里任意带 fiber 的节点向上走到根 */
const isOwn = el => el?.nodeType === 1 && !!el.closest?.("uspp-root");
function reactRootFibers() {
    const out = new Set();
    const els = [document, document.documentElement, document.getElementById("__next"), document.getElementById("root"), document.body, ...(document.body?.children || [])]
        .filter(el => el && !isOwn(el));
    for (const el of els) {
        // 容器上记的是创建时的根 fiber,渲染后当前树在 FiberRoot.current
        for (const k of Object.keys(el)) if (k.startsWith("__reactContainer$")) { const f = el[k]?.stateNode?.current ?? el[k]; if (f) out.add(f); }
    }
    const any = [...document.querySelectorAll("body *")].filter(el => !isOwn(el)).slice(0, 200).map(getFiber).find(Boolean);
    let f = any;
    while (f?.return) f = f.return;
    if (f) out.add(f.stateNode?.current ?? f);
    return [...out];
}

/** 查询客户端:模块导出里没有时,从 React 根往下找 QueryClientProvider 的 client */
function queryClient() {
    const c = exportedQueryClient();
    if (c) return c;
    if (fiberQueryClient) return fiberQueryClient;
    for (const root of reactRootFibers()) {
        const stack = [root];
        for (let n = 0; stack.length && n < 50000; n++) {
            const f = stack.pop();
            const client = f.memoizedProps?.client;
            if (isQueryClient(client)) return (fiberQueryClient = client);
            if (f.sibling) stack.push(f.sibling);
            if (f.child) stack.push(f.child);
        }
    }
    return null;
}

function subscriptionsFromQueryCache() {
    const qc = queryClient();
    if (!qc) return null;
    try {
        const qs = qc.getQueryCache().getAll().filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === "subscriptions" && q.state?.data != null);
        qs.sort((a, b) => (b.state.dataUpdatedAt || 0) - (a.state.dataUpdatedAt || 0));
        return qs[0]?.state.data ?? null;
    } catch { return null; }
}

const pickList = data => {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    for (const k of ["subscriptions", "activeSubscriptions", "items", "data"]) if (Array.isArray(data[k])) return data[k];
    return [];
};
const tierOf = s => s?.tier ?? s?.subscriptionTier ?? s?.plan ?? s?.productTier ?? null;
const INACTIVE = /cancel|expired|inactive|ended|unpaid|incomplete_expired/i;
const TIER_RANK = [/heavy/i, /pro|plus/i, /super/i, /premium/i, /basic|free/i];
const rank = t => { const s = String(t ?? ""); const i = TIER_RANK.findIndex(r => r.test(s)); return i < 0 ? TIER_RANK.length : i; };
const isX = s => /(^|[^a-z])(x|twitter)([^a-z]|$)/i.test(String(s?.billingProvider ?? s?.provider ?? s?.source ?? s?.platform ?? "")) || !!s?.isXSubscription;

/** 把订阅等级转成显示名;能找到 Grok 自己的转换函数(含经 X 订阅的命名)时用它 */
export function subscriptionTierName(tier, sub) {
    if (tier == null) return "";
    const m = subsModule();
    if (m) {
        try { const n = m.getSubscriptionTierName(tier, sub); if (typeof n === "string" && n) return n; } catch { /* 退回自己的写法 */ }
    }
    return String(tier).replace(/^SUBSCRIPTION_TIER_/i, "").split(/[_\s]+/).filter(Boolean)
        .map(w => w.toLowerCase() === "supergrok" ? "SuperGrok" : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
        .replace(/^Super Grok/, "SuperGrok").replace(/^X Premium Plus$/, "X Premium+");
}

/** 订阅快照:优先旧 store,其次查询缓存;都没有时返回空对象,不抛错 */
export function getSubscriptions() {
    let data = null;
    try { data = resolveStore("Subscriptions")?.getState?.() ?? null; } catch { data = null; }
    if (!data || !pickList(data).length) data = subscriptionsFromQueryCache() ?? data;
    if (!data) return {};
    const list = pickList(data);
    const active = list.filter(s => !INACTIVE.test(String(s?.status ?? s?.state ?? "")));
    const tiers = active.map(tierOf).filter(t => t != null);
    const best = data.bestSubscription;
    const bestTier = typeof best === "string" ? best : tierOf(best);
    const highest = bestTier ?? (tiers.length ? tiers.slice().sort((a, b) => rank(a) - rank(b))[0] : (data.highestTier ?? data.tier ?? null));
    return {
        highestTier: highest,
        highestTierName: subscriptionTierName(highest, active.find(s => tierOf(s) === highest)),
        isSubscribed: active.length > 0 || (highest != null && !/free|basic/i.test(String(highest))),
        isEnterprise: !!(data.isEnterpriseUser ?? data.isEnterprise ?? data.enterprise ?? active.some(s => /enterprise|team|business/i.test(String(tierOf(s))))),
        hasXSubscription: !!(data.hasXSubscription ?? active.some(isX)),
        active,
        raw: data,
    };
}

def("getSubscriptions", () => getSubscriptions);
def("subscriptionTierName", () => subscriptionTierName);
// 新版 Grok 自己的订阅 hook,只能在组件里调用;没有时为空
def("useSubscriptions", () => { const m = subsModule(); return m ? m.useSubscriptions : null; });

export const getAllUi = () => Object.fromEntries(Object.keys(uiMap).map(k => [k, common[k]]));

/** 等这些公共件都取得到再调用 fn(只调用一次);模块加载和定时重扫都会重试 */
export function whenCommon(names, fn) {
    const ready = () => names.every(n => common[n] != null);
    let done = false, timer = null, unsub = null;
    const tryRun = () => {
        if (done || !ready()) return false;
        done = true;
        unsub?.();
        if (timer) clearInterval(timer);
        fn(...names.map(n => common[n]));
        return true;
    };
    if (tryRun()) return;
    unsub = U.onModuleLoad(() => { tryRun(); });
    timer = setInterval(tryRun, 1000);
}
