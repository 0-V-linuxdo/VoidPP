/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { canonicalizeMatch } from "../../utils/patches";
import { isAttachMenuProps, isPointOnAttach } from "./attachOpen";

const PLUS = canonicalizeMatch(/(padding:"none",children:\i\}\))([\s\S]{0,220}?)(\i)=\(0,(\i)\.jsxs\)\((\i)\.V,\{open:(\i),children:\[(\i),(\i)\]\}\)/);
const PLUS_REPLACE = "$1$2$3=$6?$4.jsxs($5.V,{open:$6,children:[$7,$8]}):$7&&$7.props&&$7.props.render||null";
const ICON_ROUND = canonicalizeMatch(/\("round"===(\i)\|\|"overlay"===(\i)\)&&(\i)/);

const LIVE_PLUS = 'padding:"none",children:g}),m[43]=U,m[44]=g,m[45]=f):f=m[45],m[46]!==d||m[47]!==f||m[48]!==B?(k=(0,t.jsxs)(rA.V,{open:B,children:[d,f]}),m[46]=d,m[47]=f,m[48]=B,m[49]=k):k=m[49],k}';
const LIVE_ICON = 'W=e.f({"grok--default-marker":"grok--default-marker",$$css:!0},h,v,b[P],f[L],p(c[L]),("round"===V||"overlay"===P)&&y,"overlay"===P&&d,x)';
const LIVE_TRIGGER = 'tn?(0,t.jsx)(eu._,{variant:"ghost",size:"xl",shape:"circle",id:"model-select-trigger","aria-label":ia,children:is&&(0,t.jsx)(ek,{mode:is,icon:ir,compact:!0})})';
const COMBOBOX = 'Y=(0,t.jsx)("div",{ref:X,children:(0,t.jsxs)(s.V,{open:eu,children:[$,B]})})';
const VOICE_CALL_FALL = canonicalizeMatch(/case"voice-call":\{let \i;return \i\[\d+\]!==\i\.onPress\?\(\i=\(0,\i\.jsx\)\(\i,\{onPress:\i\.onPress\}\),\i\[\d+\]=\i\.onPress,\i\[\d+\]=\i\):\i=\i\[\d+\],\i\}/);
const SEND_VOICE_ACTION = canonicalizeMatch(/(case"send":case"voice":\{let \i;return \i\[\d+\]!==)(\i)(\?\(\i=\(0,\i\.jsx\)\(\i,\{action:)\2(\})/);
const VOICE_LOCALS = canonicalizeMatch(/(\i)="voice"===(\i)\.kind\?\2:null,(\i)="send"===\2\.kind\?\2:null;/);
const SEND_VOICE_REPLACE = '$1$2$3"send"===$2.kind?$2:{kind:"send",active:!1,enabled:!1}$4';
const VOICE_LOCALS_REPLACE = '$1="voice"===$2.kind?$2:null,$3="send"===$2.kind?$2:null;if("voice"===$2.kind){$1=null;$3={kind:"send",active:!1,enabled:!1};$2={kind:"send",active:!1,enabled:!1};}';
const LIVE_TRAILING = 'case"voice-call":{let e;return r[2]!==o.onPress?(e=(0,t.jsx)(m,{onPress:o.onPress}),r[2]=o.onPress,r[3]=e):e=r[3],e}case"send":case"voice":{let e;return r[4]!==o?(e=(0,t.jsx)(y,{action:o}),r[4]=o,r[5]=e):e=r[5],e}';
const LIVE_VOICE_LOCALS = 'I="voice"===b.kind?b:null,w="send"===b.kind?b:null;';

describe("BetterModeSelect live patches", () => {
    test("unwraps Attach from a closed project-start popover", () => {
        const next = LIVE_PLUS.replace(PLUS, PLUS_REPLACE);
        expect(next).toContain("k=B?t.jsxs(rA.V,{open:B,children:[d,f]}):d&&d.props&&d.props.render||null");
        expect(next).not.toContain("k=B?t.jsxs(rA.V,{open:B,children:[d,f]}):d,");
        expect(next).not.toContain("k=(0,t.jsxs)(rA.V,{open:B,children:[d,f]})");
    });

    test("does not unwrap a combobox popover", () => {
        expect(COMBOBOX.replace(PLUS, PLUS_REPLACE)).toBe(COMBOBOX);
    });

    test("treats IconButton circle as round", () => {
        const next = LIVE_ICON.replace(ICON_ROUND, '("round"===$1||"circle"===$1||"overlay"===$2)&&$3');
        expect(next).toContain('("round"===V||"circle"===V||"overlay"===P)&&y');
        expect(next).toContain('"overlay"===P&&d');
    });

    test("leaves compact model-select trigger as circle", () => {
        // 2777665 maps circle→round and any other shape (including round)→square.
        expect(LIVE_TRIGGER).toContain('shape:"circle",id:"model-select-trigger"');
        expect(LIVE_TRIGGER).not.toContain('shape:"round",id:"model-select-trigger"');
    });

    test("DesktopButton passes circle through to IconButton", () => {
        const src = readFileSync(new URL("../../../sites/grok/common.js", import.meta.url), "utf8");
        expect(src).toContain('circle: "circle"');
        expect(src).toContain('round: "circle"');
        expect(src).not.toMatch(/circle:\s*"round"/);
    });

    test("selected pin well paints on the inner 32px button", () => {
        const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
        const host = css.match(/\.void-cms-pin-host \{[^}]+\}/)?.[0] ?? "";
        expect(host).toContain("display: inline-grid");
        expect(host).not.toContain("overflow: hidden");
        expect(css).toMatch(/form\[data-composer\] \.void-cms-pin-host:not\(\.void-cms-labeled\) \{[\s\S]*?height: var\(--grok-control-height-lg, 32px\) !important;/);
        expect(css).toMatch(/form\[data-composer\] \.void-cms-pin-host\.void-cms-on :is\(button, \[role="button"\], \[data-icon-button\]\) \{[\s\S]*?background-color: var\(--grok-bg-secondary/);
        expect(css).toContain("content: none !important");
        expect(css).toContain("display: contents");
        expect(css).not.toMatch(/form\[data-composer\] \.void-cms-pin-host\.void-cms-on,[\s\S]{0,180}background-color: var\(--button-ghost-hover/);
    });

    test("cousin wells keep fill on the inner control", () => {
        const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
        expect(css).toMatch(/\.void-cms-pin-host > :not\(button\):not\(\[role="button"\]\):not\(\[data-icon-button\]\)/);
        expect(css).toMatch(/\.void-cms-pin-host\.void-cms-labeled :is\(button, \[role="button"\], \[data-icon-button\]\) \{[^}]*padding-inline: 0\.5rem !important;/);
        const labeledHost = css.match(/\.void-cms-pin-host\.void-cms-labeled \{[^}]+\}/)?.[0] ?? "";
        expect(labeledHost).toContain("padding-inline: 0");
        expect(labeledHost).not.toContain("padding-inline: 0.5rem");
        const slop = css.match(/\[data-testid="attach-button"\]::after,[\s\S]*?\[data-composer-action\]::after \{[^}]+\}/)?.[0] ?? "";
        expect(slop).toContain("inset: -8px");
        expect(slop).toContain("background: transparent");
        expect(slop).not.toMatch(/background-color:\s*var\(/);
    });

    test("usage chip matches plus/send at 32px", () => {
        const css = readFileSync(new URL("../usageDisplay/styles.css", import.meta.url), "utf8");
        const src = readFileSync(new URL("../usageDisplay/index.tsx", import.meta.url), "utf8");
        const grok = readFileSync(new URL("../../../sites/grok/styles.js", import.meta.url), "utf8");
        expect(src).toMatch(/size:\s*"lg"/);
        expect(src).not.toMatch(/size:\s*"xl"/);
        expect(css).toMatch(/button:has\(\.void-ud-trigger\) \{[\s\S]*?height: var\(--grok-control-height-lg, 32px\) !important;/);
        expect(css).toMatch(/button:has\(\.void-ud-icon-only\) \{[\s\S]*?width: var\(--grok-control-height-lg, 32px\) !important;/);
        expect(css).toMatch(/button:has\(\.void-ud-trigger\)::before/);
        expect(grok).toMatch(/\.uspp-chatbar-btn \{[^}]*min-width: 32px; height: 32px;/);
        expect(grok).not.toMatch(/\.uspp-chatbar-btn \{[^}]*min-width: 36px; height: 36px;/);
    });
});

describe("attach menu open fallback", () => {
    test("picks DropdownMenu open/onOpenChange and skips tooltip", () => {
        const open = (_v: boolean) => {};
        expect(isAttachMenuProps({ open: false, onOpenChange: open })).toBe(true);
        expect(isAttachMenuProps({ open: false, onOpenChange: open, modal: undefined })).toBe(true);
        expect(isAttachMenuProps({ open: false, onOpenChange: open, delayDuration: 600 })).toBe(false);
        expect(isAttachMenuProps({ open: false, onOpenChange: open, disableHoverableContent: true })).toBe(false);
        expect(isAttachMenuProps({ open: false, onOpenChange: open, disableHoverablePopup: true })).toBe(false);
        expect(isAttachMenuProps({ open: false, onOpenChange: open, actionsRef: {} })).toBe(false);
        expect(isAttachMenuProps({ onOpenChange: open })).toBe(false);
        expect(isAttachMenuProps({ open: false })).toBe(false);
    });

    test("plus fallback only force-opens from closest(attach-button), not descendants", () => {
        const src = readFileSync(new URL("./attachOpen.ts", import.meta.url), "utf8");
        expect(src).toContain("pointerdown");
        expect(src).toContain("pointercancel");
        expect(src).toContain("collapsedPlusAtPointerDown");
        expect(src).toContain("openGen");
        expect(src).toContain("closest(ATTACH_SEL)");
        expect(src).not.toContain("querySelector(ATTACH_SEL)");
        expect(src).not.toContain("ATTACH_WRAPPER_MAX_PX");
        expect(src).not.toContain("viaChild");
        expect(src).toContain("closeAttachIfOpen");
        expect(src).toContain("open(false)");
        expect(src).toContain("querySelectorAll(ATTACH_SEL)");
    });

    test("isPointOnAttach keeps 8px slop and rejects far clicks", () => {
        const btn = {
            getBoundingClientRect: () => ({ left: 100, top: 100, right: 132, bottom: 132 }),
        } as HTMLElement;
        expect(isPointOnAttach({ clientX: 116, clientY: 116 }, btn)).toBe(true);
        expect(isPointOnAttach({ clientX: 96, clientY: 116 }, btn)).toBe(true);
        expect(isPointOnAttach({ clientX: 80, clientY: 116 }, btn)).toBe(false);
    });

    test("inline field children catch clicks; plus/send hosts do not pe:auto every child", () => {
        const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
        expect(css).toContain('[data-composer-field] > *');
        expect(css).toContain('[role="textbox"]');
        expect(css).toContain('[data-base-ui-tooltip-trigger]');
        expect(css).not.toMatch(/has\(\[data-testid="attach-button"\]\) > \*,/);
        expect(css).not.toMatch(/has\(\[data-composer-action\]\) > \*,/);
    });

});

describe("trailing send slot", () => {
    test("falls voice-call through and coerces voice to inactive send", () => {
        const next = LIVE_TRAILING
            .replace(VOICE_CALL_FALL, 'case"voice-call":')
            .replace(SEND_VOICE_ACTION, SEND_VOICE_REPLACE);
        expect(next).toContain('case"voice-call":case"send":case"voice":');
        expect(next).toContain('{action:"send"===o.kind?o:{kind:"send",active:!1,enabled:!1}}');
        expect(next).not.toContain("return null");
        expect(next).not.toContain("jsx)(m,{onPress:");
    });

    test("voice locals force send kind without unmounting the slot", () => {
        const next = LIVE_VOICE_LOCALS.replace(VOICE_LOCALS, VOICE_LOCALS_REPLACE);
        expect(next).toContain('kind:"send"');
        expect(next).toContain("active:!1");
        expect(next).not.toContain("return null");
        expect(next).toContain('b={kind:"send",active:!1,enabled:!1}');
    });

    test("plugin source keeps the trailing send slot", () => {
        const src = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
        const block = src.split("find: '\"data-composer-action\":\"voice\"'")[1]?.split("find:")[0] ?? "";
        expect(block).toContain('kind:"send"');
        expect(block).not.toContain("return null");
        expect(block).not.toMatch(/replace:\s*"null"/);
        expect(block).toContain('case"voice-call":');
    });
});
