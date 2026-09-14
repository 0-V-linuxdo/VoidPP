/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { ButtonWithTooltip, ChatBarButton, Flex, SettingsDescription, SettingsTitle, Switch } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { AutoModeIcon, BuildModeIcon, ChevronDownIcon, ChevronUpIcon, ConnectedAppsIcon, FastModeIcon, GripVerticalIcon, LightbulbIcon, Minimize2Icon } from "@components/icons";
import type { ModesStoreState } from "@grok-types/stores/ModesStore";
import type { RoutingStoreState } from "@grok-types/stores/RoutingStore";
import { React } from "@turbopack/common/react";
import { ModesStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classes, classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import type { DragEvent, MouseEvent } from "react";

const logger = new Logger("CompactModeSelect");
const cl = classNameFactory("void-cms-");

const MODES = [
    { id: "auto", pin: "pinAuto", label: "Auto", Icon: AutoModeIcon },
    { id: "fast", pin: "pinFast", label: "Fast", Icon: FastModeIcon },
    { id: "expert", pin: "pinExpert", label: "Expert", Icon: LightbulbIcon },
    { id: "heavy", pin: "pinHeavy", label: "Heavy", Icon: ConnectedAppsIcon },
    { id: "build", pin: "pinBuild", label: "Build", Icon: BuildModeIcon },
] as const;

type ModeId = (typeof MODES)[number]["id"];
type PinKey = (typeof MODES)[number]["pin"];

const KNOWN_IDS = new Set<string>(MODES.map(m => m.id));
const PIN_BY_ID: Record<string, PinKey> = Object.fromEntries(MODES.map(m => [m.id, m.pin]));
const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m])) as Record<ModeId, (typeof MODES)[number]>;
const DEFAULT_PIN_ORDER = "heavy,build";
const SETTING_KEYS = ["pinAuto", "pinFast", "pinExpert", "pinHeavy", "pinBuild", "showLabels", "hideNativeTrigger", "pinOrder"] as const;

const ITEM_SEL = "[role='menuitem'], [role='option'], [data-radix-collection-item]";
const MENU_ROOT_SEL = [
    "[data-radix-popper-content-wrapper]",
    "[data-radix-menu-content]",
    "[data-radix-dropdown-menu-content]",
    "[data-radix-select-content]",
    "[data-radix-popover-content]",
    "[role='menu']",
    "[role='listbox']",
].join(", ");
const TRIGGER_SEL = ".query-bar [data-query-bar-mode-select] button";
const PICK_MS = 900;
const POINTER: PointerEventInit = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0 };
const GHOST_STYLE = { opacity: "0", visibility: "hidden" } as const;

const settings = definePluginSettings({
    pinList: {
        type: OptionType.COMPONENT,
        description: "Toggle pins and drag to set chip order.",
        component: PinOrderEditor,
    },
    hideNativeTrigger: {
        type: OptionType.BOOLEAN,
        description: "Hide the native mode menu button and keep its popup invisible.",
        default: true,
    },
    showLabels: {
        type: OptionType.BOOLEAN,
        description: "Show mode names on pinned chips.",
        default: false,
    },
    pinAuto: {
        type: OptionType.BOOLEAN,
        description: "Pin Auto next to the compact selector.",
        default: false,
        hidden: true,
    },
    pinFast: {
        type: OptionType.BOOLEAN,
        description: "Pin Fast next to the compact selector.",
        default: false,
        hidden: true,
    },
    pinExpert: {
        type: OptionType.BOOLEAN,
        description: "Pin Expert next to the compact selector.",
        default: false,
        hidden: true,
    },
    pinHeavy: {
        type: OptionType.BOOLEAN,
        description: "Pin Heavy next to the compact selector.",
        default: true,
        hidden: true,
    },
    pinBuild: {
        type: OptionType.BOOLEAN,
        description: "Pin Build next to the compact selector.",
        default: true,
        hidden: true,
    },
    pinOrder: {
        type: OptionType.STRING,
        description: "Order of pinned chips.",
        default: DEFAULT_PIN_ORDER,
        hidden: true,
    },
});

let picking = false;
let harvesting = false;
const harvested = new Map<string, string>();
const harvestListeners = new Set<() => void>();
const ghosts = new Set<HTMLElement>();
let cloakWatch: MutationObserver | null = null;

function uncloak() {
    for (const host of ghosts) {
        host.classList.remove(cl("ghost"));
        host.style.removeProperty("opacity");
        host.style.removeProperty("visibility");
        host.style.removeProperty("pointer-events");
    }
    ghosts.clear();
}

function setPicking(on: boolean) {
    picking = on;
    document.documentElement.classList.toggle("void-cms-picking", on);
    if (on) {
        cloakWatch ??= new MutationObserver(onCloakMutations);
        cloakWatch.observe(document.documentElement, { childList: true, subtree: true });
        return;
    }
    cloakWatch?.disconnect();
    cloakWatch = null;
    document.documentElement.classList.remove("void-cms-picked");
    uncloak();
}

function notifyHarvest() {
    for (const fn of harvestListeners) fn();
}

function parseOrder(raw: unknown): ModeId[] {
    const seen = new Set<string>();
    const ordered: ModeId[] = [];
    for (const token of String(raw ?? "").split(/[,\s]+/)) {
        const id = token.toLowerCase();
        if (!KNOWN_IDS.has(id) || seen.has(id)) continue;
        seen.add(id);
        ordered.push(id as ModeId);
    }
    for (const m of MODES) {
        if (seen.has(m.id)) continue;
        ordered.push(m.id);
    }
    return ordered;
}

function reorder(ids: ModeId[], from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= ids.length) return ids;
    const next = ids.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

function setOrder(ids: ModeId[]) {
    settings.store.pinOrder = ids.join(",");
}

function setPinned(pin: PinKey, on: boolean) {
    settings.store[pin] = on;
}

function itemText(el: Element) {
    return `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

function titlesFor(id: string) {
    const mode = MODES.find(m => m.id === id);
    const catalogTitle = ModesStore.useModesStore.getState().modes.find(m => m.id === id)?.title;
    return [catalogTitle, mode?.label, id].filter((t): t is string => !!t).map(t => t.toLowerCase());
}

function matchItem(el: Element, id: string) {
    const hay = itemText(el);
    if (!hay) return false;
    return titlesFor(id).some(t => hay === t || hay.startsWith(`${t} `));
}

function isModeMenu(items: HTMLElement[]) {
    return items.filter(el => MODES.some(m => matchItem(el, m.id))).length >= 2;
}

function ghostHost(el: HTMLElement): HTMLElement {
    const wrap = el.closest("[data-radix-popper-content-wrapper]");
    if (wrap instanceof HTMLElement) return wrap;
    let host = el;
    for (let n: HTMLElement | null = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === "fixed" || pos === "absolute") host = n;
    }
    return host;
}

function cloak(menu: { root: HTMLElement; items: HTMLElement[] }) {
    const host = ghostHost(menu.root);
    if (ghosts.has(host)) return;
    host.classList.add(cl("ghost"));
    host.style.setProperty("opacity", GHOST_STYLE.opacity, "important");
    host.style.setProperty("visibility", GHOST_STYLE.visibility, "important");
    ghosts.add(host);
}

function lockGhosts() {
    document.documentElement.classList.add("void-cms-picked");
    for (const host of ghosts) host.style.setProperty("pointer-events", "none", "important");
}

function modeMenu(): { root: HTMLElement; items: HTMLElement[] } | null {
    for (const root of document.querySelectorAll(MENU_ROOT_SEL)) {
        if (!(root instanceof HTMLElement)) continue;
        const items = [...root.querySelectorAll<HTMLElement>(ITEM_SEL)];
        if (isModeMenu(items)) return { root, items };
    }
    const loose = [...document.querySelectorAll<HTMLElement>(ITEM_SEL)].filter(el => MODES.some(m => matchItem(el, m.id)));
    if (loose.length < 2) return null;
    const nested = loose[0].closest(MENU_ROOT_SEL);
    const root = nested instanceof HTMLElement ? nested : ghostHost(loose[0]);
    return { root, items: loose };
}

function onCloakMutations() {
    const menu = modeMenu();
    if (menu) cloak(menu);
}

function waitUntil(ok: () => boolean) {
    const start = performance.now();
    return new Promise<boolean>(resolve => {
        const tick = () => {
            if (ok()) {
                resolve(true);
                return;
            }
            if (performance.now() - start > PICK_MS) {
                resolve(false);
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function waitForMenu() {
    await waitUntil(() => {
        const menu = modeMenu();
        if (menu) cloak(menu);
        return !!menu;
    });
    return modeMenu();
}

function waitForGone() {
    return waitUntil(() => !modeMenu());
}

function nativeTrigger() {
    return document.querySelector<HTMLButtonElement>(TRIGGER_SEL);
}

function clickEl(el: HTMLElement) {
    el.dispatchEvent(new PointerEvent("pointerdown", POINTER));
    el.dispatchEvent(new PointerEvent("pointerup", POINTER));
    el.click();
}

function paintCurrent(el: Element) {
    for (const attr of ["fill", "stroke"]) {
        const v = el.getAttribute(attr);
        if (!v || v === "none" || v === "currentColor") continue;
        el.setAttribute(attr, "currentColor");
    }
    for (const name of el.getAttributeNames()) {
        if (name.startsWith("on")) el.removeAttribute(name);
    }
    el.removeAttribute("class");
}

function normalizeSvg(src: SVGSVGElement) {
    const svg = src.cloneNode(true) as SVGSVGElement;
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    svg.querySelectorAll("script").forEach(n => n.remove());
    paintCurrent(svg);
    svg.querySelectorAll("*").forEach(paintCurrent);
    return svg.outerHTML;
}

function stashGlyphs(items: HTMLElement[]) {
    let added = false;
    for (const item of items) {
        const mode = MODES.find(m => matchItem(item, m.id));
        if (!mode || harvested.has(mode.id)) continue;
        const svg = item.querySelector("svg");
        if (!(svg instanceof SVGSVGElement)) continue;
        harvested.set(mode.id, normalizeSvg(svg));
        added = true;
    }
    if (added) notifyHarvest();
}

async function harvestIcons() {
    if (harvesting || picking || harvested.size > 0) return;
    const trigger = nativeTrigger();
    if (!trigger) return;
    harvesting = true;
    setPicking(true);
    try {
        let menu = modeMenu();
        if (!menu) {
            clickEl(trigger);
            menu = await waitForMenu();
        }
        if (!menu) return;
        cloak(menu);
        stashGlyphs(menu.items);
        if (modeMenu()) clickEl(trigger);
        lockGhosts();
        await waitForGone();
    } catch (e) {
        logger.warn("Failed to harvest mode icons:", e);
    } finally {
        setPicking(false);
        harvesting = false;
    }
}

async function selectMode(id: string) {
    if (picking) return;
    setPicking(true);
    try {
        await ModesStore.useModesStore.getState().ensureLoaded();

        let menu = modeMenu();
        if (!menu) {
            const trigger = nativeTrigger();
            if (!trigger) {
                logger.warn("Native mode selector not found");
                return;
            }
            clickEl(trigger);
            menu = await waitForMenu();
        }
        if (!menu) {
            logger.warn("Native mode item not found:", id);
            return;
        }

        cloak(menu);
        stashGlyphs(menu.items);
        const item = menu.items.find(el => matchItem(el, id));
        if (!item) {
            logger.warn("Native mode item not found:", id);
            const trigger = nativeTrigger();
            if (modeMenu() && trigger) clickEl(trigger);
            lockGhosts();
            await waitForGone();
            return;
        }
        clickEl(item);
        lockGhosts();
        await waitForGone();
    } catch (e) {
        logger.warn("Failed to select mode:", e);
    } finally {
        setPicking(false);
    }
}

function useNativeGlyph(id: string) {
    const [, bump] = React.useState(0);
    React.useEffect(() => {
        const onHarvest = () => bump(n => n + 1);
        harvestListeners.add(onHarvest);
        void harvestIcons();
        return () => {
            harvestListeners.delete(onHarvest);
        };
    }, [id]);
    return harvested.get(id);
}

function PinGlyph({ id, Icon, label, showLabels }: {
    id: string;
    Icon: (typeof MODES)[number]["Icon"];
    label: string;
    showLabels: boolean;
}) {
    const html = useNativeGlyph(id);
    const glyph = html
        ? <span className={cl("glyph")} dangerouslySetInnerHTML={{ __html: html }} />
        : <Icon size={18} />;
    if (!showLabels) return glyph;
    return (
        <>
            {glyph}
            <span className={cl("label")}>{label}</span>
        </>
    );
}

function preventDragOver(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function PinOrderEditor() {
    const cfg = settings.use(["pinAuto", "pinFast", "pinExpert", "pinHeavy", "pinBuild", "pinOrder"]);
    const ids = parseOrder(cfg.pinOrder);
    const [dragId, setDragId] = React.useState<string | null>(null);

    const onDragStart = (id: ModeId) => (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        setDragId(id);
    };

    const onDrop = (toId: ModeId) => (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData("text/plain") as ModeId;
        setOrder(reorder(ids, ids.indexOf(fromId), ids.indexOf(toId)));
        setDragId(null);
    };

    return (
        <Flex flexDirection="column" gap="0.5rem" className={cl("order")}>
            <Flex flexDirection="column" gap="0">
                <SettingsTitle>Pinned modes</SettingsTitle>
                <SettingsDescription>Toggle pins and drag to set chip order.</SettingsDescription>
            </Flex>
            <div className={cl("order-list")} role="list">
                {ids.map((id, i) => {
                    const m = MODE_BY_ID[id];
                    return (
                        <div
                            key={m.id}
                            role="listitem"
                            className={classes(cl("order-row"), dragId === m.id && cl("dragging"))}
                            onDragOver={preventDragOver}
                            onDrop={onDrop(m.id)}
                        >
                            <Flex alignItems="center" gap="0.5rem" className={cl("order-main")}>
                                <span
                                    className={cl("grip")}
                                    draggable
                                    onDragStart={onDragStart(m.id)}
                                    onDragEnd={() => setDragId(null)}
                                    aria-label={`Reorder ${m.label}`}
                                >
                                    <GripVerticalIcon size={16} />
                                </span>
                                <m.Icon size={16} className={cl("order-icon")} />
                                <SettingsTitle>{m.label}</SettingsTitle>
                            </Flex>
                            <Flex alignItems="center" gap="0.25rem">
                                <ButtonWithTooltip
                                    variant="tertiary"
                                    size="xs"
                                    shape="square"
                                    tooltipContent="Move up"
                                    aria-label={`Move ${m.label} up`}
                                    disabled={i === 0}
                                    onClick={() => setOrder(reorder(ids, i, i - 1))}
                                >
                                    <ChevronUpIcon size={14} />
                                </ButtonWithTooltip>
                                <ButtonWithTooltip
                                    variant="tertiary"
                                    size="xs"
                                    shape="square"
                                    tooltipContent="Move down"
                                    aria-label={`Move ${m.label} down`}
                                    disabled={i === ids.length - 1}
                                    onClick={() => setOrder(reorder(ids, i, i + 1))}
                                >
                                    <ChevronDownIcon size={14} />
                                </ButtonWithTooltip>
                                <Switch checked={!!cfg[m.pin]} onCheckedChange={on => setPinned(m.pin, on)} />
                            </Flex>
                        </div>
                    );
                })}
            </div>
        </Flex>
    );
}

function PinnedModes() {
    const cfg = settings.use([...SETTING_KEYS]);
    const page = RoutingStore.useRoutingStore((s: RoutingStoreState) => s.route.page);
    const selectedModeId = ModesStore.useModesStore((s: ModesStoreState) => s.selectedModeId);
    const catalog = ModesStore.useModesStore((s: ModesStoreState) => s.modes);
    const knownCatalog = catalog.filter(c => KNOWN_IDS.has(c.id));
    const items = parseOrder(cfg.pinOrder)
        .map(id => MODE_BY_ID[id])
        .filter(m => cfg[m.pin] && (m.id === "build" || !knownCatalog.length || knownCatalog.some(c => c.id === m.id)));
    if (page === "bot" || !items.length) return null;

    const { showLabels } = cfg;
    const allCovered = knownCatalog.length > 0 && knownCatalog.every(c => cfg[PIN_BY_ID[c.id]]);
    const hideNative = cfg.hideNativeTrigger || allCovered;

    const onPin = (id: string) => (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        void selectMode(id);
    };

    return (
        <div className={classes(cl("pins"), hideNative && cl("hide-native"))}>
            {items.map(m => (
                <ChatBarButton
                    key={m.id}
                    size="sm"
                    icon={<PinGlyph id={m.id} Icon={m.Icon} label={m.label} showLabels={showLabels} />}
                    tooltip={m.label}
                    onClick={onPin(m.id)}
                    className={classes(cl("pin"), selectedModeId === m.id && cl("on"), showLabels && cl("labeled"))}
                    aria-label={m.label}
                />
            ))}
        </div>
    );
}

export default definePlugin({
    name: "CompactModeSelect",
    icon: Minimize2Icon,
    description: "Pin 1–N chat modes as always-visible chips. Click a chip to switch without opening the menu.",
    authors: [Devs.p],
    tags: ["chat", "ui"],
    enabledByDefault: true,
    settings,
    managedStyle: "compactModeSelect",
    startAt: StartAt.TurbopackReady,

    start() {
        void ModesStore.useModesStore.getState().ensureLoaded();
    },

    stop() {
        setPicking(false);
        harvested.clear();
        harvestListeners.clear();
    },

    renderPinned: ErrorBoundary.wrap(PinnedModes),

    patches: [
        {
            find: "data-query-bar-mode-select",
            all: true,
            group: true,
            replacement: [
                {
                    match: /ModeSelect,\{compact:\i\|\|\i,/,
                    replace: "ModeSelect,{compact:!0,",
                },
                {
                    match: /\},"mode-select"\),/,
                    replace: "$&$self.renderPinned(),",
                },
            ],
        },
    ],
});
