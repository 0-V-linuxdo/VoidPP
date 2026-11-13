/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { VoidPPChatBarButtons } from "@api/ChatBarButtons";
import { ModalContainer } from "@api/Modals";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { Fragment, React } from "@turbopack/common/react";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

function Buttons() {
    return (
        <Fragment>
            <VoidPPChatBarButtons location="chat" />
            <ModalContainer />
        </Fragment>
    );
}

function ImagineButtons() {
    return <VoidPPChatBarButtons location="imagine" />;
}

export default definePlugin({
    name: "ChatBarButtonAPI",
    description: "Adds buttons to the chat input bar.",
    authors: [Devs.Prism],
    required: true,
    hidden: true,

    renderButtons: ErrorBoundary.wrap(Buttons),
    renderImagineButtons: ErrorBoundary.wrap(ImagineButtons),

    patches: [
        {
            find: "data-query-bar-mode-select",
            all: true,
            replacement: [
                {
                    // Same compiler temp as BetterModeSelect. Nesting `[jsx, buttons]` inside
                    // `[pins, jsx]` still flattens to pins, control, buttons.
                    match: /(\(0,\i\.jsxs?\)\(\i(?:\.\i){0,4},\{(?:(?!\(0,\i\.jsxs?\)\()[\s\S]){0,1600}?"data-query-bar-mode-select":!0,[\s\S]{0,3500}?\},"mode-select"\))/,
                    replace: "[$&,$self.renderButtons()]",
                },
                {
                    match: /(em\?\(0,\i\.jsx\)\("div",\{ref:\i,\.\.\.\i,"data-query-bar-mode-select":"",\.\.\.\{0:\{className:"[^"]+"\},1:\{className:"[^"]+"\}\}\[0\|!!\i\],children:\i\}\):null)/,
                    replace: "[$1,$self.renderButtons()]",
                },
                {
                    match: /style:\i(?:\|\|\i)*\?void 0:(\{paddingInlineEnd:\i\})/,
                    replace: "style:$1",
                    noWarn: true,
                },
            ],
        },
        {
            // Imagine composer dropped data-wd-toolbar. The gutter row is still
            // trailingGutterPx / tight / children:[…]. all:true so a module that
            // only mentions the prop does not consume the patch.
            find: "data-unified-toolbar",
            all: true,
            replacement: {
                match: /(trailingGutterPx:\i,tight:\i,children:\[[^\]]{0,120})\]/,
                replace: "$1,$self.renderImagineButtons()]",
            },
        },
    ],
});
