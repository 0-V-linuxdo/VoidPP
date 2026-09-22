/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { VoidPPEventMap } from "@api/Events";
import { definePluginSettings } from "@api/Settings";
import { Button, Flex, Paragraph } from "@components";
import { BellIcon } from "@components/icons";
import type { MediaItem, MediaStoreState } from "@grok-types/stores/MediaStore";
import { createElement } from "@turbopack/common/react";
import { MediaStore, ResponseStore, RoutingStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { fetchExternal, sendBrowserNotification } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

import { DEFAULT_CHIME } from "./done1";

const logger = new Logger("ResponseNotification");

const LIVE_STATES = new Set(["streaming", "optimistic", "reconnecting"]);
const RETRY_MS = 80;
const SAMPLE_VOLUME = 0.5;

function PreviewSound() {
    return createElement(
        Flex,
        { flexDirection: "column", gap: "0.5rem" },
        createElement(Paragraph, null, "Preview the notification sound."),
        createElement(
            Button,
            {
                size: "sm",
                variant: "secondary",
                onClick() {
                    onUserGesture();
                    playSound();
                },
            },
            "Play preview",
        ),
    );
}

const settings = definePluginSettings({
    sound: {
        type: OptionType.BOOLEAN,
        description: "Play a notification sound.",
        default: true,
    },
    soundUrl: {
        type: OptionType.STRING,
        description: "Custom sound URL. Leave empty for the default done chime.",
        default: "",
        placeholder: "https://example.com/sound.mp3",
    },
    preview: {
        type: OptionType.COMPONENT,
        description: "Preview sound.",
        component: PreviewSound,
    },
    browserNotification: {
        type: OptionType.BOOLEAN,
        description: "Show a browser notification.",
        default: true,
    },
    onlyWhenHidden: {
        type: OptionType.BOOLEAN,
        description: "Only notify when the tab is hidden.",
        default: true,
    },
    imagineGeneration: {
        type: OptionType.BOOLEAN,
        description: "Notify when an Imagine generation finishes. Off by default.",
        default: false,
    },
});

let userGestured = false;
let gestureCtrl: AbortController | null = null;
let audioCtx: AudioContext | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const buffers = new Map<string, AudioBuffer>();
const notified = new Set<string>();

function getCtx(): AudioContext | null {
    if (audioCtx && audioCtx.state !== "closed") return audioCtx;
    try {
        audioCtx = new AudioContext();
        return audioCtx;
    } catch (e) {
        logger.debug("AudioContext unavailable:", e);
        audioCtx = null;
        return null;
    }
}

function onUserGesture() {
    userGestured = true;
    if (settings.store.browserNotification && Notification.permission === "default") void Notification.requestPermission();
    const ctx = getCtx();
    if (!ctx) return;
    const warm = () => { void loadBuffer(ctx, DEFAULT_CHIME); };
    if (ctx.state === "suspended") void ctx.resume().then(warm);
    else warm();
}

function dataUriToBuffer(uri: string): ArrayBuffer {
    const bin = atob(uri.slice(uri.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    const cached = buffers.get(url);
    if (cached) return cached;
    const raw = url.startsWith("data:")
        ? dataUriToBuffer(url)
        : await (await fetchExternal(url)).arrayBuffer();
    const buf = await ctx.decodeAudioData(raw.slice(0));
    buffers.set(url, buf);
    return buf;
}

function playBuffer(ctx: AudioContext, buf: AudioBuffer) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = SAMPLE_VOLUME;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
}

function playUrl(ctx: AudioContext, url: string) {
    void loadBuffer(ctx, url).then(
        buf => playBuffer(ctx, buf),
        err => {
            logger.info("sample play failed:", err);
            if (url !== DEFAULT_CHIME) void loadBuffer(ctx, DEFAULT_CHIME).then(buf => playBuffer(ctx, buf), e => logger.info("default chime failed:", e));
        },
    );
}

function playSound() {
    if (!userGestured) {
        logger.info("sound skipped, no user gesture yet");
        return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    const url = settings.store.soundUrl?.trim() || DEFAULT_CHIME;
    if (ctx.state === "suspended") void ctx.resume().then(() => playUrl(ctx, url), () => logger.info("AudioContext resume failed"));
    else playUrl(ctx, url);
}

function isErrorResponse(response: { state?: string; error?: unknown } | undefined) {
    return response?.state === "error" || response?.error != null;
}

function isLiveResponse(response: { state?: string } | undefined) {
    return !!response?.state && LIVE_STATES.has(response.state);
}

function shouldNotify(response: { state?: string; error?: unknown } | undefined) {
    return !isErrorResponse(response) && !isLiveResponse(response);
}

function notify(responseId: string, state: string | undefined) {
    logger.info("notify", responseId, state ?? "unset", "permission", Notification.permission);
    if (settings.store.onlyWhenHidden && document.visibilityState === "visible") return;
    if (settings.store.sound) playSound();
    if (settings.store.browserNotification) {
        sendBrowserNotification("Grok", state === "imagine" ? "Imagine generation complete." : "Response complete.");
    }
}

function notifyOnce(responseId: string, state: string | undefined) {
    if (notified.has(responseId)) return;
    notified.add(responseId);
    if (notified.size > 80) notified.clear();
    notify(responseId, state);
}

function onResponses(current: { byId?: Record<string, { state?: string; error?: unknown }> } | undefined, prev: { byId?: Record<string, { state?: string; error?: unknown }> } | undefined) {
    const cur = current?.byId;
    const old = prev?.byId;
    if (!cur || !old) return;
    for (const id of Object.keys(cur)) {
        if (isLiveResponse(old[id]) && shouldNotify(cur[id])) notifyOnce(id, cur[id]?.state);
    }
}

function onStreamEnd({ responseId }: VoidPPEventMap["streamEnd"]) {
    logger.info("streamEnd", responseId);
    if (retryTimer) clearTimeout(retryTimer);
    const attempt = (retried: boolean) => {
        let response: { state?: string; error?: unknown } | undefined;
        try {
            response = ResponseStore.useResponseStore.getState().byId[responseId];
        } catch (e) {
            logger.info("ResponseStore unavailable:", e);
        }
        if (shouldNotify(response)) {
            notifyOnce(responseId, response?.state ?? "gateway");
            return;
        }
        if (isErrorResponse(response)) {
            logger.info("skip error", responseId);
            return;
        }
        if (!retried) {
            retryTimer = setTimeout(() => attempt(true), RETRY_MS);
            return;
        }
        logger.info("skip", responseId, response?.state ?? "unset");
    };
    attempt(false);
}

function onImaginePage(): boolean {
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

function isLiveMedia(p: MediaItem | undefined): boolean {
    if (!p) return false;
    if (p.complete) return false;
    if (p.moderated || p.isModerated) return false;
    if (p.progress != null && p.progress < 100) return true;
    if (p.inflightId) return true;
    if (p.blobSrc && !p.mediaUrl) return true;
    if (p.upscalingInProgress) return true;
    return false;
}

function mediaLiveKey(s: MediaStoreState): string {
    try {
        const ids = new Set<string>();
        for (const p of Object.values(s.byId ?? {})) {
            if (isLiveMedia(p)) ids.add(p.id);
        }
        for (const [id, pending] of Object.entries(s.optimisticVideoGenPending ?? {})) {
            if (pending) ids.add(id);
        }
        return [...ids].toSorted().join(",");
    } catch {
        return "";
    }
}

function syncImagine(current: string, prev: string) {
    if (!settings.store.imagineGeneration || !prev) return;
    if (onImaginePage()) return;
    const now = new Set(current ? current.split(",") : []);
    for (const id of prev.split(",")) {
        if (!id || now.has(id)) continue;
        let item: MediaItem | undefined;
        try {
            item = MediaStore.useMediaStore.getState().byId[id];
        } catch {
            continue;
        }
        if (!item) continue;
        if (item.complete === false && !item.mediaUrl) continue;
        if (item.moderated || item.isModerated) continue;
        notifyOnce(`imagine:${id}`, "imagine");
    }
}

export default definePlugin({
    name: "ResponseNotification",
    icon: BellIcon,
    description: "Notify when Grok finishes responding. Optional Imagine generation notify is off by default.",
    authors: [Devs.Prism, Devs.p],
    tags: ["chat"],
    settings,
    startAt: StartAt.TurbopackReady,

    start() {
        if (gestureCtrl) return;
        gestureCtrl = new AbortController();
        const { signal } = gestureCtrl;
        for (const evt of ["pointerdown", "keydown", "touchstart"] as const) {
            addEventListener(evt, onUserGesture, { capture: true, passive: true, signal });
        }
    },

    stop() {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = undefined;
        gestureCtrl?.abort();
        gestureCtrl = null;
        buffers.clear();
        notified.clear();
        if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
        audioCtx = null;
    },

    events: {
        streamEnd: onStreamEnd,
    },

    zustand: {
        ResponseStore: {
            handler: onResponses,
        },
        MediaStore: {
            selector: mediaLiveKey,
            handler: syncImagine,
        },
    },
});
