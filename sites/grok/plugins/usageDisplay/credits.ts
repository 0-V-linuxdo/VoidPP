/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { clamp } from "@utils/misc";

export const CREDITS_CONFIG_PATH = "/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
export const OFFICIAL_USAGE_PATH = "/?_s=usage";
export const REQUEST_TIMEOUT_MS = 12_000;
export const BOT_WEEKLY_LABEL = "Weekly Grok Bot Limit";
const WEEKLY_LIMIT_RE = /Weekly SuperGrok.{0,24}Limit|每周.{0,24}SuperGrok.{0,24}(?:Limit|限额)/i;

export interface UsageCategory {
    label: string;
    percent: number;
}

export interface WeeklyUsage {
    label: string;
    usedPercent: number | null;
    resetText: string;
    resetAt: number | null;
    categories: UsageCategory[];
}

export interface NativeUsage {
    weekly: WeeklyUsage;
}

interface ProtoVarint {
    value: number;
    index: number;
}

interface ProtoField {
    number: number;
    wire: number;
    value: number | Uint8Array;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function finiteNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeText(value: unknown): string {
    return String(value ?? "")
        .replaceAll("\u00a0", " ")
        .replaceAll(/[\t ]+/g, " ")
        .trim();
}

export function formatPercent(value: unknown): string {
    const number = finiteNumber(value);
    if (number === null) return "—";
    const rounded = Math.round(number * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

export function usageTone(value: unknown): "waiting" | "danger" | "warning" | "normal" {
    const percent = finiteNumber(value);
    if (percent === null) return "waiting";
    if (percent >= 90) return "danger";
    if (percent >= 70) return "warning";
    return "normal";
}

export function isOfficialUsagePage(): boolean {
    try {
        return new URL(location.href).searchParams.get("_s")?.toLowerCase() === "usage";
    } catch {
        return false;
    }
}

export function officialUsageUrl(): string {
    return new URL(OFFICIAL_USAGE_PATH, location.href).href;
}

function readProtoVarint(bytes: Uint8Array, startIndex: number): ProtoVarint | null {
    let value = 0;
    let index = startIndex;
    let shift = 0;
    for (let count = 0; index < bytes.length && count < 10; count++) {
        const byte = bytes[index++];
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) return { value, index };
        shift += 7;
    }
    return null;
}

function readProtoFields(bytes: Uint8Array): ProtoField[] {
    const fields: ProtoField[] = [];
    let index = 0;
    while (index < bytes.length) {
        const tag = readProtoVarint(bytes, index);
        if (!tag) break;
        index = tag.index;
        const fieldNumber = Math.floor(tag.value / 8);
        const wireType = tag.value & 7;
        if (fieldNumber <= 0) break;

        if (wireType === 0) {
            const value = readProtoVarint(bytes, index);
            if (!value) break;
            index = value.index;
            fields.push({ number: fieldNumber, wire: wireType, value: value.value });
        } else if (wireType === 1) {
            if (index + 8 > bytes.length) break;
            fields.push({ number: fieldNumber, wire: wireType, value: bytes.slice(index, index + 8) });
            index += 8;
        } else if (wireType === 2) {
            const length = readProtoVarint(bytes, index);
            if (!length || length.value < 0 || index + length.value > bytes.length) break;
            index = length.index;
            if (index + length.value > bytes.length) break;
            fields.push({ number: fieldNumber, wire: wireType, value: bytes.slice(index, index + length.value) });
            index += length.value;
        } else if (wireType === 5) {
            if (index + 4 > bytes.length) break;
            fields.push({ number: fieldNumber, wire: wireType, value: bytes.slice(index, index + 4) });
            index += 4;
        } else {
            break;
        }
    }
    return fields;
}

function grpcDataFrame(bytes: Uint8Array): Uint8Array | null {
    let index = 0;
    while (index + 5 <= bytes.length) {
        const flags = bytes[index];
        const length =
            bytes[index + 1] * 0x1000000 +
            bytes[index + 2] * 0x10000 +
            bytes[index + 3] * 0x100 +
            bytes[index + 4];
        index += 5;
        if (index + length > bytes.length) return null;
        const frame = bytes.slice(index, index + length);
        index += length;
        if ((flags & 0x80) === 0) return frame;
    }
    return null;
}

function collectProtoTimestamps(bytes: Uint8Array, output: number[], depth: number) {
    if (depth > 6) return;
    for (const field of readProtoFields(bytes)) {
        if (field.wire === 0) {
            const value = finiteNumber(field.value);
            if (value !== null && value >= 1_000_000_000 && value <= 4_102_444_800) {
                output.push(value);
            }
        } else if (field.wire === 2 && field.value instanceof Uint8Array) {
            collectProtoTimestamps(field.value, output, depth + 1);
        }
    }
}

export function formatResetTime(seconds: unknown): string {
    const value = finiteNumber(seconds);
    if (value === null) return "";
    try {
        return new Date(value * 1000).toLocaleString([], {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

export function parseResetAt(text: string): number | null {
    const trimmed = normalizeText(text);
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed.replace(/\s+at\s+/i, " "));
    return Number.isFinite(parsed) ? parsed : null;
}

export function decodeCreditsConfig(bytes: Uint8Array): NativeUsage | null {
    const data = grpcDataFrame(bytes);
    if (!data) return null;
    const configField = readProtoFields(data).find(field => field.number === 1 && field.wire === 2);
    if (!configField || !(configField.value instanceof Uint8Array)) return null;

    const percentField = readProtoFields(configField.value).find(field => field.number === 1 && field.wire === 5);
    let usedPercent = 0;
    if (percentField && percentField.value instanceof Uint8Array && percentField.value.length >= 4) {
        const view = new DataView(
            percentField.value.buffer,
            percentField.value.byteOffset,
            percentField.value.byteLength,
        );
        const decodedPercent = view.getFloat32(0, true);
        if (Number.isFinite(decodedPercent)) usedPercent = clamp(decodedPercent, 0, 100);
    }

    const timestamps: number[] = [];
    collectProtoTimestamps(configField.value, timestamps, 0);
    const resetSeconds = timestamps.length ? Math.max(...timestamps) : null;
    return {
        weekly: {
            label: "Weekly SuperGrok Limit",
            usedPercent,
            resetText: formatResetTime(resetSeconds),
            resetAt: resetSeconds === null ? null : resetSeconds * 1000,
            categories: [],
        },
    };
}

export function normalizeNativeUsage(value: unknown): NativeUsage | null {
    if (!isRecord(value) || !isRecord(value.weekly)) return null;
    const { weekly } = value;
    const usedPercent = finiteNumber(weekly.usedPercent);
    const resetText = normalizeText(weekly.resetText).slice(0, 160);
    const resetAt = finiteNumber(weekly.resetAt) ?? parseResetAt(resetText);
    const categories = Array.isArray(weekly.categories)
        ? weekly.categories
            .map(item => {
                if (!isRecord(item)) return null;
                const percent = finiteNumber(item.percent);
                const label = normalizeText(item.label).slice(0, 120);
                return label && percent !== null
                    ? { label, percent: clamp(percent, 0, 100) }
                    : null;
            })
            .filter((item): item is UsageCategory => item != null)
            .slice(0, 20)
        : [];
    return {
        weekly: {
            label: normalizeText(weekly.label || "Weekly SuperGrok Limit").slice(0, 120),
            usedPercent: usedPercent === null ? null : clamp(usedPercent, 0, 100),
            resetText,
            resetAt,
            categories,
        },
    };
}

export function normalizeBotUsage(value: unknown): NativeUsage | null {
    if (!isRecord(value)) return null;
    const usedPercent = finiteNumber(value.usagePercent);
    if (usedPercent === null) return null;
    const resetAt = finiteNumber(value.nextResetAtMs);
    return {
        weekly: {
            label: BOT_WEEKLY_LABEL,
            usedPercent: clamp(Math.round(usedPercent), 0, 100),
            resetText: resetAt == null ? "" : formatResetTime(resetAt / 1000),
            resetAt,
            categories: [],
        },
    };
}

export function mergeNativeUsage(...sources: unknown[]): NativeUsage | null {
    let merged: NativeUsage | null = null;
    for (const source of sources) {
        const next = normalizeNativeUsage(source);
        if (!next) continue;
        if (!merged) {
            merged = next;
            continue;
        }
        const previousWeekly: WeeklyUsage = merged.weekly;
        const nextWeekly: WeeklyUsage = next.weekly;
        merged = {
            weekly: {
                ...previousWeekly,
                ...nextWeekly,
                usedPercent: nextWeekly.usedPercent === null
                    ? previousWeekly.usedPercent
                    : nextWeekly.usedPercent,
                resetText: nextWeekly.resetText || previousWeekly.resetText,
                resetAt: nextWeekly.resetAt ?? previousWeekly.resetAt,
                categories: nextWeekly.categories.length
                    ? nextWeekly.categories
                    : previousWeekly.categories,
            },
        };
    }
    return merged;
}

function linesFromPage(): string[] {
    const text = document.body?.innerText || document.body?.textContent;
    return String(text || "")
        .split(/\r?\n/)
        .map(normalizeText)
        .filter(Boolean);
}

function findLineIndex(lines: string[], pattern: RegExp): number {
    pattern.lastIndex = 0;
    return lines.findIndex(line => {
        pattern.lastIndex = 0;
        return pattern.test(line);
    });
}

function readUsagePercentFromDom(): number | null {
    const selectors = [
        "number-flow-react[aria-label]",
        "[role=\"img\"][aria-label]",
        "[aria-label*=\"%\"]",
    ];
    const seen = new Set<Element>();
    for (const selector of selectors) {
        let elements: NodeListOf<Element>;
        try {
            elements = document.querySelectorAll(selector);
        } catch {
            continue;
        }
        for (const element of elements) {
            if (seen.has(element)) continue;
            seen.add(element);
            const ariaLabel = normalizeText(element.getAttribute("aria-label"));
            const match = ariaLabel.match(/^(\d+(?:\.\d+)?)\s*%$/);
            if (!match) continue;
            let ancestor: Element | null = element;
            for (let depth = 0; ancestor && depth < 8; depth++) {
                const context = normalizeText(ancestor.textContent);
                WEEKLY_LIMIT_RE.lastIndex = 0;
                if (WEEKLY_LIMIT_RE.test(context) && /\bused\b|已使用/i.test(context)) {
                    return Number(match[1]);
                }
                ancestor = ancestor.parentElement;
            }
        }
    }
    return null;
}

function usedPercentFromPage(domPercent: number | null, usedMatch: RegExpMatchArray | null): number | null {
    if (domPercent !== null) return domPercent;
    if (usedMatch) return Number(usedMatch[1]);
    return null;
}

export function readNativeUsage(lines = linesFromPage()): NativeUsage | null {
    const weeklyIndex = findLineIndex(lines, WEEKLY_LIMIT_RE);
    if (weeklyIndex < 0) return null;

    const weeklyLines: string[] = [];
    for (const line of lines.slice(weeklyIndex, weeklyIndex + 16)) {
        if (
            weeklyLines.length > 0
            && /^(?:Usage Limit Reset|Extra Usage Credits|使用限额重置|额外使用额度)$/i.test(line)
        ) {
            break;
        }
        weeklyLines.push(line);
    }
    const usedLineIndex = weeklyLines.findIndex(line => /\bused\b|已使用/i.test(line));
    const usedLine = usedLineIndex >= 0 ? weeklyLines[usedLineIndex] : "";
    const previousLine = usedLineIndex > 0 ? weeklyLines[usedLineIndex - 1] : "";
    const usedMatch = `${previousLine} ${usedLine}`.match(/(\d+(?:\.\d+)?)\s*%\s*(?:used|已使用)/i);
    const domPercent = readUsagePercentFromDom();
    const resetLine = weeklyLines.find(line => /Resets|重置/i.test(line));
    const resetMatch = resetLine?.match(/(?:Resets|重置)\s+(.+)/i);
    const categories: UsageCategory[] = [];

    for (const line of weeklyLines) {
        const match = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%$/);
        if (!match || /used|已使用|resets|重置/i.test(match[1])) continue;
        categories.push({ label: normalizeText(match[1]), percent: Number(match[2]) });
    }

    return {
        weekly: {
            label: lines[weeklyIndex],
            usedPercent: usedPercentFromPage(domPercent, usedMatch),
            resetText: resetMatch ? normalizeText(resetMatch[1]) : "",
            resetAt: resetMatch ? parseResetAt(resetMatch[1]) : null,
            categories,
        },
    };
}

export async function fetchOfficialUsage(): Promise<NativeUsage> {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
        const response = await fetch(new URL(CREDITS_CONFIG_PATH, location.href).href, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: {
                accept: "*/*",
                "content-type": "application/grpc-web+proto",
                "x-grpc-web": "1",
                "x-user-agent": "connect-es/2.1.1",
            },
            body: new Uint8Array([0, 0, 0, 0, 0]),
            ...(controller ? { signal: controller.signal } : {}),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const usage = decodeCreditsConfig(new Uint8Array(await response.arrayBuffer()));
        if (!usage) throw new Error("unsupported-official-usage-schema");
        return usage;
    } finally {
        if (timeout !== null) window.clearTimeout(timeout);
    }
}

const STORAGE_PREFIX = "void-usage-display:v1:";

export function readStoredUsage(userId: string): NativeUsage | null {
    if (!userId) return null;
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_PREFIX + userId) || "null");
        if (!isRecord(stored) || stored.version !== 1 || stored.userId !== userId) return null;
        return normalizeNativeUsage(stored.nativeUsage);
    } catch {
        return null;
    }
}

export function persistUsage(userId: string, usage: NativeUsage | null, updatedAt: number) {
    if (!userId) return;
    try {
        localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify({
            version: 1,
            userId,
            updatedAt,
            nativeUsage: normalizeNativeUsage(usage),
        }));
    } catch {
        // Storage may be unavailable in a private or restricted context.
    }
}
