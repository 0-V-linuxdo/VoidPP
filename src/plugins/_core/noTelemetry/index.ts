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
            find: '"/api/log_metric"',
            all: true,
            replacement: [
                {
                    match: /\(0,\i\)\("\/api\/log_metric",\i\)/g,
                    replace: "false",
                    noWarn: true,
                },
                {
                    match: /[A-Za-z_$][\w$]*\("\/api\/log_metric",\i\)/g,
                    replace: "false",
                },
                {
                    match: /\(0,\i\)\("\/api\/log_metric",JSON\.stringify\([^)]*\)\)/g,
                    replace: "false",
                    noWarn: true,
                },
                {
                    match: /[A-Za-z_$][\w$]*\("\/api\/log_metric",JSON\.stringify\([^)]*\)\)/g,
                    replace: "false",
                    noWarn: true,
                },
                {
                    match: /navigator\.sendBeacon\("\/api\/log_metric",new Blob\([^)]*\)\)/g,
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
