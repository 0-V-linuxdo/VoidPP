/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ContextMenuLocation, type MenuPrimitives, VoidPPContextMenuItems } from "@api/ContextMenus";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { React } from "@turbopack/common/react";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ContextMenuAPI",
    description: "Adds items to context menus.",
    authors: [Devs.Prism],
    required: true,
    hidden: true,

    renderItems(location: ContextMenuLocation, ctx?: Record<string, any>, menu?: MenuPrimitives) {
        return (
            <ErrorBoundary>
                <VoidPPContextMenuItems location={location} menu={menu} {...ctx} />
            </ErrorBoundary>
        );
    },

    patches: [
        {
            find: '"Editing actions","Editing actions"',
            all: true,
            group: true,
            replacement: [
                {
                    match: /onSaveEdit:(\i),([^}]{0,80}?route:\i)\}\)(?!\{)/,
                    replace: "onSaveEdit:$1,id:arguments[0].id,$2})",
                },
                {
                    match: /onEditClick:(\i),route:(\i)\}\)(?!\{)/g,
                    replace: "onEditClick:$1,id:arguments[0].id,route:$2})",
                },
                {
                    match: /Item:(\i)\.(Dropdown|Context)MenuItem,/g,
                    replace: "$&VoidPPMenu:{Item:$1.$2MenuItem,Sub:$1.$2MenuSub,SubTrigger:$1.$2MenuSubTrigger,SubContent:$1.$2MenuSubContent,Separator:$1.$2MenuSeparator},",
                },
                {
                    match: /=(\i)&&(\jsx{\i}\{onSelect:\(\)=>\1\(\),)(?=.{0,80}TrashIcon)/,
                    replace: '=$self.renderItems("conversation",{conversationId:arguments[0].id},arguments[0].VoidPPMenu),$1&&$2',
                },
            ],
        },
        {
            find: '"more-actions-dropdown"',
            all: true,
            replacement: {
                match: /"more-action\.copy-model-hash".{0,80}slice\(0,5\)\}\}\)\}\)/,
                replace: '$&,$self.renderItems("message",{response:arguments[0].response})',
            },
        },
        {
            find: '"user-dropdown.upgrade","Upgrade plan"',
            all: true,
            replacement: {
                match: /(\(0,\i\.jsxs?\)\(\i\.DropdownMenuItem,\{)(?=onSelect:\i,children:\[\(0,\i\.jsx\)\("span",\{className:"inline-flex me-2 text-fg-secondary",children:\(0,\i\.jsx\)\(\i\.SignoutIcon)/,
                replace: '$self.renderItems("user"),$1',
            },
        },
    ],
});
