/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { canonicalizeMatch } from "../../utils/patches";

const PLUS = canonicalizeMatch(/(padding:"none",children:\i\}\))([\s\S]{0,220}?)(\i)=\(0,(\i)\.jsxs\)\((\i)\.V,\{open:(\i),children:\[(\i),(\i)\]\}\)/);
const PLUS_REPLACE = "$1$2$3=$6?$4.jsxs($5.V,{open:$6,children:[$7,$8]}):$7&&$7.props&&$7.props.render||$7";
const ICON_ROUND = canonicalizeMatch(/\("round"===(\i)\|\|"overlay"===(\i)\)&&(\i)/);
const TRIGGER = canonicalizeMatch(/shape:"circle",id:"model-select-trigger"/g);

const LIVE_PLUS = 'padding:"none",children:g}),m[43]=U,m[44]=g,m[45]=f):f=m[45],m[46]!==d||m[47]!==f||m[48]!==B?(k=(0,t.jsxs)(rA.V,{open:B,children:[d,f]}),m[46]=d,m[47]=f,m[48]=B,m[49]=k):k=m[49],k}';
const LIVE_ICON = 'W=e.f({"grok--default-marker":"grok--default-marker",$$css:!0},h,v,b[P],f[L],p(c[L]),("round"===V||"overlay"===P)&&y,"overlay"===P&&d,x)';
const LIVE_TRIGGER = 'tn?(0,t.jsx)(eu._,{variant:"ghost",size:"xl",shape:"circle",id:"model-select-trigger","aria-label":ia,children:is&&(0,t.jsx)(ek,{mode:is,icon:ir,compact:!0})})';
const COMBOBOX = 'Y=(0,t.jsx)("div",{ref:X,children:(0,t.jsxs)(s.V,{open:eu,children:[$,B]})})';

describe("BetterModeSelect live patches", () => {
    test("unwraps Attach from a closed project-start popover", () => {
        const next = LIVE_PLUS.replace(PLUS, PLUS_REPLACE);
        expect(next).toContain("k=B?t.jsxs(rA.V,{open:B,children:[d,f]}):d&&d.props&&d.props.render||d");
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

    test("rounds the compact model-select trigger", () => {
        const next = LIVE_TRIGGER.replace(TRIGGER, 'shape:"round",id:"model-select-trigger"');
        expect(next).toContain('shape:"round",id:"model-select-trigger"');
        expect(next).not.toContain('shape:"circle",id:"model-select-trigger"');
    });
});
