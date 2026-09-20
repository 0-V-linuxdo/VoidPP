/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ICON_STYLES = ["original", "badge", "dot", "hole", "bg"] as const;
export type IconStyle = (typeof ICON_STYLES)[number];
export type FaviconKind = "wait" | "rotate" | "done" | "ready" | "error";

export const DEFAULT_STYLE: IconStyle = "hole";

export const STYLE_OPTIONS = [
    { label: "only emoji", value: "original" },
    { label: "Badge + glyph", value: "badge" },
    { label: "Color dot", value: "dot" },
    { label: "Mark tint", value: "hole", default: true },
    { label: "Background tint", value: "bg" },
] as const;

const KIND_COLOR: Record<Exclude<FaviconKind, "wait">, string> = {
    rotate: "#3B82F6",
    done: "#22C55E",
    ready: "#F59E0B",
    error: "#EF4444",
};

const HOLE_IDLE = "#050505";
const MARK_FILL = "#FCFCFC";

const GROK_MARK_PATH = "M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815";
const GROK_BG_PATH = "M0 256C0 166.392 0 121.587 17.439 87.3615C32.7787 57.2556 57.2556 32.7787 87.3615 17.439C121.587 0 166.392 0 256 0C345.608 0 390.413 0 424.638 17.439C454.744 32.7787 479.221 57.2556 494.561 87.3615C512 121.587 512 166.392 512 256C512 345.608 512 390.413 494.561 424.638C479.221 454.744 454.744 479.221 424.638 494.561C390.413 512 345.608 512 256 512C166.392 512 121.587 512 87.3615 494.561C57.2556 479.221 32.7787 454.744 17.439 424.638C0 390.413 0 345.608 0 256Z";
const GROK_MARK_P1 = "M210.484 312.759L343.465 210.383C349.984 205.364 359.302 207.322 362.408 215.117C378.758 256.231 371.454 305.64 338.925 339.563C306.397 373.487 261.137 380.927 219.768 363.983L174.577 385.803C239.394 432.008 318.104 420.581 367.289 369.251C406.303 328.564 418.386 273.104 407.088 223.091L407.19 223.198C390.807 149.726 411.218 120.359 453.03 60.3072C454.02 58.8833 455.01 57.4595 456 56L400.978 113.382V113.204L210.45 312.794";
const GROK_MARK_P2 = "M183.042 337.641C136.519 291.294 144.54 219.567 184.236 178.203C213.59 147.59 261.683 135.096 303.666 153.464L348.755 131.75C340.632 125.627 330.221 119.042 318.275 114.414C264.277 91.2407 199.63 102.774 155.735 148.516C113.513 192.549 100.236 260.254 123.036 318.027C140.069 361.206 112.148 391.748 84.0229 422.575C74.0561 433.503 64.0553 444.431 56 456L183.007 337.677";

const ORIGINAL_EMOJI: Record<Exclude<FaviconKind, "wait">, string> = {
    rotate: "🔄",
    done: "✔️",
    ready: "👍",
    error: "🚫",
};

export function isIconStyle(value: unknown): value is IconStyle {
    return typeof value === "string" && (ICON_STYLES as readonly string[]).includes(value);
}

function svgEmoji(emoji: string): string {
    return `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`,
    )}`;
}

function toSvgData(inner: string, viewBox = "0 0 64 64"): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="64" height="64">${inner}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function grokMarkSvg(): string {
    return [
        `<rect width="64" height="64" rx="14" fill="${HOLE_IDLE}"/>`,
        `<g transform="translate(8 8) scale(2)" fill="${MARK_FILL}" fill-rule="evenodd">`,
        `<path d="${GROK_MARK_PATH}"/>`,
        "</g>",
    ].join("");
}

function officialGrokSvg(markColor: string, bgColor: string): string {
    return [
        `<path d="${GROK_BG_PATH}" fill="${bgColor}"/>`,
        `<path d="${GROK_MARK_P1}" fill="${markColor}"/>`,
        `<path d="${GROK_MARK_P2}" fill="${markColor}"/>`,
    ].join("");
}

function badgeGlyph(kind: Exclude<FaviconKind, "wait">): string {
    if (kind === "rotate") {
        return [
            '<g transform="translate(51.5 51.5)"><g>',
            '<path d="M0-6.1 A6.1 6.1 0 1 1 -5.3 3.05" fill="none" stroke="#fff" stroke-width="2.15" stroke-linecap="round"/>',
            '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.85s" repeatCount="indefinite"/>',
            "</g></g>",
        ].join("");
    }
    if (kind === "done") {
        return '<path d="M46.6 51.7 L50.1 55.3 L56.8 47.4" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    if (kind === "ready") {
        return [
            '<path d="M51.5 56.4 V46.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
            '<path d="M46.6 51.2 L51.5 46.2 L56.4 51.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
        ].join("");
    }
    return [
        '<path d="M47.2 47.2 L55.8 55.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
        '<path d="M55.8 47.2 L47.2 55.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
    ].join("");
}

export function composeIcon(style: IconStyle, kind: FaviconKind, officialHref: string): string {
    if (style === "original") {
        if (kind === "wait") return officialHref;
        return svgEmoji(ORIGINAL_EMOJI[kind]);
    }

    const color = kind === "wait" ? undefined : KIND_COLOR[kind];

    if (style === "hole") {
        return toSvgData(officialGrokSvg(color ?? MARK_FILL, HOLE_IDLE), "0 0 512 512");
    }
    if (style === "bg") {
        return toSvgData(officialGrokSvg(MARK_FILL, color ?? HOLE_IDLE), "0 0 512 512");
    }

    if (!color || kind === "wait") return toSvgData(grokMarkSvg());

    const badge = style === "dot"
        ? [
            '<circle cx="52.2" cy="52.2" r="10.4" fill="#050505"/>',
            `<circle cx="52.2" cy="52.2" r="7.7" fill="${color}"/>`,
        ].join("")
        : [
            '<circle cx="51.5" cy="51.5" r="12.15" fill="#050505"/>',
            `<circle cx="51.5" cy="51.5" r="9.55" fill="${color}"/>`,
            badgeGlyph(kind),
        ].join("");
    return toSvgData(grokMarkSvg() + badge);
}

export function buildIcons(style: IconStyle, officialHref: string): Record<FaviconKind, string> {
    return {
        wait: composeIcon(style, "wait", officialHref),
        rotate: composeIcon(style, "rotate", officialHref),
        done: composeIcon(style, "done", officialHref),
        ready: composeIcon(style, "ready", officialHref),
        error: composeIcon(style, "error", officialHref),
    };
}
