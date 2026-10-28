/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GrokResponse } from "@grok-types";

import { findByPropsLazy } from "../turbopack";

export const ApiClients: {
    chatApi: {
        chatListResponses(a: { conversationId: string }): Promise<{ responses: GrokResponse[] }>;
        chatShareConversation(a: { conversationId: string; body: { responseId: string; allowIndexing: boolean } }): Promise<{ shareLinkId: string }>;
        chatCloneConversation(a: { shareLinkId: string; body: object }): Promise<{ conversation?: { conversationId: string } }>;
        chatDeleteShareLink(a: { shareLinkId: string }): Promise<unknown>;
    };
} = findByPropsLazy("chatApi", "modelsApi");

export const Toaster: {
    Toaster: import("react").ComponentType;
    toast: import("@grok-types").ToastFn;
} = findByPropsLazy("Toaster", "toast");

function cn(...inputs: unknown[]): string {
    const out: string[] = [];
    const walk = (value: unknown) => {
        if (!value) return;
        if (typeof value === "string" || typeof value === "number") {
            out.push(String(value));
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) walk(item);
            return;
        }
        if (typeof value === "object") {
            for (const [key, on] of Object.entries(value)) if (on) out.push(key);
        }
    };
    for (const input of inputs) walk(input);
    return out.join(" ");
}

function middleTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    if (maxLength <= 1) return text.slice(0, maxLength);
    const mark = "…";
    const head = Math.ceil((maxLength - mark.length) / 2);
    const tail = Math.floor((maxLength - mark.length) / 2);
    return `${text.slice(0, head)}${mark}${text.slice(text.length - tail)}`;
}

// `cn` + `middleTruncate` left the module cache. Text joins plain class strings,
// so a local joiner is enough and does not go blank when the export is renamed.
export const ClassNames: {
    cn: (...inputs: unknown[]) => string;
    middleTruncate: (text: string, maxLength: number) => string;
} = { cn, middleTruncate };

export const FileUtils: {
    downloadBlob: (blob: Blob, filename: string) => Promise<void>;
} = findByPropsLazy("downloadBlob");
