/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ITEMS = 30;
export const PENDING_MS = 2_000;
const TEXT_MAX = 100_000;
const QUOTE_MAX = 20_000;

export interface QueueIntent {
    modeId: string;
    modelMode: string;
    activeModelId: string;
}

export interface QueueSnap {
    id: string;
    text: string;
    fileAttachmentIds: string[];
    parentQuotedText: string;
    parentId: string | null;
    intent?: QueueIntent;
    position: number;
    savedAt: number;
}

export interface OfficialItem {
    id: string;
    position: number;
    parentId: string | null;
    text: string;
    fileAttachmentIds: string[];
    parentQuotedText: string;
}

export function clipText(value: unknown, max = TEXT_MAX): string {
    if (typeof value !== "string") return "";
    const text = value.trim();
    return text.length > max ? text.slice(0, max) : text;
}

export function fileIdsOf(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
        if (out.length >= 64) break;
        if (typeof item === "string") {
            const id = item.trim();
            if (id && id.length <= 200) out.push(id);
            continue;
        }
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const raw = rec.fileAttachmentId ?? rec.fileId ?? rec.assetId ?? rec.id;
        if (typeof raw !== "string") continue;
        const id = raw.trim();
        if (id && id.length <= 200) out.push(id);
    }
    return out;
}

export function freshSnaps(items: QueueSnap[], now: number): QueueSnap[] {
    return items.filter(item => item && now - item.savedAt < TTL_MS && (item.text || item.fileAttachmentIds.length)).slice(0, MAX_ITEMS);
}

export function shouldReplay(officialCount: number, saved: QueueSnap[], now: number): boolean {
    return officialCount === 0 && freshSnaps(saved, now).length > 0;
}

function intentOf(intent: QueueIntent | undefined): QueueIntent | undefined {
    if (!intent?.modeId) return undefined;
    return {
        modeId: intent.modeId,
        modelMode: intent.modelMode || "",
        activeModelId: intent.activeModelId || "",
    };
}

export function bindPending(saved: QueueSnap[], official: OfficialItem[], pending: QueueSnap[], now: number): { saved: QueueSnap[]; pending: QueueSnap[] } {
    const known = new Set(saved.map(item => item.id));
    const left = pending.filter(item => now - item.savedAt < PENDING_MS);
    const extra: QueueSnap[] = [];
    for (const off of official) {
        if (!off.id || known.has(off.id)) continue;
        const src = left.shift();
        if (!src) continue;
        extra.push({
            ...src,
            id: off.id,
            position: off.position,
            parentId: off.parentId,
            savedAt: now,
        });
        known.add(off.id);
    }
    return { saved: saved.concat(extra), pending: left };
}

export function projectQueue(saved: QueueSnap[], official: OfficialItem[], pending: QueueSnap[], hydrated: boolean, now: number): QueueSnap[] {
    const fresh = freshSnaps(saved, now);
    const bound = bindPending(fresh, official, pending, now);
    if (!official.length) {
        if (hydrated && !bound.pending.length) return [];
        return freshSnaps(bound.saved, now);
    }
    const byId = new Map(bound.saved.map(item => [item.id, item]));
    const next: QueueSnap[] = [];
    const ordered = official.slice().sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    for (const off of ordered) {
        if (!off.id) continue;
        const prev = byId.get(off.id);
        const text = off.text || prev?.text || "";
        const fileAttachmentIds = off.fileAttachmentIds.length ? off.fileAttachmentIds : (prev?.fileAttachmentIds ?? []);
        const parentQuotedText = off.parentQuotedText || prev?.parentQuotedText || "";
        if (!text && !fileAttachmentIds.length) continue;
        const prevFiles = prev?.fileAttachmentIds.join("\0") ?? "";
        const changed = !prev
            || prev.text !== text
            || prev.position !== off.position
            || prev.parentQuotedText !== parentQuotedText
            || prev.parentId !== off.parentId
            || prevFiles !== fileAttachmentIds.join("\0");
        next.push({
            id: off.id,
            text,
            fileAttachmentIds,
            parentQuotedText,
            parentId: off.parentId,
            intent: intentOf(prev?.intent),
            position: off.position,
            savedAt: changed ? now : prev.savedAt,
        });
        if (next.length >= MAX_ITEMS) break;
    }
    return next;
}

export function sameQueue(a: QueueSnap[], b: QueueSnap[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const left = a[i];
        const right = b[i];
        if (left.id !== right.id || left.text !== right.text || left.position !== right.position) return false;
        if (left.parentId !== right.parentId || left.parentQuotedText !== right.parentQuotedText) return false;
        if (left.fileAttachmentIds.join("\0") !== right.fileAttachmentIds.join("\0")) return false;
        if ((left.intent?.modeId ?? "") !== (right.intent?.modeId ?? "")) return false;
        if ((left.intent?.modelMode ?? "") !== (right.intent?.modelMode ?? "")) return false;
        if ((left.intent?.activeModelId ?? "") !== (right.intent?.activeModelId ?? "")) return false;
    }
    return true;
}

export function applyRowText(saved: QueueSnap[], rows: { id: string; text: string }[], now: number): QueueSnap[] {
    if (!rows.length) return saved;
    const textById = new Map(rows.map(row => [row.id, clipText(row.text, TEXT_MAX)]));
    let changed = false;
    const next = saved.map(item => {
        const text = textById.get(item.id) ?? "";
        if (!text || text === item.text) return item;
        if (item.text.startsWith(text) && text.length < item.text.length) return item;
        changed = true;
        return { ...item, text, savedAt: now };
    });
    return changed ? next : saved;
}

export function quoteText(value: unknown): string {
    return clipText(value, QUOTE_MAX);
}
