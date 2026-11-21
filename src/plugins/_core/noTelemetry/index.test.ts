/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { canonicalizeMatch } from "../../../utils/patches";

const STUB = canonicalizeMatch(/(let \i=new TextEncoder;var )(\i)=e\.i\(\d+\)/);
const LAZY = /e\.i\((?:5156912|3551093|6785890|2735394|3427294|8289378|1254211|127418|2274141)\)/g;
const LAZY_STUB = "({K:()=>({}),g(){},V:()=>()=>{},default:{track(){},people:{set(){}},get_config:()=>\"\"},o:e=>e,f(){},X(){},y(){},logXaiEvent(){},trackLegacy(){},B(){}})";
const EL_IDENT = canonicalizeMatch(/\i\("\/api\/log_metric",\i\)/g);
const EL_JSON = canonicalizeMatch(/\i\("\/api\/log_metric",JSON\.stringify\([\s\S]{0,180}?\)\)/g);
const BEACON = canonicalizeMatch(/navigator\.sendBeacon\("\/api\/log_metric",new Blob\([^)]*\)\)/g);

const LIVE_FACTORY = 'e=>{"use strict";let t=new TextEncoder;var s=e.i(5156912),r=e.i(177434),a=e.i(3551093);e.i(6785890);var i=e.i(2735394),o=e.i(3427294),n=e.i(8289378),c=e.i(1254211);var I=e.i(127418),x=e.i(3553598),j=e.i(2417251);var Q=e.i(2274141);el("/api/log_metric",r)||(s+=a);s>0&&el("/api/log_metric",JSON.stringify([{type:"metric_beacon_dropped",count:s}]))}';
const LIVE_BEACON = 'navigator.sendBeacon("/api/log_metric",new Blob([t],{type:"application/json"}))';
const SENTRY_ENCODER = 'function lt(e){if(!e)return;let t=new TextEncoder;try{if("string"==typeof e)return t.encode(e).length}';
const LAZY_IDS = ["5156912", "3551093", "6785890", "2735394", "3427294", "8289378", "1254211", "127418", "2274141"];

function patchFactory(src: string) {
    LAZY.lastIndex = 0;
    EL_IDENT.lastIndex = 0;
    EL_JSON.lastIndex = 0;
    return src
        .replace(STUB, "$1$2={K:()=>({}),g(){},V:()=>()=>{}}")
        .replace(LAZY, LAZY_STUB)
        .replace(EL_IDENT, "false")
        .replace(EL_JSON, "false");
}

describe("NoTelemetry log_metric factory", () => {
    test("stubs the helper import after TextEncoder", () => {
        const next = LIVE_FACTORY.replace(STUB, "$1$2={K:()=>({}),g(){},V:()=>()=>{}}");
        expect(next).toContain("var s={K:()=>({}),g(){},V:()=>()=>{}}");
        expect(next).not.toContain("e.i(5156912)");
    });

    test("stubs the rest of the 5156912-chunk imports and keeps same-chunk debounce", () => {
        const next = patchFactory(LIVE_FACTORY);
        for (const id of LAZY_IDS) expect(next).not.toContain(`e.i(${id})`);
        expect(next).toContain("e.i(177434)");
        expect(next).toContain("e.i(3553598)");
        expect(next).toContain("e.i(2417251)");
        expect(next).toContain("false||(s+=a)");
        expect(next).toContain("s>0&&false");
        expect(() => new Function("e", `return (${next})`)).not.toThrow();
    });

    test("turns el(\"/api/log_metric\", ident) into false", () => {
        const next = LIVE_FACTORY.replace(EL_IDENT, "false");
        expect(next).toContain("false||(s+=a)");
        expect(next).not.toContain('el("/api/log_metric",r)');
    });

    test("turns the dropped-beacon stringify call into false", () => {
        const next = LIVE_FACTORY.replace(EL_JSON, "false");
        expect(next).toContain("s>0&&false");
        expect(next).not.toContain('el("/api/log_metric",JSON.stringify');
    });

    test("does not rewrite a Sentry TextEncoder that is not the metrics factory", () => {
        expect(SENTRY_ENCODER.replace(STUB, "STUBBED")).toBe(SENTRY_ENCODER);
    });

    test("noops the clipboard sendBeacon", () => {
        expect(LIVE_BEACON.replace(BEACON, "void 0")).toBe("void 0");
    });
});
