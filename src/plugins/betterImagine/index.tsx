/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Button, ConfirmDialog, DropdownMenuItem, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { CopyIcon, ImagesIcon, ScalingIcon } from "@components/icons";
import type { MediaPostType } from "@grok-types/enums";
import type { MediaItem } from "@grok-types/stores/MediaStore";
import { Fragment, React, useRef, useState } from "@turbopack/common/react";
import { MediaStore, RoutingStore } from "@turbopack/common/stores";
import { Toaster } from "@turbopack/common/utils";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { copyToClipboard, createExternalStore, debounce, sanitizeFilename } from "@utils/misc";
import { useExternalStore } from "@utils/react";
import { pluralize } from "@utils/text";
import definePlugin, { OptionType } from "@utils/types";

const logger = new Logger("BetterImagine");
const cl = classNameFactory("void-imagine-");

const settings = definePluginSettings({
    hideDefaultPreviews: {
        type: OptionType.BOOLEAN,
        description: "Hide the community image grid and templates on the Imagine home page.",
        default: false,
    },
    noAutoplay: {
        type: OptionType.BOOLEAN,
        description: "Stop video thumbnails from autoplaying.",
        default: true,
    },
    playOnHover: {
        type: OptionType.BOOLEAN,
        description: "Play video thumbnails when hovered.",
        default: true,
    },
    hideModerated: {
        type: OptionType.BOOLEAN,
        description: "Hide moderated images and videos that cannot be interacted with.",
        default: true,
    },
    pauseWhenHidden: {
        type: OptionType.BOOLEAN,
        description: "Pause any playing video thumbnails when the tab loses focus.",
        default: true,
    },
    persistFilters: {
        type: OptionType.BOOLEAN,
        description: "Remember Favorites filter + sort across reloads.",
        default: true,
    },
    smartFilenames: {
        type: OptionType.BOOLEAN,
        description: "Rename downloads to YYYY-MM-DD_prompt-slug_id.ext.",
        default: true,
    },
    bypassPaywall: {
        type: OptionType.BOOLEAN,
        description: "Skip the upsell dialog when picking 720p / 10s / video extend. The setting is applied locally; the server still enforces your subscription on generation.",
        default: false,
    },
    ctrlClickSelect: {
        type: OptionType.BOOLEAN,
        description: "Ctrl/Cmd-click an image to add it to the multi-select.",
        default: true,
    },
});

function buildFilename(post: MediaItem | undefined, isVideo: boolean): string | null {
    if (!settings.store.smartFilenames || !post) return null;
    const prompt = (post.prompt ?? post.originalPrompt ?? "").trim();
    const slug = sanitizeFilename(prompt.slice(0, 60), "").slice(0, 60);
    const date = post.createTime ? new Date(post.createTime).toISOString().slice(0, 10) : "";
    const id = post.id?.slice(0, 8) ?? "";
    const ext = isVideo ? "mp4" : "png";
    const parts = [date, slug, id].filter(Boolean);
    if (!parts.length) return null;
    return `${parts.join("_")}.${ext}`;
}

type MediaFilter = "all" | "image" | "video";
type DateFilter = "all" | "today" | "week" | "month";
type SortMode = "newest" | "oldest" | "prompt-az" | "prompt-za" | "random";

const FILTER_MAP: Record<Exclude<MediaFilter, "all">, MediaPostType> = {
    image: "MEDIA_POST_TYPE_IMAGE",
    video: "MEDIA_POST_TYPE_VIDEO",
};

const DATE_LABELS: Record<DateFilter, string> = {
    all: "Any time",
    today: "Today",
    week: "This week",
    month: "This month",
};

const SORT_LABELS: Record<SortMode, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    "prompt-az": "Prompt A → Z",
    "prompt-za": "Prompt Z → A",
    random: "Shuffle",
};

const SORT_KEYS = Object.keys(SORT_LABELS) as SortMode[];

const DAY_MS = 86_400_000;

const DATE_CUTOFFS: Record<DateFilter, number> = {
    all: 0,
    today: DAY_MS,
    week: 7 * DAY_MS,
    month: 30 * DAY_MS,
};

const STORAGE_KEY = "void-imagine-filters";

interface FilterState {
    filter: MediaFilter;
    search: string;
    date: DateFilter;
    sort: SortMode;
}

const DEFAULT_FILTERS: FilterState = { filter: "all", search: "", date: "all", sort: "newest" };

function loadFilters(): FilterState {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_FILTERS;
        const parsed = JSON.parse(raw) as Partial<FilterState>;
        return {
            filter: (["all", "image", "video"] as const).includes(parsed.filter as MediaFilter) ? parsed.filter as MediaFilter : "all",
            search: typeof parsed.search === "string" ? parsed.search : "",
            date: (Object.keys(DATE_LABELS) as DateFilter[]).includes(parsed.date as DateFilter) ? parsed.date as DateFilter : "all",
            sort: SORT_KEYS.includes(parsed.sort as SortMode) ? parsed.sort as SortMode : "newest",
        };
    } catch {
        return DEFAULT_FILTERS;
    }
}

const initial = loadFilters();
let currentFilter: MediaFilter = initial.filter;
let currentSearch = initial.search;
let currentDate: DateFilter = initial.date;
let currentSort: SortMode = initial.sort;
let randomSeed = Date.now();
const filterStore = createExternalStore();

function persist() {
    if (!settings.store.persistFilters) return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filter: currentFilter, search: currentSearch, date: currentDate, sort: currentSort }));
    } catch {}
}

function setFilter(f: MediaFilter) { currentFilter = f; filterStore.notify(); persist(); }
const setSearch = debounce((s: string) => { currentSearch = s; filterStore.notify(); persist(); }, 200);
function setDate(d: DateFilter) { currentDate = d; filterStore.notify(); persist(); }
function setSort(s: SortMode) {
    if (s === "random" && currentSort === "random") randomSeed = Date.now();
    currentSort = s;
    filterStore.notify();
    persist();
}

function resetFilters() {
    currentFilter = "all";
    currentSearch = "";
    currentDate = "all";
    currentSort = "newest";
    filterStore.notify();
    persist();
}

function hasActiveFilters(): boolean {
    return currentFilter !== "all" || currentSearch.length > 0 || currentDate !== "all";
}

function isModerated(p: MediaItem): boolean {
    return !!(p.moderated || p.isModerated) && !p.mediaUrl;
}

const haystackCache = new WeakMap<MediaItem, string>();
const tsCache = new WeakMap<MediaItem, number>();
const promptCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function getHaystack(p: MediaItem): string {
    let h = haystackCache.get(p);
    if (h === undefined) {
        h = `${p.prompt ?? ""}\n${p.originalPrompt ?? ""}`.toLowerCase();
        haystackCache.set(p, h);
    }
    return h;
}

function getTs(p: MediaItem): number {
    let t = tsCache.get(p);
    if (t === undefined) {
        t = new Date(p.createTime).getTime() || 0;
        tsCache.set(p, t);
    }
    return t;
}

function matchesFilters(p: MediaItem, target: MediaPostType | null, q: string, cutoff: number, hideModerated: boolean): boolean {
    if (!p) return false;
    if (hideModerated && isModerated(p)) return false;
    if (target && p.mediaType !== target) return false;
    if (cutoff && getTs(p) < cutoff) return false;
    if (q && !getHaystack(p).includes(q)) return false;
    return true;
}

let cacheKey: string | null = null;
let cacheList: MediaItem[] | null = null;
let cacheResult: MediaItem[] = [];

function filterItems(items: MediaItem[]): MediaItem[] {
    const { hideModerated } = settings.store;
    const key = `${items.length}|${currentFilter}|${currentSearch}|${currentDate}|${currentSort}|${hideModerated ? 1 : 0}|${randomSeed}`;
    if (cacheList === items && cacheKey === key) return cacheResult;

    const needsFilter = currentFilter !== "all" || currentSearch || currentDate !== "all" || hideModerated;
    let out = items;
    if (needsFilter) {
        const target = currentFilter !== "all" ? FILTER_MAP[currentFilter] : null;
        const q = currentSearch.toLowerCase();
        const cutoff = DATE_CUTOFFS[currentDate] ? Date.now() - DATE_CUTOFFS[currentDate] : 0;
        out = items.filter(p => matchesFilters(p, target, q, cutoff, hideModerated));
    }
    cacheList = items;
    cacheKey = key;
    cacheResult = currentSort === "newest" ? out : sortItems(out);
    return cacheResult;
}

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function sortItems(items: MediaItem[]): MediaItem[] {
    if (items.length < 2) return items;
    const arr = [...items];
    switch (currentSort) {
        case "oldest":
            return arr.toSorted((a, b) => getTs(a) - getTs(b));
        case "prompt-az":
            return arr.toSorted((a, b) => promptCollator.compare(a.prompt ?? "", b.prompt ?? ""));
        case "prompt-za":
            return arr.toSorted((a, b) => promptCollator.compare(b.prompt ?? "", a.prompt ?? ""));
        case "random": {
            const rand = mulberry32(randomSeed);
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }
        default:
            return arr;
    }
}

const pending = new WeakMap<HTMLVideoElement, Promise<void>>();

function pauseVideo(video: HTMLVideoElement) {
    const promise = pending.get(video);
    pending.delete(video);
    if (promise) {
        promise.then(() => {
            if (pending.has(video)) return;
            video.pause();
            video.currentTime = 0;
        }).catch(e => logger.warn("Failed to pause video:", e));
    } else {
        video.pause();
        video.currentTime = 0;
    }
}

const onMouseEnter = (e: { currentTarget: HTMLElement }) => {
    const video = e.currentTarget.querySelector("video");
    if (video) pending.set(video, video.play().catch(e => logger.error("Failed to play video", e)));
};

const onMouseLeave = (e: { currentTarget: HTMLElement }) => {
    const video = e.currentTarget.querySelector("video");
    if (video) pauseVideo(video);
};

function useFilteredFavorites(): MediaItem[] {
    const list = MediaStore.useMediaStore(s => s.favoritesList);
    useExternalStore(filterStore);
    return filterItems(list);
}

function mediaState() {
    return MediaStore.useMediaStore.getState();
}

function selectVisible() {
    const state = mediaState();
    const list = state.favoritesList ?? [];
    const visible = filterItems(list);
    if (!visible.length) return;
    state.setMultiSelectItems(visible);
    Toaster.toast.success(`Selected ${pluralize(visible.length, "item")}.`);
}

function deselectAll() {
    const state = mediaState();
    state.clearMultiSelect?.();
}

function selectedPosts(): MediaItem[] {
    const state = mediaState();
    const ids = Object.keys(state.multiSelectIds ?? {});
    return ids.map(id => state.byId[id]).filter((p): p is MediaItem => !!p);
}

async function copyLines(lines: string[], label: string) {
    if (!lines.length) { Toaster.toast.info(`Selected items have no ${label}s.`); return; }
    try {
        await copyToClipboard(lines.join("\n"));
        Toaster.toast.success(`Copied ${pluralize(lines.length, label)} to clipboard.`);
    } catch (e) {
        logger.error(`Failed to copy ${label}s`, e);
        Toaster.toast.error(`Failed to copy ${label}s.`);
    }
}

async function copySelectedPrompts() {
    const posts = selectedPosts();
    if (!posts.length) { Toaster.toast.info("No items selected."); return; }
    await copyLines(posts.map(p => (p.prompt ?? p.originalPrompt ?? "").trim()).filter(Boolean), "prompt");
}

async function copySelectedUrls() {
    const posts = selectedPosts();
    if (!posts.length) { Toaster.toast.info("No items selected."); return; }
    const { videoByMediaId } = mediaState();
    const urls = posts.map(p => videoByMediaId[p.id]?.find(v => v.hdMediaUrl)?.hdMediaUrl ?? p.mediaUrl).filter((u): u is string => !!u);
    await copyLines(urls, "URL");
}

async function bulkUpscaleSelected() {
    const state = mediaState();
    const ids = Object.keys(state.multiSelectIds ?? {});
    let upscaled = 0;
    let alreadyHd = 0;
    let inProgress = 0;

    for (const id of ids) {
        const videos = state.videoByMediaId[id];
        if (!videos?.length) continue;
        for (const video of videos) {
            if (video.hdMediaUrl) { alreadyHd++; continue; }
            if (video.upscalingInProgress) { inProgress++; continue; }
            try {
                await state.upscaleVideo(id, video.id);
                upscaled++;
            } catch (e) {
                logger.error("Failed to upscale video:", id, video.id, e);
            }
        }
    }

    if (upscaled) Toaster.toast.success(`Upscaling ${pluralize(upscaled, "video")}.`);
    else if (alreadyHd) Toaster.toast.info(`${pluralize(alreadyHd, "video")} already in HD.`);
    else if (inProgress) Toaster.toast.info(`${pluralize(inProgress, "video")} already upscaling.`);
    else Toaster.toast.info("No videos to upscale.");
}

function FilterButtons() {
    useExternalStore(filterStore);
    const [searchInput, setSearchInput] = useState(currentSearch);
    const showClear = hasActiveFilters() || currentSort !== "newest" || searchInput.length > 0;
    const sortActive = currentSort !== "newest";

    const lastSync = useRef(currentSearch);
    if (lastSync.current !== currentSearch) {
        lastSync.current = currentSearch;
        setSearchInput(currentSearch);
    }

    return (
        <Fragment>
            <Select value={currentDate} onValueChange={(v: string) => setDate(v as DateFilter)}>
                <SelectTrigger className={cl("date-select")}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(Object.keys(DATE_LABELS) as DateFilter[]).map(d => (
                        <SelectItem key={d} value={d}>{DATE_LABELS[d]}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={currentSort} onValueChange={(v: string) => setSort(v as SortMode)}>
                <SelectTrigger className={sortActive ? cl("sort-select", "sort-active") : cl("sort-select")}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {SORT_KEYS.map(s => (
                        <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Input
                type="text"
                placeholder="Search..."
                value={searchInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearchInput(e.target.value); setSearch(e.target.value); }}
                className={cl("search")}
            />
            {(["image", "video"] as const).map(f => (
                <Button
                    key={f}
                    variant={currentFilter === f ? "primary" : "tertiary"}
                    size="sm"
                    shape="pill"
                    className={currentFilter !== f ? cl("chip") : undefined}
                    onClick={() => setFilter(currentFilter === f ? "all" : f)}
                >
                    {f === "image" ? "Images" : "Videos"}
                </Button>
            ))}
            {showClear && (
                <Button variant="tertiary" size="sm" shape="pill" className={cl("chip")} onClick={resetFilters}>
                    Clear
                </Button>
            )}
        </Fragment>
    );
}

function UpscaleItem() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <DropdownMenuItem onSelect={() => setOpen(true)}>
                <ScalingIcon className="size-4 me-2" />
                Upscale videos
            </DropdownMenuItem>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Upscale selected videos"
                description="Start HD upscaling for the selected videos. Already-HD and in-progress videos will be skipped."
                confirmText="Upscale"
                onConfirm={bulkUpscaleSelected}
            />
        </>
    );
}

function CopyActions() {
    return (
        <>
            <DropdownMenuItem onSelect={copySelectedPrompts}>
                <CopyIcon className="size-4 me-2" />
                Copy prompts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copySelectedUrls}>
                <CopyIcon className="size-4 me-2" />
                Copy URLs
            </DropdownMenuItem>
        </>
    );
}

function isImaginePage(): boolean {
    try {
        const page = String(RoutingStore.useRoutingStore.getState().route?.page ?? "");
        if (page.startsWith("imagine")) return true;
    } catch { /* route not ready */ }
    try {
        return (location.pathname.replace(/\/+$/, "") || "/").startsWith("/imagine");
    } catch {
        return false;
    }
}

function isFavoritesPage(): boolean {
    try {
        if (RoutingStore.useRoutingStore.getState().route?.page === "imagine-favorites") return true;
    } catch { /* route not ready */ }
    try {
        const path = location.pathname.replace(/\/+$/, "") || "/";
        return path === "/imagine/favorites" || path.startsWith("/imagine/favorites/");
    } catch {
        return false;
    }
}

function isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function onKeyDown(e: KeyboardEvent) {
    if (!isImaginePage()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;

    if (e.key === "i" || e.key === "I") {
        if (!isFavoritesPage()) return;
        setFilter(currentFilter === "image" ? "all" : "image");
        e.preventDefault();
    } else if (e.key === "v" || e.key === "V") {
        if (!isFavoritesPage()) return;
        setFilter(currentFilter === "video" ? "all" : "video");
        e.preventDefault();
    } else if (e.key === "r" || e.key === "R") {
        if (!isFavoritesPage()) return;
        resetFilters();
        e.preventDefault();
    } else if (e.key === "A") {
        if (isFavoritesPage()) { deselectAll(); e.preventDefault(); }
    } else if (e.key === "a") {
        if (isFavoritesPage()) { selectVisible(); e.preventDefault(); }
    } else if (e.key === "c" || e.key === "C") {
        if (isFavoritesPage() && Object.keys(mediaState().multiSelectIds ?? {}).length) {
            copySelectedPrompts();
            e.preventDefault();
        }
    }
}

function onVisibilityChange() {
    if (!settings.store.pauseWhenHidden) return;
    if (document.visibilityState !== "hidden") return;
    for (const video of document.querySelectorAll<HTMLVideoElement>("video")) {
        if (!video.paused) video.pause();
    }
}

let abortCtrl: AbortController | null = null;

export default definePlugin({
    name: "BetterImagine",
    icon: ImagesIcon,
    description: "Imagine polish: filter, sort, shortcuts on Favorites, autoplay control, hide moderated, bulk upscale + copy-prompts, smart filenames, pause-on-hidden.",
    authors: [Devs.Prism],
    tags: ["ui"],
    settings,

    _hideDefault: () => settings.store.hideDefaultPreviews,
    _NullGrid: () => null,
    _autoPlay: () => !settings.store.noAutoplay,
    _bypassPaywall: () => settings.store.bypassPaywall,
    _ctrlClickSelect: () => settings.store.ctrlClickSelect,
    _hoverProps: () => settings.store.playOnHover ? { onMouseEnter, onMouseLeave } : {},
    _useFilteredFavorites: useFilteredFavorites,
    _renderFilterButtons: ErrorBoundary.wrap(FilterButtons, null),
    _renderUpscaleItem: ErrorBoundary.wrap(UpscaleItem, null),
    _renderCopyActions: ErrorBoundary.wrap(CopyActions, null),
    _buildFilename: buildFilename,

    start() {
        if (abortCtrl) return;
        abortCtrl = new AbortController();
        const { signal } = abortCtrl;
        document.addEventListener("keydown", onKeyDown, { capture: true, signal });
        document.addEventListener("visibilitychange", onVisibilityChange, { signal });
    },

    stop() {
        abortCtrl?.abort();
        abortCtrl = null;
    },

    patches: [
        {
            find: "image_feed_opened",
            group: true,
            replacement: [
                {
                    match: /\(0,(\i\.jsx)\)\((\i),\{containerRef:(\i),variant:(\i),width:/,
                    replace: '(0,$1)($self._hideDefault()&&"favorites"!==$4?$self._NullGrid:$2,{containerRef:$3,variant:$4,width:',
                },
                {
                    match: /=\(0,\i\.useMediaStore\)\(\i=>\i\.favoritesList\)/,
                    replace: "=$self._useFilteredFavorites()",
                },
            ],
        },
        {
            find: "image_feed_image_selected",
            group: true,
            replacement: [
                {
                    match: /autoPlay:!0/g,
                    replace: "autoPlay:$self._autoPlay()",
                },
                {
                    match: /\.updateShiftPreview\(null\)\)\},onClick:/,
                    replace: ".updateShiftPreview(null))},...$self._hoverProps(),onClick:",
                },
                {
                    match: /if\(([^)]{1,40})\)return void (\i)\((\i)\);(?=let \i=\{imagine:"home-grid")/,
                    replace: "if($1||($self._ctrlClickSelect()&&($3.ctrlKey||$3.metaKey)))return void $2($3);",
                },
                {
                    match: /if\(([^)]{1,40})\)return void (\i)\((\i)\);(?=if\(!\i\)return;\i\.useMediaStore\.getState\(\)\.clearMultiSelect)/,
                    replace: "if($1||($self._ctrlClickSelect()&&($3.ctrlKey||$3.metaKey)))return void $2($3);",
                },
            ],
        },
        {
            find: 'imagine-folder.all","All"',
            replacement: {
                match: /"imagine-folder\.all","All"\)\}\)/,
                replace: "$&,$self._renderFilterButtons({})",
            },
        },
        {
            find: "imagine-templates.section-title",
            all: true,
            noWarn: true,
            replacement: {
                match: /\?(\i)\.play\(\)\.catch\(\i\):\1\.pause\(\)/,
                replace: "&&$self._autoPlay()?$1.play().catch(()=>{}):$1.pause()",
            },
        },
        {
            find: '"imagine-set-resolution"',
            all: true,
            replacement: {
                match: /return void \i\.useUpsellStore\.getState\(\)\.openUpsell\(\{entrypointKey:"imagine-[\w-]+"\}\)/g,
                replace: "if(!$self._bypassPaywall())$&",
            },
        },
        {
            find: ["imagine-multiselect.add-to-tag", 'DropdownMenuContent,{align:"end",sideOffset:8,children:[(0,'],
            group: true,
            replacement: [
                {
                    match: /(?<=\.DropdownMenuContent,\{align:"end",sideOffset:8,children:\[)/,
                    replace: "$self._renderUpscaleItem(),$self._renderCopyActions(),",
                },
                {
                    match: /`imagine-\$\{(\i)\.slice\(0,8\)\}\.\$\{(\i)\?"mp4":"png"\}`/,
                    // oxlint-disable-next-line no-template-curly-in-string
                    replace: '($self._buildFilename(e.byId[$1],$2)||`imagine-${$1.slice(0,8)}.${$2?"mp4":"png"}`)',
                },
            ],
        },
    ],
});
