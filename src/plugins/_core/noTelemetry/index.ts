/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ShieldOffIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoTelemetry",
    icon: ShieldOffIcon,
    description: "Disables all tracking, telemetry, and event logging.",
    authors: [Devs.Prism],
    tags: ["privacy"],
    required: true,

    patches: [
        {
            find: '"opentelemetry.js.api."',
            replacement: {
                match: /("onRouterTransitionStart",0,)function\([^)]*\)\{[^}]{0,200}\}/,
                replace: "$1function(){}",
            },
        },
        {
            find: '"after-init"),(0,',
            replacement: [
                {
                    match: /"startRecordingImagineSession",0,function\(\)\{[\s\S]*?\}(?=,"stopRecordingImagineSession")/,
                    replace: '"startRecordingImagineSession",0,function(){}',
                },
                {
                    match: /"stopRecordingImagineSession",0,function\(\)\{[\s\S]*?\}(?=\])/,
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
            find: '"/api/log_metric"',
            all: true,
            replacement: [
                {
                    match: /"\/api\/log_metric",\i\)/,
                    replace: '"/api/log_metric",[])',
                    noWarn: true,
                },
                {
                    match: /"\/api\/log_metric",JSON\.stringify\(\[[^\]]*\]\)/,
                    replace: '"/api/log_metric",[])',
                    noWarn: true,
                },
                {
                    match: /navigator\.sendBeacon\("\/api\/log_metric",new Blob\(\[[^\]]*\],\{type:"application\/json"\}\)\)/,
                    replace: "void 0",
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
