/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RoutingStore } from "@turbopack/common/stores";

export const QUERY = ".query-bar";
export const DISMISS = /close|remove|dismiss|clear|delete|取消|关闭|删除/i;
export const KEEP = /submit|send|attach|dictat|mode|file|stop|abort|cancel|暂停|停止/i;

export function onImaginePage(): boolean {
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
