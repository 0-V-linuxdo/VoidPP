/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { showToast, ToastType } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Badge, Button, Card, Flex, Input, Paragraph, SectionHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SettingsDescription, SettingsRow, SettingsSwitch, SettingsTitle, Text } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { TestTubeIcon } from "@components/icons";
import type { FeatureStoreState } from "@grok-types";
import { React, useCallback, useMemo, useState } from "@turbopack/common/react";
import { FeatureStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { sendBrowserNotification } from "@utils/misc";
import { useFiltered } from "@utils/react";
import { humanizeKey, pluralize } from "@utils/text";
import definePlugin, { OptionType, StartAt } from "@utils/types";

const cl = classNameFactory("void-experiments-");

const NEW_FLAG_TTL = 24 * 60 * 60 * 1000;

interface PrivateSettings {
    knownFlags: Record<string, number>;
}

const settings = definePluginSettings({
    toastNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when experiment flags change.",
        default: true,
    },
    browserNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show a browser notification when experiment flags change.",
        default: true,
    },
}).withPrivateSettings<PrivateSettings>();

function getBooleanKeys(config: FeatureStoreState["config"]) {
    return Object.keys(config).filter(k => typeof config[k] === "boolean");
}

let lastConfigSnapshot: Record<string, boolean> = {};

function formatFlagList(label: string, flags: string[]) {
    if (!flags.length) return "";
    const names = flags.map(prettifyKey).join(", ");
    return `${pluralize(flags.length, "flag")} ${label}: ${names}`;
}

function notifyChanges(newFlags: string[], removedFlags: string[], flipped: string[]) {
    const parts = [
        formatFlagList("added", newFlags),
        formatFlagList("removed", removedFlags),
        formatFlagList("changed", flipped),
    ].filter(Boolean);
    if (!parts.length) return;

    const message = parts.join("\n");
    if (settings.store.toastNotifications) showToast(message, ToastType.INFO);
    if (settings.store.browserNotifications) sendBrowserNotification("Grok Experiments", message);
}

function syncKnownFlags(config: FeatureStoreState["config"]) {
    const booleanKeys = getBooleanKeys(config);
    if (!booleanKeys.length) return;

    const existing = settings.plain.knownFlags;
    const firstRun = existing == null;
    const known: Record<string, number> = { ...existing };
    const now = Date.now();
    let changed = firstRun;

    const newFlags: string[] = [];
    for (const key of booleanKeys) {
        if (!(key in known)) {
            known[key] = firstRun ? 0 : now;
            if (!firstRun) newFlags.push(key);
            changed = true;
        }
    }

    const removedFlags: string[] = [];
    const currentSet = new Set(booleanKeys);
    for (const key of Object.keys(known)) {
        if (!currentSet.has(key)) {
            removedFlags.push(key);
            delete known[key];
            changed = true;
        }
    }

    const flipped: string[] = [];
    if (!firstRun && Object.keys(lastConfigSnapshot).length) {
        for (const key of booleanKeys) {
            if (key in lastConfigSnapshot && config[key] !== lastConfigSnapshot[key]) flipped.push(key);
        }
    }

    lastConfigSnapshot = Object.fromEntries(booleanKeys.map(k => [k, !!config[k]]));

    if (changed) {
        settings.store.knownFlags = { ...known };
    }

    if (!firstRun) notifyChanges(newFlags, removedFlags, flipped);
}

function isNewFlag(key: string) {
    const seen = settings.plain.knownFlags?.[key];
    if (seen == null) return false;
    return Date.now() - seen < NEW_FLAG_TTL;
}

const FLAG_ACRONYMS: Record<string, string> = {
    Mcp: "MCP", Ui: "UI", Api: "API", Url: "URL",
    Gcal: "GCal", Mie: "MIE", Xlsx: "XLSX", Nux: "NUX",
    Xai: "xAI", Grok: "Grok", Id: "ID",
};

function tryDecodeBase64Key(key: string): string | null {
    if (key.includes("_") || key.includes("-") || key.length < 10) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(key)) return null;
    try {
        const decoded = atob(key);
        if (/^[a-z][a-z0-9_]+$/.test(decoded)) return decoded;
    } catch { return null; }
    return null;
}

const prettifyKey = (key: string) => humanizeKey(tryDecodeBase64Key(key) ?? key, FLAG_ACRONYMS);

function ExperimentRow({ flagKey, isNew }: { flagKey: string; isNew: boolean }) {
    const config = FeatureStore.useFeatureStore(s => s.config[flagKey]);
    const override = FeatureStore.useFeatureStore(s => s.overrides[flagKey]);

    const isOverridden = override !== undefined;
    const checked = isOverridden ? !!override : !!config;
    const decodedKey = useMemo(() => tryDecodeBase64Key(flagKey), [flagKey]);

    const handleToggle = useCallback(
        (value: boolean) => {
            const { setOverride, clearOverride, config: c } = FeatureStore.useFeatureStore.getState();
            if (value === !!c[flagKey]) clearOverride(flagKey);
            else setOverride(flagKey, value);
        },
        [flagKey],
    );

    return (
        <SettingsRow action={<SettingsSwitch checked={checked} onCheckedChange={handleToggle} />}>
            <SettingsTitle>
                {prettifyKey(flagKey)}
                {isNew && <Badge variant="accent" className={cl("badge")}>New</Badge>}
                {decodedKey && <Badge className={cl("badge")}>Encrypted</Badge>}
                {isOverridden && (
                    <Text size="xs" as="span" className={cl("modified")}>
                        (modified)
                    </Text>
                )}
            </SettingsTitle>
            <SettingsDescription>{decodedKey ?? flagKey}</SettingsDescription>
        </SettingsRow>
    );
}

type Filter = "all" | "enabled" | "disabled" | "new" | "modified" | "encrypted";

function ExperimentsTab() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const config = FeatureStore.useFeatureStore(s => s.config);
    const overrides = FeatureStore.useFeatureStore(s => s.overrides);

    const booleanKeys = useMemo(() => getBooleanKeys(config).sort(), [config]);
    const getFlagSearchText = useCallback((k: string) => {
        const decoded = tryDecodeBase64Key(k);
        return decoded ? `${k} ${decoded} ${prettifyKey(k)}` : `${k} ${prettifyKey(k)}`;
    }, []);

    const filterFn = useCallback((k: string) => {
        if (filter === "all") return true;
        const override = overrides[k];
        const enabled = override !== undefined ? !!override : !!config[k];
        if (filter === "enabled") return enabled;
        if (filter === "disabled") return !enabled;
        if (filter === "new") return isNewFlag(k);
        if (filter === "encrypted") return tryDecodeBase64Key(k) != null;
        return override !== undefined;
    }, [filter, config, overrides]);

    const prefiltered = useMemo(() => booleanKeys.filter(filterFn), [booleanKeys, filterFn]);
    const filtered = useFiltered(prefiltered, search, getFlagSearchText);

    const overrideCount = Object.keys(overrides).length;

    return (
        <Flex flexDirection="column" gap="1rem">
            <SectionHeader title="Experiments" description="Toggle unreleased Grok features. These are experimental and may break. New flags are marked when they appear." className={cl("section")} />
            <Card variant="ghost" className={cl("warning")}>
                <Flex alignItems="center" justifyContent="space-between" gap="0.75rem">
                    <Text size="xs" className={cl("warning-text")}>
                        Only enable flags you understand. Changing the wrong setting can break Grok or cause unexpected behavior.
                    </Text>
                    {overrideCount > 0 && (
                        <Button variant="secondary" size="sm" className={cl("clear-btn")} onClick={() => FeatureStore.useFeatureStore.getState().clearAllOverrides()}>
                            Clear {pluralize(overrideCount, "override")}
                        </Button>
                    )}
                </Flex>
            </Card>
            <Flex alignItems="center" gap="0.5rem" className={cl("section")}>
                <Input placeholder={`Search ${prefiltered.length} flags...`} value={search} onChange={e => setSearch(e.target.value)} className={cl("search-input")} />
                <Select value={filter} onValueChange={(v: string) => setFilter(v as Filter)}>
                    <SelectTrigger className={cl("filter-select")}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="modified">Modified</SelectItem>
                        <SelectItem value="encrypted">Encrypted</SelectItem>
                    </SelectContent>
                </Select>
            </Flex>
            {filtered.map(key => (
                <ErrorBoundary key={key} fallback={null}>
                    <ExperimentRow flagKey={key} isNew={isNewFlag(key)} />
                </ErrorBoundary>
            ))}
            {!filtered.length && (
                <Paragraph color="muted" className={cl("empty")}>
                    {search ? `No flags matching "${search}"` : `No ${filter} flags`}
                </Paragraph>
            )}
        </Flex>
    );
}

export const Tab = ErrorBoundary.wrap(ExperimentsTab);

type Config = FeatureStoreState["config"];

function overrideProxy(config: Config, getState: () => FeatureStoreState): Config {
    return new Proxy(config, {
        get(target, key) {
            const { overrides } = getState();
            return overrides && typeof key === "string" && key in overrides ? overrides[key] : Reflect.get(target, key);
        },
    });
}

export default definePlugin({
    name: "Experiments",
    icon: TestTubeIcon,
    description: "Unlock and toggle unreleased Grok features.",
    authors: [Devs.Prism],
    tags: ["developer"],
    settings,
    startAt: StartAt.TurbopackReady,

    _proxy: overrideProxy,

    start() {
        if (settings.store.browserNotifications && Notification.permission === "default") Notification.requestPermission().catch(() => {});
        const state = FeatureStore.useFeatureStore.getState();
        if (state.status === "ready") syncKnownFlags(state.config);
    },

    zustand: {
        FeatureStore: {
            selector: (s: FeatureStoreState) => s.status === "ready" ? s.config : null,
            handler(config: FeatureStoreState["config"] | null) {
                if (config) syncKnownFlags(config);
            },
        },
    },

    patches: [
        {
            find: "xai-ff-overrides",
            all: true,
            replacement: {
                match: /return \i\.overridesEnabled&&(void 0!==\i\.overrides\[\i\])/,
                replace: "return $1",
            },
        },
        {
            find: '"Feature flag overrides active","Feature flag overrides active"',
            replacement: {
                match: /\.toast\.warning\(\i\("Feature flag overrides active","Feature flag overrides active"\).{0,60}?\)/,
                replace: "&&void 0",
            },
        },
        {
            find: "feature-store-set-override",
            all: true,
            group: true,
            replacement: [
                {
                    match: /config:("ready"===\i\.status\?\i\.serverConfig:\{\})/,
                    replace: "config:$self._proxy($1,this.get)",
                },
                {
                    match: /"ready"===\i\.status\)\i\(this\.config\)/,
                    replace: "$&,this.config=$self._proxy(this.config,this.get)",
                },
            ],
        },
    ],
});
