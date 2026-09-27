/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { ChatBarButtonDef } from "@api/ChatBarButtons";
import { type ModalProps, openModal } from "@api/Modals";
import { definePluginSettings, PlainSettings, SettingsStore } from "@api/Settings";
import { Button, ConfirmDialog, Flex, Input, Paragraph, Switch, Text } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { CircleGaugeIcon } from "@components/icons";
import { VoidPPDialogShell } from "@components/settings/tabs/VoidPPDialogShell";
import type { GrokSubscription } from "@grok-types";
import { getPlanName } from "@turbopack/common/plan";
import { React, useEffect, useRef, useState } from "@turbopack/common/react";
import { RoutingStore, SessionStore, SubscriptionsStore } from "@turbopack/common/stores";
import { findByPropsLazy } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { classes, classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { clamp, createExternalStore, formatCountdown } from "@utils/misc";
import { useExternalStore } from "@utils/react";
import { pluralize } from "@utils/text";
import definePlugin, { OptionType } from "@utils/types";

import {
    fetchOfficialUsage,
    finiteNumber,
    formatPercent,
    mergeNativeUsage,
    type NativeUsage,
    normalizeBotUsage,
    persistUsage,
    readNativeUsage,
    readStoredUsage,
    usageTone,
} from "./credits";
import {
    chartScale,
    clearStats,
    type DailyUsageRecord,
    dayDelta,
    DELAY_DEFAULT,
    DELAY_MAX,
    DELAY_MIN,
    fillChartDays,
    formatDayLabel,
    formatDayNumber,
    formatDelta,
    hoverDelayOf,
    isWipedReset,
    listDays,
    localDateKey,
    readToday,
    recordSnapshot,
    repairWipedReset,
    RETAIN_DEFAULT,
    RETAIN_MAX,
    RETAIN_MIN,
    retainDaysOf,
    shiftDateKey,
    writeDay,
} from "./stats";

const logger = new Logger("UsageDisplay");
const cl = classNameFactory("void-ud-");

const settings = definePluginSettings({
    usageStats: {
        type: OptionType.BOOLEAN,
        description: "Record daily usage. Hover shows today after a delay; click opens history.",
        default: false,
    },
    showPercent: {
        type: OptionType.BOOLEAN,
        description: "Show the used-percent label next to the ring.",
        default: false,
    },
    hoverStatsDelay: {
        type: OptionType.SLIDER,
        description: "Seconds to hover before showing today's usage stats.",
        min: DELAY_MIN,
        max: DELAY_MAX,
        default: DELAY_DEFAULT,
    },
    retainDays: {
        type: OptionType.SLIDER,
        description: "Days of usage history to keep.",
        min: RETAIN_MIN,
        max: RETAIN_MAX,
        default: RETAIN_DEFAULT,
    },
    clearStats: {
        type: OptionType.COMPONENT,
        component: ClearStats,
    },
});

const AUTO_REFRESH_MS = 60 * 1000;
const STALE_MS = 30 * 1000;
const DAY_SECONDS = 86_400;
const RING_SIZE = 18;
const RING_RADIUS = 7;
const RING_CENTER = RING_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const LOCAL_ACCOUNT = "local";
const BOT_POOL = ":bot";

const BotsStore = findByPropsLazy("useBotsStore");

const store = createExternalStore();

interface UsageState {
    loading: boolean;
    lastFetchAt: number;
    lastUpdatedAt: number;
    usage: NativeUsage | null;
    userId: string;
}

const state: UsageState = {
    loading: false,
    lastFetchAt: 0,
    lastUpdatedAt: 0,
    usage: null,
    userId: "",
};

let refreshPromise: Promise<boolean> | null = null;
let unsubRoute: (() => void) | null = null;

function isBotPage(): boolean {
    try {
        return RoutingStore.useRoutingStore.getState().route?.page === "bot";
    } catch {
        return false;
    }
}

function sessionUser() {
    try {
        const user = SessionStore.getSessionStoreState?.()?.user;
        if (user) return user;
    } catch {}
    try {
        return SessionStore.sessionStoreState?.getState?.()?.user;
    } catch {
        return;
    }
}

function currentUserId(): string {
    const user = sessionUser();
    return user?.userId || user?.xUserId || LOCAL_ACCOUNT;
}

function currentPoolId(): string {
    const userId = currentUserId();
    if (!userId) return "";
    return isBotPage() ? `${userId}${BOT_POOL}` : userId;
}

function loadMemory(userId: string) {
    if (!userId || userId === state.userId) return;
    const stored = readStoredUsage(userId);
    state.userId = userId;
    state.usage = stored;
    state.lastUpdatedAt = stored ? Date.now() : 0;
    state.lastFetchAt = 0;
    store.notify();
}

function syncAccount() {
    const userId = currentPoolId();
    if (!userId) return;
    loadMemory(userId);
}

async function fetchBotUsage(): Promise<NativeUsage | null> {
    try {
        const hook = BotsStore.useBotsStore;
        await hook.getState().refreshUsage();
        return normalizeBotUsage(hook.getState().usage);
    } catch (error) {
        logger.warn("Failed to fetch Grok Bot usage", error);
        return null;
    }
}

function migrateUsageStats() {
    const stored = PlainSettings.plugins.UsageDisplay;
    if (!stored || !("trackStats" in stored)) return;
    if (stored.trackStats === true) stored.usageStats = true;
    delete stored.trackStats;
    SettingsStore.markAsChanged();
}

function snapshotToday() {
    if (!settings.store.usageStats) return;
    syncAccount();
    if (!state.userId) return;
    recordSnapshot(
        state.userId,
        state.usage?.weekly.usedPercent ?? null,
        state.usage?.weekly.resetAt ?? null,
        retainDaysOf(settings.store.retainDays),
    );
}

async function refresh(reason = "manual"): Promise<boolean> {
    if (refreshPromise) return refreshPromise;
    if (reason === "poll" && Date.now() - state.lastFetchAt < STALE_MS) return false;

    syncAccount();
    const poolId = currentPoolId();
    state.loading = true;
    state.lastFetchAt = Date.now();
    store.notify();

    refreshPromise = (async () => {
        try {
            if (poolId.endsWith(BOT_POOL)) {
                const usage = await fetchBotUsage();
                if (currentPoolId() !== poolId) return false;
                if (usage) {
                    state.usage = usage;
                    state.lastUpdatedAt = Date.now();
                }
                if (state.userId) persistUsage(state.userId, state.usage, state.lastUpdatedAt);
                snapshotToday();
                return Boolean(state.usage);
            }
            const pageUsage = readNativeUsage();
            const remote = await fetchOfficialUsage()
                .then(usage => ({ ok: true as const, usage }))
                .catch(error => {
                    logger.warn("Failed to fetch official usage", error);
                    return { ok: false as const };
                });
            if (currentPoolId() !== poolId) return false;
            const merged = mergeNativeUsage(state.usage, remote.ok ? remote.usage : null, pageUsage);
            if (merged) state.usage = merged;
            if (state.usage || pageUsage) state.lastUpdatedAt = Date.now();
            if (state.userId) persistUsage(state.userId, state.usage, state.lastUpdatedAt);
            snapshotToday();
            return Boolean(state.usage);
        } finally {
            state.loading = false;
            refreshPromise = null;
            store.notify();
            if (currentPoolId() !== poolId) queueMicrotask(() => void refresh("route"));
        }
    })();

    return refreshPromise;
}

function onVisibility() {
    if (!document.hidden && Date.now() - state.lastFetchAt > STALE_MS) void refresh("visible");
}

function onStreamEnd() {
    void refresh("stream");
}

function readPlan() {
    if (isBotPage()) return false;
    let bestSubscription: GrokSubscription["tier"];
    try {
        bestSubscription = SubscriptionsStore.useSubscriptionsStore.getState().bestSubscription;
    } catch {
        bestSubscription = undefined;
    }
    return getPlanName(bestSubscription, sessionUser()?.xSubscriptionType) === "Free";
}

function triggerLabel(isFree: boolean, percent: number | null, loading: boolean, showPercent: boolean): string | null {
    if (isFree) return "Free";
    if (!showPercent) return null;
    if (percent !== null) return formatPercent(percent);
    return loading ? "…" : "—";
}

function usedLabel(isFree: boolean, percent: number | null, loading: boolean): string {
    if (isFree) return "Free";
    if (percent !== null) return `${formatPercent(percent)} used`;
    return loading ? "…" : "—";
}

function formatResetCountdown(totalSeconds: number): string {
    if (totalSeconds <= 0) return formatCountdown(0);
    const days = Math.floor(totalSeconds / DAY_SECONDS);
    const rest = totalSeconds % DAY_SECONDS;
    return days > 0 ? `${days}d ${formatCountdown(rest)}` : formatCountdown(rest);
}

function ProgressRing({ percent, tone }: { percent: number | null; tone: ReturnType<typeof usageTone> }) {
    const fraction = percent === null ? 0 : clamp(percent, 0, 100) / 100;
    return (
        <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className={classes(cl("ring"), cl(`ring-${tone}`))}>
            <circle cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} className={cl("ring-track")} />
            <circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_RADIUS}
                className={cl("ring-fill")}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
                transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
            />
        </svg>
    );
}

function ButtonIcon() {
    useExternalStore(store);
    const { showPercent } = settings.use(["showPercent"]);
    const weekly = state.usage?.weekly;
    const percent = weekly?.usedPercent ?? null;
    const tone = usageTone(percent);
    const isFree = readPlan();
    const label = triggerLabel(isFree, percent, state.loading, showPercent);

    useEffect(() => {
        void refresh("initial");
        const id = window.setInterval(() => {
            if (!document.hidden) void refresh("poll");
        }, AUTO_REFRESH_MS);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return (
        <span className={classes(cl("trigger"), label == null && cl("icon-only"))}>
            <ProgressRing percent={isFree ? null : percent} tone={isFree ? "waiting" : tone} />
            {label != null && <span className={cl("label")}>{label}</span>}
        </span>
    );
}

function WeekBlock({ isFree, percent, resetAt, loading, labeled }: {
    isFree: boolean;
    percent: number | null;
    resetAt: number | null;
    loading: boolean;
    labeled: boolean;
}) {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        if (resetAt == null) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [resetAt]);

    const left = resetAt == null ? 0 : Math.max(0, Math.ceil((resetAt - now) / 1000));

    return (
        <Flex flexDirection="column" gap={2} className={cl("week")}>
            {labeled && <Text size="xs" color="muted">{isBotPage() ? "Grok Bot" : "Week"}</Text>}
            <Text size="sm" weight="semibold" className={cl("used")}>{usedLabel(isFree, percent, loading)}</Text>
            {resetAt != null && <Text size="xs" color="muted">Resets in {formatResetCountdown(left)}</Text>}
        </Flex>
    );
}

function TodayBlock({ isFree, percent }: { isFree: boolean; percent: number | null }) {
    const today = state.userId ? readToday(state.userId) : null;
    const delta = today ? dayDelta(today) : null;
    return (
        <Flex flexDirection="column" gap={2} className={cl("today")}>
            <Text size="xs" color="muted">Today</Text>
            {!isFree && (
                <Text size="sm" weight="semibold" className={cl("used")}>
                    {formatDelta(delta ?? (percent != null ? 0 : null))} of weekly quota
                </Text>
            )}
        </Flex>
    );
}

function UsagePanel() {
    useExternalStore(store);
    const { usageStats, hoverStatsDelay } = settings.use(["usageStats", "hoverStatsDelay"]);
    const delay = hoverDelayOf(hoverStatsDelay);
    const [showToday, setShowToday] = useState(usageStats && delay <= 0);
    const weekly = state.usage?.weekly;
    const percent = weekly?.usedPercent ?? null;
    const isFree = readPlan();
    const resetAt = weekly?.resetAt ?? null;

    useEffect(() => {
        if (!usageStats) {
            setShowToday(false);
            return;
        }
        if (delay <= 0) {
            setShowToday(true);
            return;
        }
        setShowToday(false);
        const id = window.setTimeout(() => setShowToday(true), delay * 1000);
        return () => window.clearTimeout(id);
    }, [usageStats, delay]);

    useEffect(() => {
        if (!showToday) return;
        snapshotToday();
        store.notify();
    }, [showToday, percent]);

    return (
        <Flex flexDirection="column" gap={8} className={cl("panel")}>
            {showToday && <TodayBlock isFree={isFree} percent={percent} />}
            <WeekBlock isFree={isFree} percent={percent} resetAt={resetAt} loading={state.loading} labeled={showToday} />
        </Flex>
    );
}

function StatsToggle() {
    const { usageStats } = settings.use(["usageStats"]);
    return (
        <Flex alignItems="center" justifyContent="space-between" gap="0.75rem" className={cl("toggle")}>
            <Flex flexDirection="column" gap="0">
                <Text size="sm" weight="medium">Daily usage stats</Text>
                <Text size="xs" color="muted">Record local daily usage on this device.</Text>
            </Flex>
            <Switch
                checked={!!usageStats}
                onCheckedChange={value => {
                    settings.store.usageStats = value;
                    store.notify();
                    if (value) void refresh("manual");
                }}
            />
        </Flex>
    );
}

function Formula({
    terms,
    ops,
}: {
    terms: { label: string; value: string }[];
    ops: string[];
}) {
    return (
        <Flex alignItems="flex-start" gap="0.5rem" className={cl("formula")}>
            {terms.map((term, i) => (
                <React.Fragment key={term.label}>
                    {i > 0 && (
                        <Flex flexDirection="column" alignItems="center" className={cl("formula-op-col")}>
                            <span className={cl("formula-op")}>{ops[i - 1]}</span>
                            <span className={cl("formula-op")}>{ops[i - 1]}</span>
                        </Flex>
                    )}
                    <Flex flexDirection="column" alignItems="center" className={cl("formula-term")}>
                        <span className={cl("formula-label")}>{term.label}</span>
                        <span className={cl("formula-value")}>{term.value}</span>
                    </Flex>
                </React.Fragment>
            ))}
        </Flex>
    );
}

function DayFormula({ rec, today }: { rec: DailyUsageRecord; today: boolean }) {
    const used = dayDelta(rec);
    const accrued = rec.accruedPercent ?? 0;
    if (accrued > 0) {
        const after = rec.startPercent == null || rec.lastPercent == null
            ? null
            : Math.max(0, rec.lastPercent - rec.startPercent);
        let caption: string | null = null;
        if (rec.priorStartPercent != null && rec.priorLastPercent != null) {
            caption = `${formatPercent(rec.priorStartPercent)} → ${formatPercent(rec.priorLastPercent)}`;
            if (rec.startPercent != null && rec.lastPercent != null) {
                caption += `  +  ${formatPercent(rec.startPercent)} → ${formatPercent(rec.lastPercent)}`;
            }
        }
        return (
            <Flex flexDirection="column" gap="0.25rem">
                <Formula
                    terms={[
                        { label: "Before", value: formatPercent(accrued) },
                        { label: "After", value: formatPercent(after) },
                        { label: "Used", value: formatPercent(used) },
                    ]}
                    ops={["+", "="]}
                />
                {caption != null && (
                    <Text size="xs" color="muted" className={cl("formula-caption")}>{caption}</Text>
                )}
            </Flex>
        );
    }
    return (
        <Formula
            terms={[
                { label: today ? "Current" : "Last", value: formatPercent(rec.lastPercent) },
                { label: "Start", value: formatPercent(rec.startPercent) },
                { label: "Used", value: formatPercent(used) },
            ]}
            ops={["−", "="]}
        />
    );
}

function RepairReset({ rec, prev, userId }: { rec: DailyUsageRecord; prev: DailyUsageRecord | null; userId: string }) {
    const hint = prev?.lastPercent ?? null;
    const [draft, setDraft] = useState(hint == null ? "" : String(hint));

    useEffect(() => {
        setDraft(hint == null ? "" : String(hint));
    }, [rec.date, hint]);

    if (!isWipedReset(rec, prev)) return null;

    const pre = finiteNumber(draft);
    const dayStart = hint ?? 0;

    return (
        <Flex flexDirection="column" gap="0.35rem" className={cl("repair")}>
            <Text size="xs" color="muted">
                Week reset overwrote this day with 0%. Enter weekly usage just before the reset.
            </Text>
            <Flex alignItems="center" gap="0.5rem">
                <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={draft}
                    onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
                    className={cl("repair-input")}
                    aria-label="Weekly percent before reset"
                />
                <Button
                    variant="secondary"
                    size="sm"
                    shape="rectangle"
                    disabled={pre == null}
                    onClick={() => {
                        if (pre == null) return;
                        writeDay(
                            userId,
                            repairWipedReset(rec, dayStart, pre, Date.now()),
                            retainDaysOf(settings.store.retainDays),
                        );
                        store.notify();
                    }}
                >
                    Repair
                </Button>
            </Flex>
        </Flex>
    );
}

function StatsModal({ onClose }: ModalProps) {
    useExternalStore(store);
    const { usageStats } = settings.use(["usageStats"]);
    const days = usageStats && state.userId ? listDays(state.userId) : [];
    const todayKey = localDateKey(Date.now());
    const bars = days.length ? fillChartDays(days) : [];
    const scale = chartScale(bars);
    const [selected, setSelected] = useState(todayKey);
    const active = bars.find(d => d.date === selected) ?? bars.at(-1) ?? null;
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = chartRef.current;
        if (node) node.scrollLeft = node.scrollWidth;
    }, [bars.length]);

    useEffect(() => {
        chartRef.current?.querySelector(`.${cl("bar-on")}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }, [selected]);

    return (
        <VoidPPDialogShell title="Usage by date" subtitle="Stored on this device." onClose={onClose} size="sm">
            <StatsToggle />
            {!usageStats ? (
                <Paragraph>Turn on daily usage stats to keep a per-day log. Hover shows today after a delay.</Paragraph>
            ) : (days.length === 0 ? (
                <Paragraph>No days recorded yet. Stats start from the moment you enable tracking.</Paragraph>
            ) : (
                <Flex flexDirection="column" gap="0.75rem" className={cl("history")}>
                    <Flex
                        ref={chartRef}
                        className={cl("chart")}
                        alignItems="stretch"
                        gap="0.35rem"
                        tabIndex={0}
                        role="listbox"
                        aria-label="Daily usage"
                        onKeyDown={e => {
                            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                            e.preventDefault();
                            const i = Math.max(0, bars.findIndex(d => d.date === active?.date));
                            const next = bars[clamp(i + (e.key === "ArrowRight" ? 1 : -1), 0, bars.length - 1)];
                            if (next) setSelected(next.date);
                        }}
                    >
                        {bars.map(rec => {
                            const delta = dayDelta(rec);
                            const empty = delta == null;
                            const on = rec.date === active?.date;
                            const pct = empty || !scale ? 0 : clamp((delta / scale) * 100, 0, 100);
                            return (
                                <Button
                                    key={rec.date}
                                    variant="none"
                                    size="none"
                                    shape="rectangle"
                                    tabIndex={-1}
                                    role="option"
                                    aria-selected={on}
                                    aria-label={`${rec.date === todayKey ? "Today" : formatDayLabel(rec.date)}, ${formatDelta(delta)}`}
                                    className={classes(cl("bar"), on && cl("bar-on"), empty && cl("bar-empty"))}
                                    onClick={() => setSelected(rec.date)}
                                >
                                    <span className={cl("bar-value")}>{empty ? "\u00a0" : formatPercent(delta)}</span>
                                    <span className={cl("bar-track")}>
                                        <span className={cl("bar-fill")} style={{ height: `${pct}%` }} />
                                    </span>
                                    <span className={cl("bar-label")}>{rec.date === todayKey ? "Today" : formatDayNumber(rec.date)}</span>
                                </Button>
                            );
                        })}
                    </Flex>
                    {active != null && (
                        <Flex flexDirection="column" gap="0.35rem" className={cl("detail")}>
                            <Text size="sm" weight="semibold">{active.date === todayKey ? "Today" : formatDayLabel(active.date)}</Text>
                            <DayFormula rec={active} today={active.date === todayKey} />
                            {state.userId && (
                                <RepairReset
                                    rec={active}
                                    prev={bars.find(d => d.date === shiftDateKey(active.date, -1)) ?? null}
                                    userId={state.userId}
                                />
                            )}
                        </Flex>
                    )}
                </Flex>
            ))}
        </VoidPPDialogShell>
    );
}

function ClearStats() {
    useExternalStore(store);
    const [open, setOpen] = useState(false);
    const userId = state.userId || currentPoolId();
    const days = userId ? listDays(userId) : [];

    return (
        <Flex flexDirection="column" gap="0.5rem">
            <Paragraph>{pluralize(days.length, "recorded day")}.</Paragraph>
            <Button variant="secondary" size="sm" shape="rectangle" disabled={!days.length} onClick={() => setOpen(true)}>
                Clear usage history
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Clear usage history"
                description="Delete all locally recorded daily usage? This cannot be undone."
                confirmText="Clear"
                danger
                onConfirm={() => {
                    if (userId) clearStats(userId);
                    store.notify();
                }}
            />
        </Flex>
    );
}

function openHistory() {
    void refresh("manual");
    openModal(props => <SafeStatsModal {...props} />, { modalKey: "void-ud-stats" });
}

const SafeButtonIcon = ErrorBoundary.wrap(ButtonIcon);
const SafeUsagePanel = ErrorBoundary.wrap(UsagePanel);
const SafeStatsModal = ErrorBoundary.wrap(StatsModal);

const BUTTON_BASE = {
    icon: () => <SafeButtonIcon />,
    onClick: () => openHistory(),
    order: 1,
    className: "text-fg-primary",
    "aria-label": "Grok usage",
    locations: ["chat", "imagine"],
} satisfies ChatBarButtonDef;

export default definePlugin({
    name: "UsageDisplay",
    icon: CircleGaugeIcon,
    description: "Shows weekly SuperGrok or Grok Bot usage in the chat bar, with optional daily stats.",
    authors: [Devs.p],
    tags: ["composer"],
    enabledByDefault: true,
    settings,

    start() {
        migrateUsageStats();
        try {
            unsubRoute = RoutingStore.useRoutingStore.subscribe(s => s.route.page, (page, prev) => {
                if (page === prev) return;
                syncAccount();
                void refresh("route");
            });
        } catch (error) {
            logger.warn("RoutingStore subscribe failed", error);
        }
    },

    stop() {
        unsubRoute?.();
        unsubRoute = null;
    },

    chatBarButton: { ...BUTTON_BASE, tooltip: () => <SafeUsagePanel /> },

    events: {
        streamEnd: onStreamEnd,
    },

    onSettingsChange() {
        if (settings.store.usageStats) void refresh("manual");
    },
});
