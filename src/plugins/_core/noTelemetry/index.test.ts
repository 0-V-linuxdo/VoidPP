/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, test } from "bun:test";

import { canonicalizeMatch } from "../../../utils/patches";

const STUB = canonicalizeMatch(/(let \i=new TextEncoder;var )(\i)=e\.i\(\d+\)/);
const EL_IDENT = canonicalizeMatch(/\i\("\/api\/log_metric",\i\)/g);
const EL_JSON = canonicalizeMatch(/\i\("\/api\/log_metric",JSON\.stringify\([\s\S]{0,180}?\)\)/g);
const BEACON = canonicalizeMatch(/navigator\.sendBeacon\("\/api\/log_metric",new Blob\([^)]*\)\)/g);

const LIVE_FACTORY = 'e=>{"use strict";let t=new TextEncoder;var s=e.i(5156912),r=e.i(177434);el("/api/log_metric",r)||(s+=a);s>0&&el("/api/log_metric",JSON.stringify([{type:"metric_beacon_dropped",count:s}]))}';
const LIVE_BEACON = 'navigator.sendBeacon("/api/log_metric",new Blob([t],{type:"application/json"}))';
const SENTRY_ENCODER = 'function lt(e){if(!e)return;let t=new TextEncoder;try{if("string"==typeof e)return t.encode(e).length}';

describe("NoTelemetry log_metric factory", () => {
    test("stubs the helper import after TextEncoder", () => {
        const next = LIVE_FACTORY.replace(STUB, "$1$2={K:()=>({}),g(){},V:()=>()=>{}}");
        expect(next).toContain("var s={K:()=>({}),g(){},V:()=>()=>{}}");
        expect(next).not.toContain("e.i(5156912)");
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
