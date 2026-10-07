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
import { findByPropsLazy } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { createSelectionStore } from "@utils/misc";
import definePlugin from "@utils/types";

const logger = new Logger("BetterFiles");

const LibraryAssets: { deleteLibraryAsset: (asset: { assetId: string }) => Promise<unknown> } = findByPropsLazy("deleteLibraryAsset", "useLibraryAssets");

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
    const { deleteLibraryAsset } = LibraryAssets;
    for (const id of ids) {
        const asset = assetsById.get(id) ?? { assetId: id };
        try { await deleteLibraryAsset(asset); } catch (e) { logger.error("Failed to delete asset", id, e); }
        assetsById.delete(id);
    }
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
            find: "LibraryPageContent:refreshAssets",
            replacement: [
                {
                    match: /("data-library-item-id":\i\.id,onPointerDown:\i,onClick:)(\i)(,className:"absolute inset-0 z-0 focus-visible:outline-none")/,
                    replace: "$1$self._wrapItemClick($2,arguments[0].item)$3",
                },
                {
                    match: /(SIDEBAR_ROW_MASK_STYLE,children:\[)(\i,\i,\i,\i)\]/,
                    replace: "$1$self._renderFileCheckbox({item:arguments[0].item}),$2]",
                },
                {
                    match: /("data-library-item-id":\i\.id,onClick:)(\i=>\{\i\.stopPropagation\(\),\i\(\i\)\})/,
                    replace: "$1$self._wrapItemClick($2,arguments[0].item)",
                },
                {
                    match: /("flex min-w-0 items-center gap-3 text-left font-medium",children:\[)(\i,\i)\]/,
                    replace: "$1$self._renderFileCheckbox({item:arguments[0].item}),$2]",
                },
                {
                    match: /("library-page\.title","Library"\)\}\),\(0,\i\.jsx\)\("div",\{className:"flex items-center gap-3",children:)(\i)\}\)/,
                    replace: "$1[$self._renderFileActionBar(),$2]})",
                },
            ],
        },
    ],
});
