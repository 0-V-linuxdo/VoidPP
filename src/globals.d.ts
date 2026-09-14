/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

declare const IS_DEV: boolean;
declare const IS_EXTENSION: boolean;
declare const VERSION: string;
declare const REPO_URL: string;
declare const GIT_HASH: string;

declare const unsafeWindow: typeof globalThis;

declare function GM_getValue<T = unknown>(key: string, defaultValue?: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare function GM_setClipboard(text: string): void;
declare function GM_addValueChangeListener(name: string, callback: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void): number;
declare function GM_removeValueChangeListener(listenerId: number): void;

interface GMXmlhttpRequestOptions {
    method: string;
    url: string;
    responseType?: string;
    timeout?: number;
    onload?(response: GMXmlhttpResponse): void;
    ontimeout?(): void;
    onerror?(): void;
    onabort?(): void;
}

interface GMXmlhttpResponse {
    response: Blob;
    status: number;
    statusText: string;
}

declare function GM_xmlhttpRequest(options: GMXmlhttpRequestOptions): void;

declare namespace globalThis {
    var TURBOPACK: import("./turbopack/types").TurbopackPushable | unknown[] | undefined;
}

declare module "*.css" {}

declare module "~plugins" {
    const plugins: Record<string, import("./utils/types").Plugin>;
    export default plugins;
}
