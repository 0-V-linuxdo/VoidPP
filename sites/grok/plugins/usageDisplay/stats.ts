/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { clamp } from "@utils/misc";

import { finiteNumber, formatPercent } from "./credits";

export const STATS_STORAGE_PREFIX = "void-usage-display:stats:v1:";
export const STATS_VERSION = 1;
export const RESET_DROP_PERCENT = 5;
export const RESET_AT_TOLERANCE_MS = 60_000;
export const RETAIN_MIN = 7;
export const RETAIN_MAX = 180;
export const RETAIN_DEFAULT = 90;
export const DELAY_MIN = 0;
export const DELAY_MAX = 5;
export const DELAY_DEFAULT = 1;
export const CHART_WINDOW = 7;
export const CHART_SCALE_MIN = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const logger = new Logger("UsageDisplay");

export interface DailyUsageRecord {
    date: string;
    startPercent: number | null;
    lastPercent: number | null;
    resetAt: number | null;
    accruedPercent: number;
    priorStartPercent: number | null;
    priorLastPercent: number | null;
    updatedAt: number;
}

interface StatsFile {
    version: number;
    userId: string;
    days: Record<string, DailyUsageRecord>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampPercent(value: unknown): number | null {
    const n = finiteNumber(value);
    return n == null ? null : clamp(n, 0, 100);
}

export function localDateKey(at: number): string {
    const d = new Date(at);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function startOfLocalDay(at: number): number {
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

export function emptyDay(date: string, now: number): DailyUsageRecord {
    return {
        date,
        startPercent: null,
        lastPercent: null,
        resetAt: null,
        accruedPercent: 0,
        priorStartPercent: null,
        priorLastPercent: null,
        updatedAt: now,
    };
}

function normalizeDay(date: string, value: unknown): DailyUsageRecord | null {
    if (!DATE_RE.test(date) || !isRecord(value)) return null;
    return {
        date,
        startPercent: clampPercent(value.startPercent),
        lastPercent: clampPercent(value.lastPercent),
        resetAt: finiteNumber(value.resetAt),
        accruedPercent: Math.max(0, finiteNumber(value.accruedPercent) ?? 0),
        priorStartPercent: clampPercent(value.priorStartPercent),
        priorLastPercent: clampPercent(value.priorLastPercent),
        updatedAt: finiteNumber(value.updatedAt) ?? 0,
    };
}

function emptyStore(userId: string): StatsFile {
    return { version: STATS_VERSION, userId, days: {} };
}

const memory = new Map<string, string>();

function storeGet(key: string): string | null {
    if (typeof localStorage === "undefined") return memory.get(key) ?? null;
    try {
        return localStorage.getItem(key);
    } catch (error) {
        logger.debug("Failed to read usage stats", error);
        return memory.get(key) ?? null;
    }
}

function storeSet(key: string, value: string) {
    if (typeof localStorage === "undefined") {
        memory.set(key, value);
        return;
    }
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        logger.debug("Failed to persist usage stats", error);
        memory.set(key, value);
    }
}

function storeRemove(key: string) {
    if (typeof localStorage === "undefined") {
        memory.delete(key);
        return;
    }
    try {
        localStorage.removeItem(key);
    } catch (error) {
        logger.debug("Failed to clear usage stats", error);
        memory.delete(key);
    }
}

function loadStore(userId: string): StatsFile {
    if (!userId) return emptyStore("");
    try {
        const raw = JSON.parse(storeGet(STATS_STORAGE_PREFIX + userId) || "null");
        if (!isRecord(raw) || raw.version !== STATS_VERSION || raw.userId !== userId || !isRecord(raw.days)) {
            return emptyStore(userId);
        }
        const days: Record<string, DailyUsageRecord> = {};
        for (const [date, value] of Object.entries(raw.days)) {
            const rec = normalizeDay(date, value);
            if (rec) days[date] = rec;
        }
        return { version: STATS_VERSION, userId, days };
    } catch (error) {
        logger.debug("Failed to read usage stats", error);
        return emptyStore(userId);
    }
}

function saveStore(file: StatsFile) {
    if (!file.userId) return;
    storeSet(STATS_STORAGE_PREFIX + file.userId, JSON.stringify(file));
}

function closeSegment(record: DailyUsageRecord, percent: number | null) {
    const { startPercent, lastPercent } = record;
    if (startPercent != null && lastPercent != null) {
        record.accruedPercent += Math.max(0, lastPercent - startPercent);
        record.priorStartPercent = startPercent;
        record.priorLastPercent = lastPercent;
    }
    record.startPercent = percent;
    record.lastPercent = percent;
}

export function applySnapshot(
    record: DailyUsageRecord,
    percent: number | null,
    resetAt: number | null,
    now: number,
): DailyUsageRecord {
    const next: DailyUsageRecord = {
        ...record,
        accruedPercent: record.accruedPercent ?? 0,
        updatedAt: now,
    };

    if (resetAt != null && next.resetAt != null && Math.abs(resetAt - next.resetAt) >= RESET_AT_TOLERANCE_MS) {
        closeSegment(next, percent);
        next.resetAt = resetAt;
        return next;
    }
    if (resetAt != null) next.resetAt = resetAt;

    if (percent == null) return next;

    if (next.lastPercent != null && percent < next.lastPercent - RESET_DROP_PERCENT) {
        closeSegment(next, percent);
        return next;
    }

    if (next.startPercent == null) next.startPercent = percent;
    next.lastPercent = percent;
    return next;
}

export function dayDelta(record: DailyUsageRecord): number | null {
    const accrued = record.accruedPercent ?? 0;
    if (record.startPercent == null || record.lastPercent == null) {
        return accrued > 0 ? accrued : null;
    }
    return accrued + Math.max(0, record.lastPercent - record.startPercent);
}

export function isWipedReset(record: DailyUsageRecord, prev: DailyUsageRecord | null): boolean {
    if ((record.accruedPercent ?? 0) > 0 || record.priorLastPercent != null) return false;
    if (record.startPercent == null || record.lastPercent == null) return false;
    if (record.startPercent > RESET_DROP_PERCENT) return false;
    const prevLast = prev?.lastPercent;
    return prevLast != null && prevLast > record.startPercent + RESET_DROP_PERCENT;
}

export function repairWipedReset(
    record: DailyUsageRecord,
    dayStartPercent: number,
    preResetPercent: number,
    now = Date.now(),
): DailyUsageRecord {
    const dayStart = clamp(dayStartPercent, 0, 100);
    const preReset = clamp(preResetPercent, 0, 100);
    return {
        ...record,
        accruedPercent: Math.max(0, preReset - dayStart),
        priorStartPercent: dayStart,
        priorLastPercent: preReset,
        updatedAt: now,
    };
}

export function formatDelta(value: number | null): string {
    if (value == null) return "—";
    const label = formatPercent(value);
    return value > 0 ? `+${label}` : label;
}

export function formatDayLabel(date: string): string {
    const parts = date.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return date;
    return new Date(y, m - 1, d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

export function formatDayNumber(date: string): string {
    const day = date.split("-")[2];
    return day ? String(Number(day)) : date;
}

export function shiftDateKey(date: string, days: number): string {
    const parts = date.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return date;
    return localDateKey(new Date(y, m - 1, d + days).getTime());
}

export function fillChartDays(records: DailyUsageRecord[], now = Date.now()): DailyUsageRecord[] {
    const today = localDateKey(now);
    const byDate = new Map<string, DailyUsageRecord>();
    let oldest = today;
    for (const rec of records) {
        byDate.set(rec.date, rec);
        if (rec.date < oldest) oldest = rec.date;
    }
    const weekStart = shiftDateKey(today, 1 - CHART_WINDOW);
    const start = oldest < weekStart ? oldest : weekStart;
    const out: DailyUsageRecord[] = [];
    for (let key = start; key <= today; key = shiftDateKey(key, 1)) {
        out.push(byDate.get(key) ?? emptyDay(key, now));
    }
    return out;
}

export function chartScale(records: DailyUsageRecord[]): number {
    let max = 0;
    for (const rec of records) {
        const delta = dayDelta(rec);
        if (delta != null && delta > max) max = delta;
    }
    return Math.max(CHART_SCALE_MIN, Math.ceil(max / 10) * 10);
}

export function pruneDays(
    days: Record<string, DailyUsageRecord>,
    retainDays: number,
    now: number,
): Record<string, DailyUsageRecord> {
    const keep = clamp(Math.floor(retainDays), RETAIN_MIN, RETAIN_MAX);
    const cutoff = localDateKey(startOfLocalDay(now) - (keep - 1) * DAY_MS);
    const out: Record<string, DailyUsageRecord> = {};
    for (const [date, rec] of Object.entries(days)) {
        if (date >= cutoff) out[date] = rec;
    }
    return out;
}

function persistDay(userId: string, date: string, record: DailyUsageRecord, retainDays: number, now: number): DailyUsageRecord {
    const file = loadStore(userId);
    file.days[date] = record;
    file.days = pruneDays(file.days, retainDays, now);
    saveStore(file);
    return file.days[date] ?? record;
}

export function writeDay(
    userId: string,
    record: DailyUsageRecord,
    retainDays: number,
    now = Date.now(),
): DailyUsageRecord | null {
    if (!userId || !DATE_RE.test(record.date)) return null;
    return persistDay(userId, record.date, { ...record, updatedAt: now }, retainDays, now);
}

export function recordSnapshot(
    userId: string,
    percent: number | null,
    resetAt: number | null,
    retainDays: number,
    now = Date.now(),
): DailyUsageRecord | null {
    if (!userId) return null;
    const date = localDateKey(now);
    const current = loadStore(userId).days[date] ?? emptyDay(date, now);
    return persistDay(userId, date, applySnapshot(current, percent, resetAt, now), retainDays, now);
}

export function readToday(userId: string, now = Date.now()): DailyUsageRecord | null {
    if (!userId) return null;
    return loadStore(userId).days[localDateKey(now)] ?? null;
}

export function listDays(userId: string): DailyUsageRecord[] {
    if (!userId) return [];
    const { days } = loadStore(userId);
    const out: DailyUsageRecord[] = [];
    for (const date of Object.keys(days).toSorted((a, b) => b.localeCompare(a))) {
        const rec = days[date];
        if (rec) out.push(rec);
    }
    return out;
}

export function clearStats(userId: string) {
    if (!userId) return;
    storeRemove(STATS_STORAGE_PREFIX + userId);
}

export function retainDaysOf(value: unknown): number {
    return clamp(Math.floor(finiteNumber(value) ?? RETAIN_DEFAULT), RETAIN_MIN, RETAIN_MAX);
}

export function hoverDelayOf(value: unknown): number {
    return clamp(Math.floor(finiteNumber(value) ?? DELAY_DEFAULT), DELAY_MIN, DELAY_MAX);
}
