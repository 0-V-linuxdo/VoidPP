/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../shared.css";
import "./PluginsTab.css";

import { subscribe } from "@api/Events";
import { isPluginEnabled, plugins } from "@api/PluginManager";
import { getPinnedPlugins, getStarredPlugins } from "@api/Settings";
import {
    Button,
    ConfirmDialog,
    ErrorBoundary,
    Flex,
    Grid,
    Paragraph,
    Separator,
    Text,
} from "@components";
import { React, useCallback, useEffect, useMemo, useRef, useState } from "@turbopack/common/react";
import { classes, classNameFactory } from "@utils/css";
import { useFiltered } from "@utils/react";

import PluginCard from "../PluginCard";
import { isRecentlyUpdated, type ListFilter, PLUGIN_CATEGORY_TABS, type PluginCategory, pluginMatchesCategory } from "../utils";
import PluginDialog from "./PluginDialog";
import { SearchFilterBar } from "./SearchFilterBar";

const cl = classNameFactory("void-plugins-");

const FILTER_OPTIONS: readonly { value: ListFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "enabled", label: "Enabled" },
    { value: "disabled", label: "Disabled" },
];

const getPluginKey = (name: string) => `${name} ${plugins[name].description ?? ""}`;

function filterByEnabled(list: string[], filter: ListFilter): string[] {
    if (filter === "all") return list;
    const enabled = filter === "enabled";
    return list.filter(n => isPluginEnabled(n) === enabled);
}

function emptyHint(search: string, category: PluginCategory): string {
    if (search) return "No plugins match your search.";
    if (category === "favorites") return "No favorites yet. Star a plugin to see it here.";
    if (category === "recent") return "No plugins updated in the last 7 days.";
    return "No plugins available.";
}

function sortPinnedFirst(list: string[]): string[] {
    const pinned = getPinnedPlugins();
    if (!pinned.length) return list;
    const rank = new Map(pinned.map((n, i) => [n, i]));
    return list.toSorted((a, b) => {
        const pa = rank.has(a);
        const pb = rank.has(b);
        if (pa !== pb) return pa ? -1 : 1;
        if (pa) return (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
        return 0;
    });
}

function sortByUpdated(list: string[]): string[] {
    return list.toSorted((a, b) => (plugins[b].updatedAt ?? 0) - (plugins[a].updatedAt ?? 0) || a.localeCompare(b));
}

let pendingPluginDialog: string | null = null;

export function setPendingPluginDialog(name: string): void {
    pendingPluginDialog = name;
}

export function consumePendingPluginDialog(): string | null {
    const name = pendingPluginDialog;
    pendingPluginDialog = null;
    return name;
}

export default function PluginsTab() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<ListFilter>("all");
    const [category, setCategory] = useState<PluginCategory>("favorites");
    const [dialogName, setDialogName] = useState<string | null>(null);
    const [showReload, setShowReload] = useState(false);
    const [needsReload, setNeedsReload] = useState(false);
    const [toggleTick, setToggleTick] = useState(0);

    const { userPlugins, requiredPlugins } = useMemo(() => {
        const userPlugins: string[] = [];
        const requiredPlugins: string[] = [];
        for (const n of Object.keys(plugins).toSorted((a, b) => a.localeCompare(b))) {
            if (plugins[n].hidden) continue;
            (plugins[n].required ? requiredPlugins : userPlugins).push(n);
        }
        return { userPlugins, requiredPlugins };
    }, []);

    const initialStatesRef = useRef<Map<string, boolean> | null>(null);
    const changedPluginsRef = useRef(new Set<string>());
    const dismissedRef = useRef(false);

    useEffect(() => {
        if (initialStatesRef.current) return;
        const map = new Map<string, boolean>();
        for (const n of [...userPlugins, ...requiredPlugins]) map.set(n, isPluginEnabled(n));
        initialStatesRef.current = map;
    }, [userPlugins, requiredPlugins]);

    useEffect(() => {
        const pending = consumePendingPluginDialog();
        if (pending) {
            setCategory("all");
            setDialogName(pending);
        }
    }, []);

    useEffect(() => {
        const bump = () => setToggleTick(t => t + 1);
        const unsubs = [subscribe("pluginToggle", bump), subscribe("pluginPin", bump), subscribe("pluginStar", bump)];
        return () => { for (const u of unsubs) u(); };
    }, []);

    useEffect(() => subscribe("reloadNeeded", () => {
        changedPluginsRef.current.add("__settings__");
        setNeedsReload(true);
        if (!dismissedRef.current) setShowReload(true);
    }), []);

    const visibleTabs = useMemo(() => PLUGIN_CATEGORY_TABS.filter(t => {
        if (t.id === "favorites" || t.id === "all" || t.id === "recent") return true;
        const pool = t.id === "other" ? userPlugins : [...userPlugins, ...requiredPlugins];
        return pool.some(n => pluginMatchesCategory(plugins[n], t.id));
    }), [userPlugins, requiredPlugins]);

    const { tabUser, tabRequired } = useMemo(() => {
        if (category === "favorites") {
            const starred = getStarredPlugins().filter(n => {
                const p = plugins[n];
                return !!p && !p.hidden;
            });
            return { tabUser: filterByEnabled(starred, filter), tabRequired: [] as string[] };
        }
        if (category === "recent") {
            const recent = [...userPlugins, ...requiredPlugins].filter(n => isRecentlyUpdated(plugins[n]));
            return { tabUser: filterByEnabled(sortByUpdated(recent), filter), tabRequired: [] as string[] };
        }
        if (category === "all") {
            return {
                tabUser: sortPinnedFirst(filterByEnabled(userPlugins, filter)),
                tabRequired: filterByEnabled(requiredPlugins, filter),
            };
        }
        const matchingUser = userPlugins.filter(n => pluginMatchesCategory(plugins[n], category));
        const matchingRequired = requiredPlugins.filter(n => pluginMatchesCategory(plugins[n], category));
        return {
            tabUser: sortPinnedFirst(filterByEnabled([...matchingUser, ...matchingRequired], filter)),
            tabRequired: [] as string[],
        };
    }, [category, filter, userPlugins, requiredPlugins, toggleTick]);

    const filteredUser = useFiltered(tabUser, search, getPluginKey);
    const filteredRequired = useFiltered(tabRequired, search, getPluginKey);

    const dialogPlugin = dialogName ? plugins[dialogName] : null;
    const hasResults = filteredUser.length > 0 || filteredRequired.length > 0;

    const onReload = useCallback((pluginName: string) => {
        const initialStates = initialStatesRef.current;
        if (!initialStates) return;
        const changed = changedPluginsRef.current;

        if (isPluginEnabled(pluginName) === initialStates.get(pluginName)) changed.delete(pluginName);
        else changed.add(pluginName);

        if (!changed.size) {
            setNeedsReload(false);
            setShowReload(false);
            dismissedRef.current = false;
        } else {
            setNeedsReload(true);
            if (!dismissedRef.current) setShowReload(true);
        }
    }, []);

    const onDismiss = useCallback(() => {
        dismissedRef.current = true;
        setShowReload(false);
    }, []);

    return (
        <Flex flexDirection="column" gap="1rem" className="void-tab-root">
            {needsReload && !showReload && (
                <Flex alignItems="center" className={cl("reload-banner")}>
                    <Text size="xs" className={cl("reload-text")}>
                        Reload the page to apply plugin changes.
                    </Text>
                    <Button variant="secondary" size="sm" onClick={() => location.reload()}>
                        Reload
                    </Button>
                </Flex>
            )}
            <Flex className={cl("tabs")} gap="0.125rem" flexWrap="wrap">
                {visibleTabs.map(t => (
                    <Button
                        key={t.id}
                        variant="tertiary"
                        size="sm"
                        className={classes(cl("tab"), category === t.id && cl("tab-active"))}
                        onClick={() => setCategory(t.id)}
                    >
                        {t.label}
                    </Button>
                ))}
            </Flex>
            <SearchFilterBar<ListFilter>
                placeholder={`Search ${tabUser.length + tabRequired.length} plugins...`}
                search={search}
                onSearchChange={setSearch}
                filter={filter}
                onFilterChange={setFilter}
                options={FILTER_OPTIONS}
            />
            {filteredUser.length > 0 && (
                <Grid columns="repeat(2, 1fr)">
                    {filteredUser.map(n => (
                        <ErrorBoundary key={n} fallback={null}>
                            <PluginCard name={n} onSettings={setDialogName} onReload={onReload} />
                        </ErrorBoundary>
                    ))}
                </Grid>
            )}
            {filteredRequired.length > 0 && (
                <>
                    <Separator />
                    <Grid columns="repeat(2, 1fr)">
                        {filteredRequired.map(n => (
                            <ErrorBoundary key={n} fallback={null}>
                                <PluginCard name={n} onSettings={setDialogName} onReload={onReload} />
                            </ErrorBoundary>
                        ))}
                    </Grid>
                </>
            )}
            {!hasResults && (
                <Paragraph color="secondary" className="void-tab-empty">
                    {emptyHint(search, category)}
                </Paragraph>
            )}
            {dialogPlugin && (
                <ErrorBoundary fallback={null}>
                    <PluginDialog plugin={dialogPlugin} onClose={() => setDialogName(null)} />
                </ErrorBoundary>
            )}
            <ConfirmDialog
                open={showReload}
                onOpenChange={v => { if (!v) onDismiss(); }}
                title="Reload required"
                description="This plugin patches Grok's code, so you need to reload the page."
                confirmText="Reload"
                cancelText="Later"
                onConfirm={() => location.reload()}
            />
        </Flex>
    );
}
