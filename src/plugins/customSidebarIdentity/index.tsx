/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Button, Flex, Input, SettingsDescription, SettingsTitle, Text } from "@components";
import { UserRoundPenIcon } from "@components/icons";
import { React, useEffect, useRef, useState } from "@turbopack/common/react";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { clamp } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

const FOOTER = '[data-sidebar="footer"]';
const MENU = '[role="menu"]';
const PFP = 'img[alt="pfp"]';
const NAME_CLASS = "void-csi-name";
const HIDE_CLASS = "void-csi-hide";
const MARK = "data-void-csi";
const ORIG = "data-void-csi-orig";
const SOURCE_PX = 1024;
const AVATAR_PX = 256;
const SIZE_MIN = 24;
const SIZE_MAX = 64;
const SIZE_DEFAULT = 40;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const SIZE_VAR = "--void-csi-avatar-size";
const cl = classNameFactory("void-csi-");

interface PrivateSettings {
    avatarSource: string;
    cropX: number;
    cropY: number;
    cropZoom: number;
}

const settings = definePluginSettings({
    displayName: {
        type: OptionType.STRING,
        description: "Display name next to the sidebar avatar. Empty keeps the official name.",
        default: "",
        placeholder: "Shown next to the sidebar avatar",
    },
    avatarUrl: {
        type: OptionType.COMPONENT,
        description: "Image URL, data:image…, or paste a picture. Drag the circle to crop.",
        default: "",
        placeholder: "Paste a picture, or https://…",
        component: AvatarUrlField,
    },
    avatarSize: {
        type: OptionType.SLIDER,
        description: "Sidebar avatar diameter in pixels when the sidebar is expanded. Official size is 32. Collapsed rail stays 32.",
        min: SIZE_MIN,
        max: SIZE_MAX,
        default: SIZE_DEFAULT,
    },
    applyToMenu: {
        type: OptionType.BOOLEAN,
        description: "Also replace the avatar and name at the top of the account dropdown.",
        default: true,
    },
}).withPrivateSettings<PrivateSettings>();

function num(v: unknown, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function cropRect(w: number, h: number, zoom: number, cx: number, cy: number) {
    const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    const side = Math.min(w, h) / z;
    const x = clamp(cx, side / 2, Math.max(side / 2, w - side / 2));
    const y = clamp(cy, side / 2, Math.max(side / 2, h - side / 2));
    return { z, side, x, y };
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap | null> {
    try {
        return await createImageBitmap(blob);
    } catch {
        return null;
    }
}

async function bitmapFromUrl(url: string): Promise<ImageBitmap | null> {
    try {
        const res = await fetch(url, url.startsWith("data:") ? undefined : { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) return null;
        return bitmapFromBlob(await res.blob());
    } catch {
        return null;
    }
}

function pngFromBitmap(bmp: ImageBitmap, w: number, h: number): string | null {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const url = canvas.toDataURL("image/png");
    return url.startsWith("data:image/") ? url : null;
}

function capFromBitmap(bmp: ImageBitmap): string | null {
    const scale = Math.min(1, SOURCE_PX / Math.max(bmp.width, bmp.height));
    return pngFromBitmap(bmp, Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
}

function bakeFromBitmap(bmp: ImageBitmap, cropX: number, cropY: number, zoom: number): string | null {
    const { side, x, y } = cropRect(bmp.width, bmp.height, zoom, cropX * bmp.width, cropY * bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, x - side / 2, y - side / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    const url = canvas.toDataURL("image/png");
    return url.startsWith("data:image/") ? url : null;
}

async function capBlob(blob: Blob): Promise<string | null> {
    const bmp = await bitmapFromBlob(blob);
    if (!bmp) return null;
    const url = capFromBitmap(bmp);
    bmp.close();
    return url;
}

async function bake(src: string, cropX: number, cropY: number, zoom: number): Promise<string | null> {
    const bmp = await bitmapFromUrl(src);
    if (!bmp) return null;
    const url = bakeFromBitmap(bmp, cropX, cropY, zoom);
    bmp.close();
    return url;
}

function resetCrop() {
    settings.store.cropX = 0.5;
    settings.store.cropY = 0.5;
    settings.store.cropZoom = 1;
}

function clearAvatar() {
    settings.store.avatarUrl = "";
    settings.store.avatarSource = "";
    resetCrop();
}

let adoptGen = 0;

async function adoptSource(src: string) {
    const gen = ++adoptGen;
    resetCrop();
    settings.store.avatarSource = src;
    const baked = await bake(src, 0.5, 0.5, 1);
    if (gen !== adoptGen) return false;
    if (baked) settings.store.avatarUrl = baked;
    return !!baked;
}

function imageFile(data: DataTransfer | null): File | null {
    if (!data) return null;
    for (const file of data.files) {
        if (file.type.startsWith("image/")) return file;
    }
    for (const item of data.items) {
        if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
    }
    return null;
}

async function takeImage(data: DataTransfer | null) {
    const file = imageFile(data);
    if (!file) return false;
    const src = await capBlob(file);
    if (!src) return false;
    return adoptSource(src);
}

function CropStage({ src }: { src: string }) {
    const { cropX, cropY, cropZoom } = settings.use(["cropX", "cropY", "cropZoom"]);
    const [nat, setNat] = useState<{ w: number; h: number; } | null>(null);
    const [x, setX] = useState(() => num(cropX, 0.5));
    const [y, setY] = useState(() => num(cropY, 0.5));
    const [zoom, setZoom] = useState(() => num(cropZoom, 1));
    const pos = useRef({ x, y, zoom });
    const drag = useRef<{ px: number; py: number; x: number; y: number; } | null>(null);
    const stage = useRef<HTMLDivElement>(null);
    const bakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    pos.current = { x, y, zoom };

    useEffect(() => {
        let dead = false;
        const img = new Image();
        setNat(null);
        img.onload = () => {
            if (!dead) setNat({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.src = src;
        setX(num(settings.store.cropX, 0.5));
        setY(num(settings.store.cropY, 0.5));
        setZoom(num(settings.store.cropZoom, 1));
        if (!settings.store.avatarSource) settings.store.avatarSource = src;
        return () => { dead = true; };
    }, [src]);

    useEffect(() => {
        const el = stage.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const next = clamp(pos.current.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), ZOOM_MIN, ZOOM_MAX);
            commit(pos.current.x, pos.current.y, next);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [nat]);

    useEffect(() => () => {
        if (bakeTimer.current) clearTimeout(bakeTimer.current);
    }, []);

    function applyPos(nx: number, ny: number, nz: number) {
        if (!nat) {
            setX(nx);
            setY(ny);
            setZoom(clamp(nz, ZOOM_MIN, ZOOM_MAX));
            return { x: nx, y: ny, z: clamp(nz, ZOOM_MIN, ZOOM_MAX) };
        }
        const r = cropRect(nat.w, nat.h, nz, nx * nat.w, ny * nat.h);
        const cx = r.x / nat.w;
        const cy = r.y / nat.h;
        setX(cx);
        setY(cy);
        setZoom(r.z);
        pos.current = { x: cx, y: cy, zoom: r.z };
        return { x: cx, y: cy, z: r.z };
    }

    function commit(nx: number, ny: number, nz: number, immediate = false) {
        const next = applyPos(nx, ny, nz);
        const run = () => {
            settings.store.cropX = next.x;
            settings.store.cropY = next.y;
            settings.store.cropZoom = next.z;
            void bake(src, next.x, next.y, next.z).then(url => {
                if (url) settings.store.avatarUrl = url;
            });
        };
        if (bakeTimer.current) clearTimeout(bakeTimer.current);
        if (immediate) run();
        else bakeTimer.current = setTimeout(run, 80);
    }

    const r = nat ? cropRect(nat.w, nat.h, zoom, x * nat.w, y * nat.h) : null;
    const imgStyle = r && nat ? {
        width: `${(nat.w / r.side) * 100}%`,
        height: `${(nat.h / r.side) * 100}%`,
        left: `${(0.5 - r.x / r.side) * 100}%`,
        top: `${(0.5 - r.y / r.side) * 100}%`,
    } : undefined;

    return (
        <Flex flexDirection="column" gap="0.5rem" className={cl("crop")}>
            <div
                ref={stage}
                className={cl("stage")}
                onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = { px: e.clientX, py: e.clientY, x: pos.current.x, y: pos.current.y };
                }}
                onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => {
                    if (!drag.current || !nat) return;
                    const S = e.currentTarget.clientWidth;
                    if (!S) return;
                    const { side } = cropRect(nat.w, nat.h, pos.current.zoom, drag.current.x * nat.w, drag.current.y * nat.h);
                    applyPos(
                        drag.current.x - ((e.clientX - drag.current.px) * (side / S)) / nat.w,
                        drag.current.y - ((e.clientY - drag.current.py) * (side / S)) / nat.h,
                        pos.current.zoom,
                    );
                }}
                onPointerUp={() => {
                    if (!drag.current) return;
                    drag.current = null;
                    commit(pos.current.x, pos.current.y, pos.current.zoom, true);
                }}
                onPointerCancel={() => { drag.current = null; }}
            >
                {src && <img className={cl("stage-img")} src={src} alt="" draggable={false} style={imgStyle} />}
            </div>
            <Flex alignItems="center" gap="0.5rem" className={cl("zoom-row")}>
                <input
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={0.05}
                    value={zoom}
                    className={cl("zoom")}
                    aria-label="Zoom"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => commit(pos.current.x, pos.current.y, Number(e.target.value))}
                />
                <Text size="sm" color="secondary" className={cl("zoom-val")}>{Math.round(zoom * 100)}%</Text>
                <Button size="sm" variant="secondary" onClick={() => commit(0.5, 0.5, 1, true)}>Reset</Button>
            </Flex>
            <Text size="xs" color="muted">Drag to pan · scroll to zoom. Circle matches the sidebar crop.</Text>
        </Flex>
    );
}

function AvatarUrlField() {
    const { avatarUrl, avatarSource } = settings.use(["avatarUrl", "avatarSource"]);
    const raw = String(avatarUrl ?? "");
    const source = String(avatarSource ?? "");
    const cropSrc = source.startsWith("data:image/") ? source : (raw.startsWith("data:image/") ? raw : "");
    const pasted = !!cropSrc;
    const remote = /^https?:\/\//.test(raw.trim());
    const [remoteFail, setRemoteFail] = useState(false);
    const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (urlTimer.current) clearTimeout(urlTimer.current);
    }, []);

    function onUrlChange(value: string) {
        settings.store.avatarUrl = value;
        const trimmed = value.trim();
        if (urlTimer.current) clearTimeout(urlTimer.current);
        if (!trimmed) {
            settings.store.avatarSource = "";
            resetCrop();
            setRemoteFail(false);
            return;
        }
        if (trimmed.startsWith("data:image/")) {
            setRemoteFail(false);
            urlTimer.current = setTimeout(() => {
                void bitmapFromUrl(trimmed).then(bmp => {
                    if (!bmp) return;
                    const src = capFromBitmap(bmp);
                    bmp.close();
                    if (src) void adoptSource(src);
                });
            }, 80);
            return;
        }
        if (/^https?:\/\//.test(trimmed)) {
            setRemoteFail(false);
            settings.store.avatarSource = "";
            urlTimer.current = setTimeout(() => {
                void bitmapFromUrl(trimmed).then(bmp => {
                    if (!bmp) {
                        setRemoteFail(true);
                        return;
                    }
                    const src = capFromBitmap(bmp);
                    bmp.close();
                    if (src) {
                        setRemoteFail(false);
                        void adoptSource(src);
                    } else setRemoteFail(true);
                });
            }, 400);
            return;
        }
        setRemoteFail(false);
        settings.store.avatarSource = "";
    }

    return (
        <Flex flexDirection="column" gap="0.5rem">
            <Flex flexDirection="column" gap="0">
                <SettingsTitle>Avatar Url</SettingsTitle>
                <SettingsDescription>
                    Image URL, data:image…, or paste a picture. Drag the circle to pick the crop.
                </SettingsDescription>
            </Flex>
            <div
                className={cl("avatar")}
                onPaste={(e: React.ClipboardEvent<HTMLDivElement>) => { if (imageFile(e.clipboardData)) { e.preventDefault(); setRemoteFail(false); void takeImage(e.clipboardData); } }}
                onDragOver={(e: React.DragEvent<HTMLDivElement>) => { if (imageFile(e.dataTransfer)) e.preventDefault(); }}
                onDrop={(e: React.DragEvent<HTMLDivElement>) => { if (imageFile(e.dataTransfer)) { e.preventDefault(); setRemoteFail(false); void takeImage(e.dataTransfer); } }}
            >
                {raw && <img className={cl("preview")} src={cropSrc || raw} alt="" referrerPolicy="no-referrer" />}
                <Input
                    type="text"
                    className={cl("url")}
                    value={pasted ? "" : raw}
                    placeholder={pasted ? "Pasted image. Drag the circle to crop, or type a URL to replace." : "Paste a picture, or https://…"}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUrlChange(e.target.value)}
                    onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => { if (imageFile(e.clipboardData)) { e.preventDefault(); setRemoteFail(false); void takeImage(e.clipboardData); } }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (pasted && !e.currentTarget.value && (e.key === "Backspace" || e.key === "Delete")) {
                            clearAvatar();
                            setRemoteFail(false);
                        }
                    }}
                />
            </div>
            {cropSrc && <CropStage src={cropSrc} />}
            {remote && remoteFail && !cropSrc && (
                <Text size="xs" color="muted">Remote image cannot be cropped (CORS). Paste or drop it instead.</Text>
            )}
        </Flex>
    );
}

const failed = new Set<string>();
let treeObs: MutationObserver | null = null;
let raf = 0;
let painting = false;
let started = false;

function trimName(): string {
    return String(settings.store.displayName ?? "").trim();
}

function avatarSrc(): string | null {
    const raw = String(settings.store.avatarUrl ?? "").trim();
    if (!raw || failed.has(raw)) return null;
    if (raw.startsWith("data:image/")) return raw;
    try {
        const { protocol } = new URL(raw);
        if (protocol === "https:" || protocol === "http:") return raw;
    } catch {
        return null;
    }
    return null;
}

function footerBtn(footer: Element): HTMLElement | null {
    return footer.querySelector('button[data-slot="button"], button[data-state]');
}

function restoreImg(img: HTMLImageElement) {
    const orig = img.getAttribute(ORIG);
    img.removeEventListener("error", onImgError);
    img.removeAttribute(MARK);
    if (orig == null) return;
    img.src = orig;
    img.removeAttribute(ORIG);
}

function onImgError(e: Event) {
    const img = e.currentTarget;
    if (!(img instanceof HTMLImageElement)) return;
    const url = img.getAttribute("src") ?? "";
    if (url) failed.add(url);
    restoreImg(img);
}

function paintImg(img: HTMLImageElement, url: string | null) {
    if (!url) {
        restoreImg(img);
        return;
    }
    const current = img.getAttribute("src") ?? "";
    if (img.getAttribute(MARK) === "1") {
        if (current === url) return;
        if (current) img.setAttribute(ORIG, current);
    } else if (!img.hasAttribute(ORIG)) {
        img.setAttribute(ORIG, current);
    }
    img.setAttribute(MARK, "1");
    if (img.getAttribute("srcset")) img.removeAttribute("srcset");
    img.referrerPolicy = "no-referrer";
    img.removeEventListener("error", onImgError);
    img.addEventListener("error", onImgError);
    if (current !== url) img.src = url;
}

function pfps(scope: ParentNode, fallbackRoot?: Element | null): HTMLImageElement[] {
    const tagged = [...scope.querySelectorAll<HTMLImageElement>(PFP)];
    if (tagged.length) return tagged;
    const img = fallbackRoot?.querySelector("img");
    return img instanceof HTMLImageElement ? [img] : [];
}

function ensureName(host: Element, text: string): HTMLElement {
    let el = host.querySelector<HTMLElement>(`:scope > .${NAME_CLASS}`);
    if (!el) {
        el = document.createElement("span");
        el.className = NAME_CLASS;
        host.appendChild(el);
    }
    if (el.textContent !== text) el.textContent = text;
    return el;
}

function dropNames(scope: ParentNode) {
    for (const el of scope.querySelectorAll(`.${NAME_CLASS}`)) el.remove();
}

function unhide(scope: ParentNode) {
    for (const el of scope.querySelectorAll(`.${HIDE_CLASS}`)) el.classList.remove(HIDE_CLASS);
}

function hideOfficial(host: Element, keep: Element) {
    if (host.getAttribute("role") === "menu") return;
    for (const node of host.querySelectorAll("span, p")) {
        if (node === keep || keep.contains(node) || node.contains(keep) || node.classList.contains(NAME_CLASS)) continue;
        if (node.closest("[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']")) continue;
        if (!node.textContent?.trim()) continue;
        node.classList.add(HIDE_CLASS);
    }
}

function syncName(host: Element | null, text: string, scope: Element) {
    if (!host || !text) {
        dropNames(scope);
        unhide(scope);
        return;
    }
    const el = ensureName(host, text);
    for (const node of scope.querySelectorAll(`.${NAME_CLASS}`)) {
        if (node !== el) node.remove();
    }
}

function nameHost(footer: Element): Element | null {
    const card = footer.querySelector(".void-sidebar-card");
    if (card) return card;
    const btn = footerBtn(footer);
    if (!btn?.querySelector(".min-w-0")) return null;
    return btn;
}

function paintFooter() {
    const footer = document.querySelector(FOOTER);
    if (!footer) return;
    const url = avatarSrc();
    for (const img of pfps(footer, footerBtn(footer))) paintImg(img, url);
    syncName(nameHost(footer), trimName(), footer);
}

function menuNameHost(img: Element, menu: Element): Element {
    const row = img.closest("div");
    const wrap = row?.parentElement;
    if (wrap && wrap !== menu && menu.contains(wrap)) return wrap;
    if (row && row !== menu) return row;
    return img.parentElement && img.parentElement !== menu ? img.parentElement : menu;
}

function isAccountMenu(menu: Element): boolean {
    return !!menu.querySelector(PFP) || !!menu.querySelector('[class*="max-w-[400px]"].truncate');
}

function paintMenu() {
    const url = avatarSrc();
    const name = trimName();
    for (const menu of document.querySelectorAll(MENU)) {
        if (!isAccountMenu(menu)) continue;
        if (!settings.store.applyToMenu) {
            dropNames(menu);
            unhide(menu);
            for (const img of menu.querySelectorAll<HTMLImageElement>(`img[${MARK}]`)) restoreImg(img);
            continue;
        }
        for (const img of pfps(menu, menu)) paintImg(img, url);
        if (!name) {
            dropNames(menu);
            unhide(menu);
            continue;
        }
        const img = menu.querySelector(PFP) ?? menu.querySelector("img");
        if (!img) continue;
        const host = menuNameHost(img, menu);
        const el = ensureName(host, name);
        hideOfficial(host, el);
        for (const node of menu.querySelectorAll(`.${NAME_CLASS}`)) {
            if (node !== el) node.remove();
        }
    }
}

function restoreAll() {
    for (const img of document.querySelectorAll<HTMLImageElement>(`img[${MARK}]`)) restoreImg(img);
    dropNames(document);
    unhide(document);
}

function applySize() {
    const n = clamp(Math.round(num(settings.store.avatarSize, SIZE_DEFAULT)), SIZE_MIN, SIZE_MAX);
    document.documentElement.style.setProperty(SIZE_VAR, `${n}px`);
}

function clearSize() {
    document.documentElement.style.removeProperty(SIZE_VAR);
}

function apply() {
    if (!started || painting) return;
    painting = true;
    try {
        applySize();
        paintFooter();
        paintMenu();
    } finally {
        painting = false;
    }
}

function schedule() {
    if (!started || raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
    });
}

function onMut(muts: MutationRecord[]) {
    if (painting || !started) return;
    for (const m of muts) {
        if (m.type !== "attributes") {
            schedule();
            return;
        }
        const el = m.target;
        if (!(el instanceof HTMLImageElement)) continue;
        if (el.closest(FOOTER) || (settings.store.applyToMenu && el.closest(MENU))) {
            schedule();
            return;
        }
    }
}

function bind() {
    treeObs?.disconnect();
    treeObs = new MutationObserver(onMut);
    treeObs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "srcset"],
    });
}

export default definePlugin({
    name: "CustomSidebarIdentity",
    icon: UserRoundPenIcon,
    description: "Replace the sidebar avatar and display name. Empty fields keep the official values.",
    authors: [Devs.p],
    tags: ["ui"],
    enabledByDefault: false,
    settings,
    managedStyle: "customSidebarIdentity",
    cleanupSelectors: [`.${NAME_CLASS}`],

    start() {
        started = true;
        failed.clear();
        bind();
        apply();
    },

    onSettingsChange() {
        failed.clear();
        apply();
    },

    stop() {
        started = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        treeObs?.disconnect();
        treeObs = null;
        restoreAll();
        clearSize();
        failed.clear();
    },
});
