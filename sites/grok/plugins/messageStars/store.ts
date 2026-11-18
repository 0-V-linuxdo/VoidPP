/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SessionStore } from "@turbopack/common/stores";
import { idbGet, idbSet } from "@utils/idb";
import { Logger } from "@utils/Logger";

import { type StarredMessage, starKey } from "./model";

const logger = new Logger("MessageStars");
const DB_KEY = "message-stars:v1";
const LOCAL_ACCOUNT = "local";
const CHANNEL = "voidpp.message-stars";

interface Doc {
    version: 1;
    buckets: Record<string, StarredMessage[]>;
}

let disk: StarredMessage[] = [];
let memory = new Map<string, StarredMessage>();
let doc: Doc = { version: 1, buckets: {} };
let account = LOCAL_ACCOUNT;
let loaded = false;
let dirty = false;
let alive = false;
let gen = 0;
let bc: BroadcastChannel | null = null;
const tabId = Math.random().toString(36).slice(2);
let onChange: (() => void) | null = null;

function emptyDoc(): Doc {
    return { version: 1, buckets: {} };
}

export function accountId(): string {
    try {
        const user = SessionStore.getSessionStoreState?.()?.user
            ?? SessionStore.sessionStoreState?.getState?.()?.user;
        return user?.userId || user?.xUserId || LOCAL_ACCOUNT;
    } catch {
        return LOCAL_ACCOUNT;
    }
}

function normalize(value: unknown): Doc {
    if (!value || typeof value !== "object") return emptyDoc();
    const raw = value as Partial<Doc>;
    const buckets: Record<string, StarredMessage[]> = {};
    if (raw.buckets && typeof raw.buckets === "object") {
        for (const [key, list] of Object.entries(raw.buckets)) {
            if (!Array.isArray(list)) continue;
            buckets[key] = list.filter(item => item && item.conversationId && item.messageId);
        }
    }
    return { version: 1, buckets };
}

function emit() {
    onChange?.();
}

async function write() {
    doc.buckets[account] = disk;
    try {
        await idbSet(DB_KEY, doc);
        dirty = false;
        try {
            bc?.postMessage({ tab: tabId, account });
        } catch (e) {
            logger.debug("star broadcast failed:", e);
        }
    } catch (e) {
        logger.error("Failed to save stars:", e);
    }
}

async function readIntoMemory() {
    const mine = gen;
    let next = emptyDoc();
    try {
        next = normalize(await idbGet<Doc>(DB_KEY));
    } catch (e) {
        logger.error("Failed to read stars:", e);
    }
    if (!alive || mine !== gen) return;
    doc = next;
    account = accountId();
    if (!dirty) disk = doc.buckets[account]?.slice() ?? [];
    else void write();
    loaded = true;
    emit();
}

export function stars(): StarredMessage[] {
    const out = new Map<string, StarredMessage>();
    for (const item of disk) out.set(starKey(item.conversationId, item.messageId), item);
    for (const [key, item] of memory) out.set(key, item);
    return [...out.values()];
}

export function hasStar(conversationId: string, messageId: string): boolean {
    const key = starKey(conversationId, messageId);
    if (memory.has(key)) return true;
    return disk.some(item => item.conversationId === conversationId && item.messageId === messageId);
}

export function putStar(item: StarredMessage, persist: boolean) {
    const key = starKey(item.conversationId, item.messageId);
    if (!persist) {
        memory.set(key, item);
        emit();
        return;
    }
    memory.delete(key);
    disk = disk.filter(row => starKey(row.conversationId, row.messageId) !== key);
    disk.push(item);
    dirty = true;
    if (loaded) void write();
    emit();
}

export function dropStar(conversationId: string, messageId: string) {
    const key = starKey(conversationId, messageId);
    const hadMemory = memory.delete(key);
    const next = disk.filter(row => starKey(row.conversationId, row.messageId) !== key);
    const hadDisk = next.length !== disk.length;
    disk = next;
    if (hadDisk) {
        dirty = true;
        if (loaded) void write();
    }
    if (hadMemory || hadDisk) emit();
}

export function startStore(listener: () => void) {
    if (alive) return;
    alive = true;
    gen++;
    onChange = listener;
    loaded = false;
    dirty = false;
    try {
        bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = ev => {
            const data = ev.data as { tab?: string; account?: string } | null;
            if (!data || data.tab === tabId) return;
            if (data.account && data.account !== account) return;
            if (dirty) return;
            void readIntoMemory();
        };
    } catch (e) {
        logger.debug("BroadcastChannel unavailable:", e);
    }
    void readIntoMemory();
}

export function stopStore() {
    alive = false;
    gen++;
    onChange = null;
    bc?.close();
    bc = null;
    disk = [];
    memory = new Map();
    doc = emptyDoc();
    loaded = false;
    dirty = false;
}

export function reloadIfAccountChanged() {
    const next = accountId();
    if (!loaded || next === account) return;
    if (dirty) void write();
    account = next;
    dirty = false;
    void readIntoMemory();
}
