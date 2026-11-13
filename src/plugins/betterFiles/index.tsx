/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { SelectionActionBar, SelectionCheckbox } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { FilesIcon } from "@components/icons";
import { React } from "@turbopack/common/react";
import { FilesPageStore } from "@turbopack/common/stores";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { createSelectionStore } from "@utils/misc";
import definePlugin from "@utils/types";

const logger = new Logger("BetterFiles");

const selection = createSelectionStore<string>();
const assetsById = new Map<string, { assetId: string }>();

interface LibraryItem {
    kind?: string;
    id?: string;
    asset?: { assetId: string };
}

function fileId(item: LibraryItem | undefined): string | null {
    if (item?.kind !== "file") return null;
    return item.asset?.assetId ?? item.id ?? null;
}

function FileCheckbox({ item }: { item: LibraryItem }) {
    const id = fileId(item);
    if (!id || !item.asset) return null;
    assetsById.set(id, item.asset);
    return <SelectionCheckbox selection={selection} id={id} />;
}

async function deleteAssets(ids: string[]) {
    const deleteAsset = FilesPageStore.useFilesPageStore.getState().deleteAsset as (
        assetId: string,
        asset?: { assetId?: string; fileSource?: string },
    ) => Promise<unknown>;
    await Promise.allSettled(ids.map(async id => {
        const asset = assetsById.get(id);
        try {
            const ok = await deleteAsset(id, asset);
            if (ok === false) logger.error("Failed to delete asset", id);
        } catch (e) {
            logger.error("Failed to delete asset", id, e);
        }
        assetsById.delete(id);
    }));
}

function wrapItemClick(onClick: (e: MouseEvent) => void, item: LibraryItem) {
    return (e: MouseEvent) => {
        const id = fileId(item);
        if (id && item.asset && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            if (selection.has(id)) {
                selection.toggle(id);
                assetsById.delete(id);
            } else {
                assetsById.set(id, item.asset);
                selection.toggle(id);
            }
            return;
        }
        onClick(e);
    };
}

export default definePlugin({
    name: "BetterFiles",
    icon: FilesIcon,
    description: "Adds bulk delete to the Library page.",
    authors: [Devs.Prism, Devs.p],
    tags: ["media"],
    managedStyle: "betterFiles",

    start() {
        selection.clear();
        assetsById.clear();
    },

    stop() {
        selection.clear();
        assetsById.clear();
    },

    _renderFileCheckbox: ErrorBoundary.wrap(FileCheckbox, null),
    _renderFileActionBar: ErrorBoundary.wrap(() => <SelectionActionBar selection={selection} noun="file" title="Delete files" onDelete={deleteAssets} />, null),
    _wrapItemClick: wrapItemClick,

    patches: [
        {
            find: '"library-page.title","Library"',
            replacement: [
                {
                    // LibraryRow: ctrl/meta-click. Source: item:c,leading:w,onOpen:x,title:k
                    match: /(item:)(\i)(,leading:)(\i)(,onOpen:)(\i)(,title:\i)/,
                    replace: "$1$2$3$4$5$self._wrapItemClick($6,$2)$7",
                },
                {
                    // LibraryRow checkbox. Source: (0,r.jsx)("div",{ref:j,className:"grok-jp7ctv",children:s})
                    match: /\(0,(\i)\.jsx\)\("div",\{ref:(\i),className:"grok-jp7ctv",children:(\i)\}\)/,
                    replace: '(0,$1.jsxs)("div",{"data-void-file":"",ref:$2,className:"grok-jp7ctv",children:[$self._renderFileCheckbox({item:arguments[0].item}),$3]})',
                },
                {
                    // LibraryTile overlay button. Source: "data-library-item-id":u.id,onClick:v,type:"button",className:"grok-jyslct grok-jbqb8w grok-ng3xce grok-t0e3qv
                    match: /("data-library-item-id":)(\i)\.id,onClick:(\i)(,type:"button",className:"grok-jyslct grok-jbqb8w grok-ng3xce grok-t0e3qv)/,
                    replace: "$1$2.id,onClick:$self._wrapItemClick($3,$2)$4",
                },
                {
                    // LibraryTile checkbox. Source: (0,r.jsxs)("div",{ref:b,...L,children:[a,c]})
                    match: /\(0,(\i)\.jsxs\)\("div",\{ref:(\i),\.\.\.(\i),children:\[(\i),(\i)\]\}\)/,
                    replace: '(0,$1.jsxs)("div",{"data-void-file":"",ref:$2,...$3,children:[$self._renderFileCheckbox({item:arguments[0].item}),$4,$5]})',
                },
                {
                    // Action bar beside Upload. Source: (0,r.jsx)(i.M,{controls:F,title:n,toolbar:p,children:x}),v[42]=F
                    // The =\3 backref must stay so controls ident matches the cache slot.
                    match: /\(0,(\i)\.jsx\)\((\i)\.M,\{controls:(\i),title:(\i),toolbar:(\i),children:(\i)\}\),(\i)\[42\]=\3/,
                    replace: "(0,$1.jsx)($2.M,{controls:[$self._renderFileActionBar(),$3],title:$4,toolbar:$5,children:$6}),$7[42]=$3",
                },
            ],
        },
    ],
});
