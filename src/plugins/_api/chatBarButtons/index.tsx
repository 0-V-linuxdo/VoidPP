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
                    match: /(\[!!\(\i&&!\i\)\|!!\i<<1\];return \i\[\d+\]!==\i\|\|\i\[\d+\]!==\i\?\(\i=\(0,\i\.jsx\)\("div",\{\.\.\.\i,\.\.\.\i,children:)(\i)(\}\))/,
                    replace: "$1[$self.renderButtons(),$2]$3",
                },
                {
                    match: /(\[!!\(\i&&!\i\)\|!!\i<<1\];return \i\[\d+\]!==\i\|\|\i\[\d+\]!==\i\?\i=\(0,\i\.jsx\)\("div",\{\.\.\.\i,\.\.\.\i,children:)(\i)(\}\))/,
                    replace: "$1[$self.renderButtons(),$2]$3",
                    noWarn: true,
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
