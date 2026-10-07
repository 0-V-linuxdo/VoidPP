/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { CableIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import { isObject } from "@utils/guards";
import { Logger } from "@utils/Logger";
import { errorMessage } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

import { toolHandlers } from "./tools";
import { MCP as MCP_CONSTANTS } from "./tools/constants";
import { clearAllIntercepts } from "./tools/intercept";
import { clearWhereUsedCache } from "./tools/module";
import { clearNetwork } from "./tools/network";
import { clearStoreCache } from "./tools/store";
import type { PageRequest, PageResponse } from "./tools/types";
import { clearFactoryCaches, isThenable } from "./tools/utils";

const logger = new Logger("MCP", MCP_CONSTANTS.LOG_COLOR);

function bridgePort(): number {
    try { return Number(localStorage.getItem("voidpp_mcp_port")) || MCP_CONSTANTS.PORT; } catch { return MCP_CONSTANTS.PORT; }
}
const MCP_URL = `ws://127.0.0.1:${bridgePort()}`;
const { SLOW_THRESHOLD, MAX_RESULT_SIZE, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY } = MCP_CONSTANTS;

const WORKER_SRC = `let ws;
onmessage = e => {
    const [op, data] = e.data;
    if (op === 0) {
        try {
            ws = new WebSocket(data);
            ws.onopen = () => postMessage([0]);
            ws.onmessage = ev => postMessage([1, ev.data]);
            ws.onclose = () => postMessage([2]);
            ws.onerror = () => postMessage([3]);
        } catch { postMessage([3]); }
    } else if (op === 1) {
        try { ws.send(data); } catch {}
    }
};`;

class WorkerSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState: number = WebSocket.CONNECTING;
    private worker: Worker;

    constructor(url: string) {
        const blobUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
        try {
            this.worker = new Worker(blobUrl);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
        this.worker.onmessage = e => {
            const [op, data] = e.data as [number, string?];
            if (op === 0) {
                this.readyState = WebSocket.OPEN;
                this.onopen?.();
            } else if (op === 1) {
                this.onmessage?.({ data: data! });
            } else if (op === 2) {
                this.readyState = WebSocket.CLOSED;
                this.worker.terminate();
                this.onclose?.();
            } else if (op === 3) {
                this.onerror?.();
            }
        };
        this.worker.onerror = () => this.onerror?.();
        this.worker.postMessage([0, url]);
    }

    send(data: string) {
        this.worker.postMessage([1, data]);
    }

    close() {
        this.readyState = WebSocket.CLOSED;
        this.worker.terminate();
        this.onclose?.();
    }
}

const settings = definePluginSettings({
    logToolCalls: {
        type: OptionType.BOOLEAN,
        description: "Log tool call names and timing to the browser console.",
        default: true,
    },
});

let ws: WorkerSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay: number = INITIAL_RECONNECT_DELAY;
let connectingLock = false;
function truncateResult(result: unknown): unknown {
    if (Array.isArray(result)) {
        const showing = Math.min(result.length, Math.max(MCP_CONSTANTS.MIN_TRUNCATED_ITEMS, Math.floor(result.length / 2)));
        return [...result.slice(0, showing), { _truncated: true, total: result.length, showing, hint: "Use narrower query, limit, or pagination to see more" }];
    }
    if (isObject(result)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(result)) {
            if (Array.isArray(v) && v.length > 0) {
                try {
                    const sampleSize = JSON.stringify(v[0]).length;
                    if (sampleSize * v.length > MCP_CONSTANTS.TRUNCATION_THRESHOLD) {
                        const showing = Math.min(v.length, Math.max(MCP_CONSTANTS.MIN_TRUNCATED_NESTED, Math.floor(v.length / 2)));
                        out[k] = [...v.slice(0, showing), { _truncated: true, total: v.length, showing }];
                        continue;
                    }
                } catch {
                    out[k] = `[Unserializable array (${v.length} items)]`;
                    continue;
                }
            }
            out[k] = v;
        }
        out._warning = "Result auto-truncated. Use narrower queries, filters, or pagination.";
        return out;
    }
    return result;
}
function safeSend(json: string) {
    if (ws?.readyState !== WebSocket.OPEN) {
        logger.warn("Dropped tool result: bridge socket not open");
        return;
    }
    try {
        ws.send(json);
    } catch (err: unknown) {
        logger.error("Failed to send tool result", err);
    }
}
function send(data: PageResponse) {
    try {
        let json = JSON.stringify(data);
        if (json.length > MAX_RESULT_SIZE && data.result != null) {
            const truncated: PageResponse = { id: data.id, result: truncateResult(data.result) };
            json = JSON.stringify(truncated);
            if (json.length > MAX_RESULT_SIZE) {
                safeSend(JSON.stringify({ id: data.id, error: `Result too large (${json.length} chars) even after auto-truncation. Use narrower queries or pagination.` }));
                return;
            }
        }
        safeSend(json);
    } catch (err: unknown) {
        safeSend(JSON.stringify({ id: data.id, error: `Serialization failed: ${errorMessage(err)}` }));
    }
}
function connect() {
    if (connectingLock || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
    connectingLock = true;
    try {
        ws = new WorkerSocket(MCP_URL);
    } catch {
        connectingLock = false;
        scheduleReconnect();
        return;
    }
    const watchdog = setTimeout(() => {
        if (ws?.readyState === WebSocket.CONNECTING) {
            logger.warn("Connect timed out, retrying");
            ws.close();
        }
    }, MCP_CONSTANTS.CONNECT_TIMEOUT);
    ws.onopen = () => {
        clearTimeout(watchdog);
        connectingLock = false;
        reconnectDelay = INITIAL_RECONNECT_DELAY;
        const toolCount = Object.keys(toolHandlers).length;
        logger.info(`Connected to MCP session with ${toolCount} tools ready`);
    };
    ws.onmessage = (event: { data: string }) => {
        let msg: PageRequest;
        try {
            msg = JSON.parse(event.data);
        } catch (err: unknown) {
            logger.error("Failed to parse WebSocket message", err);
            return;
        }
        const { id, tool, arguments: args } = msg;
        if (id == null || !tool) return;
        const handler = toolHandlers[tool as keyof typeof toolHandlers];
        if (!handler) {
            logger.error(`Unknown tool: ${tool}`);
            send({ id, error: `Unknown tool: ${tool}` });
            return;
        }
        const start = performance.now();
        const logCall = (failed = false) => {
            if (!settings.store.logToolCalls && !failed) return;
            const elapsed = performance.now() - start;
            const ms = elapsed.toFixed(2);
            if (failed) logger.error(`${tool} ${ms} ms (failed)`);
            else if (elapsed > SLOW_THRESHOLD) logger.warn(`${tool} ${ms} ms (slow)`);
            else logger.info(`${tool} ${ms} ms`);
        };
        try {
            const result = handler(args ?? {});
            if (isThenable(result)) {
                result.then(
                    val => { logCall(); send({ id, result: val }); },
                    (err: unknown) => { logCall(true); send({ id, error: errorMessage(err) }); },
                );
            } else {
                logCall();
                send({ id, result });
            }
        } catch (err: unknown) {
            logCall(true);
            send({ id, error: errorMessage(err) });
        }
    };
    ws.onclose = () => {
        clearTimeout(watchdog);
        ws = null;
        connectingLock = false;
        scheduleReconnect();
    };
    ws.onerror = () => {
        connectingLock = false;
        ws?.close();
    };
}
function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}
function disconnect() {
    connectingLock = false;
    reconnectDelay = INITIAL_RECONNECT_DELAY;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
    }
}
export default definePlugin({
    name: "MCP",
    icon: CableIcon,
    description: "Connects AI coding agents to Grok via a local bridge for live inspection.",
    authors: [Devs.Prism],
    tags: ["developer"],
    dev: true,
    required: true,
    settings,
    start() {
        connect();
    },
    stop() {
        disconnect();
        clearAllIntercepts();
        clearNetwork();
        clearFactoryCaches();
        clearWhereUsedCache();
        clearStoreCache();
    },
});
