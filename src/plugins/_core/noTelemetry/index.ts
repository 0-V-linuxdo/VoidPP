/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ShieldOffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";

const METRIC = "/api/log_metric";
const LAZY_SESSION_STUB = "({K:()=>({}),g(){},V:()=>()=>{},default:{track(){},people:{set(){}},get_config:()=>\"\"},o:e=>e,f(){},X(){},y(){},logXaiEvent(){},trackLegacy(){},B(){}})";

export default definePlugin({
    name: "NoTelemetry",
    icon: ShieldOffIcon,
    description: "Disables all tracking, telemetry, and event logging.",
    authors: [Devs.Prism],
    tags: ["privacy"],
    required: true,
    startAt: StartAt.Init,
    start() {
        const beacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = (url, data) => {
            if (String(url).includes(METRIC)) return true;
            return beacon(url, data);
        };
        const fetchFn = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const url = typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.href
                    : input instanceof Request
                        ? input.url
                        : String(input);
            if (url.includes(METRIC)) return Promise.resolve(new Response(null, { status: 204 }));
            return fetchFn(input, init);
        };
    },

    patches: [
        {
            find: '"opentelemetry.js.api."',
            noWarn: true,
            replacement: {
                match: /("onRouterTransitionStart",0,)function\([^)]*\)\{[^}]{0,200}\}/,
                replace: "$1function(){}",
            },
        },
        {
            find: '"onRouterTransitionStart",0,function',
            replacement: {
                match: /"onRouterTransitionStart",0,function\(\i,\i\)\{[^}]{0,120}\}/,
                replace: '"onRouterTransitionStart",0,function(){}',
            },
        },
        {
            find: '"after-init"),(0,',
            noWarn: true,
            replacement: [
                {
                    match: /"startRecordingImagineSession",0,function\(\)\{[\s\S]{0,400}?\}(?=,"stopRecordingImagineSession")/,
                    replace: '"startRecordingImagineSession",0,function(){}',
                },
                {
                    match: /"stopRecordingImagineSession",0,function\(\)\{[\s\S]{0,400}?\}(?=\])/,
                    replace: '"stopRecordingImagineSession",0,function(){}',
                },
                {
                    match: /(\i)\.default\.init\((\i)\.MIXPANEL_TOKEN,/g,
                    replace: "$1.default.init=()=>{},$1.default.init($2.MIXPANEL_TOKEN,",
                },
            ],
        },
        {
            find: "sendBatchLogEvent=",
            all: true,
            group: true,
            replacement: [
                {
                    match: /sendBatchLogEvent=\i=>\{[^}]{0,150}\}/,
                    replace: "sendBatchLogEvent=()=>{}",
                },
                {
                    match: /sendBatchLogExperimentExposure=\i=>\{[^}]{0,150}\}/,
                    replace: "sendBatchLogExperimentExposure=()=>{}",
                },
            ],
        },
        {
            find: ["new TextEncoder;var", '"/api/log_metric"'],
            all: true,
            replacement: [
                {
                    match: /(let \i=new TextEncoder;var )(\i)=e\.i\(\d+\)/,
                    replace: "$1$2={K:()=>({}),g(){},V:()=>()=>{}}",
                },
                {
                    match: /e\.i\((?:5156912|3551093|6785890|2735394|3427294|8289378|1254211|127418|2274141)\)/g,
                    replace: LAZY_SESSION_STUB,
                },
                {
                    match: /\i\("\/api\/log_metric",\i\)/g,
                    replace: "false",
                },
                {
                    match: /\i\("\/api\/log_metric",JSON\.stringify\([\s\S]{0,180}?\)\)/g,
                    replace: "false",
                },
            ],
        },
        {
            find: "e.i(5156912)",
            all: true,
            noWarn: true,
            replacement: {
                match: /e\.i\(5156912\)/g,
                replace: "({K:()=>({}),g(){},V:()=>()=>{}})",
            },
        },
        {
            find: '"/api/log_metric"',
            all: true,
            noWarn: true,
            replacement: [
                {
                    match: /navigator\.sendBeacon\("\/api\/log_metric",new Blob\([^)]*\)\)/g,
                    replace: "void 0",
                    noWarn: true,
                },
            ],
        },
        {
            find: "isEnvVarsSet(){return void 0!=",
            replacement: {
                match: /isEnvVarsSet\(\)\{return void 0!=\i&&""!=\i\|\|!!this\.customEndpoint\}/,
                replace: "isEnvVarsSet(){return false}",
            },
        },
    ],
});
