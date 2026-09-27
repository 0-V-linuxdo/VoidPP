/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TextCursorInputIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

interface Extension {
    name?: string;
}

let cachedDeps: [unknown, unknown] | null = null;
let cachedSig = "";
let cachedMention: unknown;

export default definePlugin({
    name: "StableComposer",
    icon: TextCursorInputIcon,
    description: "Stop the Grok composer from destroying and recreating its editor when the extension list is rebuilt unchanged, which was resetting the caret and breaking IME composition.",
    authors: [Devs.p],
    tags: ["composer"],
    enabledByDefault: true,

    _deps(extensions: Extension[], mention: unknown): [unknown, unknown] {
        const sig = Array.isArray(extensions) ? `${extensions.length}:${extensions.map(e => e?.name ?? "?").join(",")}` : String(extensions);
        if (cachedDeps && sig === cachedSig && mention === cachedMention) return cachedDeps;
        cachedSig = sig;
        cachedMention = mention;
        cachedDeps = [extensions, mention];
        return cachedDeps;
    },

    patches: [
        {
            find: "transformPastedHTML:",
            replacement: {
                match: /(transformPastedHTML:\i\}\},)\[(\i),(\i)\]\)/,
                replace: "$1$self._deps($2,$3))",
            },
        },
    ],
});
