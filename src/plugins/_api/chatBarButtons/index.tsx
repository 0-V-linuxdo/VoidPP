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
                    match: /\},"mode-select"\),/,
                    replace: "$&$self.renderButtons(),",
                },
                {
                    match: /style:\i(?:\|\|\i)*\?void 0:(\{paddingInlineEnd:\i\})/,
                    replace: "style:$1",
                },
            ],
        },
        {
            find: ["Type to imagine", "Generation mode"],
            noWarn: true,
            replacement: {
                match: /("Generation mode"\)\}\)\}\),)(\i(?:&&!?\i){0,4}&&\(0,\i\.jsx\)\(\i\.DictationButton,)/,
                replace: "$1$self.renderImagineButtons(),$2",
            },
        },
    ],
});
