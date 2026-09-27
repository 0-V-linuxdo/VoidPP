/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { type ContextMenuLocationMap, MenuItem, MenuSub, MenuSubContent, MenuSubTrigger } from "@api/ContextMenus";
import { definePluginSettings } from "@api/Settings";
import {
    Button,
    ButtonWithTooltip,
    Input,
    Text,
    Textarea,
} from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { ScrollTextIcon } from "@components/icons";
import { React, useCallback, useState } from "@turbopack/common/react";
import { ChatPageStore } from "@turbopack/common/stores";
import { findByPropsLazy, findExportedComponentLazy } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { randomId } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

const cl = classNameFactory("void-ci-");

const PixelAvatarModule = findByPropsLazy("PixelAvatar");
const CheckIcon = findExportedComponentLazy("CheckIcon");
const BookIcon = findExportedComponentLazy("BookIcon");
const PenIcon = findExportedComponentLazy("PenIcon");
const TrashIcon = findExportedComponentLazy("TrashIcon");
const PlusIcon = findExportedComponentLazy("PlusIcon");

const MAX_LENGTH = 4000;

interface Preset {
    id: string;
    name: string;
    prompt: string;
}

interface PrivateSettings {
    presets: Preset[];
    assignments: Record<string, string>;
}

const settings = definePluginSettings({
    editor: {
        type: OptionType.COMPONENT,
        component: () => <PresetsEditor />,
    },
}).withPrivateSettings<PrivateSettings>();

function getPresets(): Preset[] {
    return settings.plain.presets ?? [];
}

function setPresets(presets: Preset[]) {
    settings.store.presets = presets;
}

function getAssignments(): Record<string, string> {
    return settings.plain.assignments ?? {};
}

function PresetCard({ preset, onEdit, onDelete }: { preset: Preset; onEdit: () => void; onDelete: () => void }) {
    return (
        <div role="button" className={cl("card")} onClick={onEdit}>
            <div className={cl("avatar")}>
                <PixelAvatarModule.PixelAvatar seed={preset.id} size={32} />
            </div>
            <div className={cl("card-name")}>
                <Text size="sm" weight="medium">{preset.name || "Untitled"}</Text>
            </div>
            <div className={cl("card-actions")}>
                <ButtonWithTooltip variant="tertiary" size="xs" shape="square" tooltipContent="Edit" onClick={e => { e.stopPropagation(); onEdit(); }}>
                    <PenIcon className="size-3.5 text-secondary" />
                </ButtonWithTooltip>
                <ButtonWithTooltip variant="tertiary" size="xs" shape="square" tooltipContent="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}>
                    <TrashIcon className="size-3.5 text-secondary" />
                </ButtonWithTooltip>
            </div>
        </div>
    );
}

function PresetEditor({ preset, onUpdate, onClose }: { preset: Preset; onUpdate: (p: Preset) => void; onClose: () => void }) {
    const overLimit = preset.prompt.length > MAX_LENGTH;

    return (
        <div className={cl("editor")}>
            <Text size="sm" weight="medium" className={cl("label")}>Name</Text>
            <Input
                type="text"
                className={cl("input")}
                placeholder="Preset name"
                value={preset.name}
                onChange={e => onUpdate({ ...preset, name: e.target.value })}
                autoComplete="off"
            />
            <Text size="sm" weight="medium" className={cl("label")}>Instructions</Text>
            <div className={cl("textarea-wrap", { "textarea-wrap-error": overLimit })}>
                <Textarea
                    className={cl("textarea")}
                    placeholder="How should Grok behave?"
                    value={preset.prompt}
                    onChange={e => onUpdate({ ...preset, prompt: e.target.value })}
                />
            </div>
            <div className={cl("editor-footer")}>
                <Text size="xs" color={overLimit ? undefined : "muted"} className={overLimit ? cl("error-text") : undefined}>
                    {preset.prompt.length}/{MAX_LENGTH}
                </Text>
                <Button variant="secondary" size="sm" shape="rectangle" onClick={onClose}>
                    Done
                </Button>
            </div>
        </div>
    );
}

function PresetsEditor() {
    const presets = settings.use(["presets"]).presets ?? [];
    const [editingId, setEditingId] = useState<string | null>(null);

    const updatePreset = useCallback((updated: Preset) => {
        setPresets(getPresets().map(p => p.id === updated.id ? updated : p));
    }, []);

    const deletePreset = useCallback((id: string) => {
        setPresets(getPresets().filter(p => p.id !== id));
        const a = { ...getAssignments() };
        for (const [k, v] of Object.entries(a)) {
            if (v === id) delete a[k];
        }
        settings.store.assignments = a;
        setEditingId(prev => prev === id ? null : prev);
    }, []);

    const addPreset = useCallback(() => {
        const id = randomId();
        setPresets([...getPresets(), { id, name: "", prompt: "" }]);
        setEditingId(id);
    }, []);

    const editing = presets.find(p => p.id === editingId);

    return (
        <div className={cl("root")}>
            <div className={cl("grid")}>
                {presets.map(p => (
                    <PresetCard key={p.id} preset={p} onEdit={() => setEditingId(editingId === p.id ? null : p.id)} onDelete={() => deletePreset(p.id)} />
                ))}
                <div role="button" className={cl("card", "card-add")} onClick={addPreset}>
                    <PlusIcon className="size-4 text-secondary" />
                    <Text size="sm" weight="medium" color="muted">New</Text>
                </div>
            </div>
            {editing && (
                <PresetEditor preset={editing} onUpdate={updatePreset} onClose={() => setEditingId(null)} />
            )}
        </div>
    );
}

function InstructionsMenu({ conversationId }: ContextMenuLocationMap["conversation"]) {
    const presets = settings.use(["presets"]).presets ?? [];
    const assignments = settings.use(["assignments"]).assignments ?? {};
    const activePresetId = assignments[conversationId];

    const assign = useCallback((presetId?: string) => {
        const a = { ...getAssignments() };
        if (presetId) a[conversationId] = presetId;
        else delete a[conversationId];
        settings.store.assignments = a;
    }, [conversationId]);

    if (!presets.length) return null;

    return (
        <MenuSub>
            <MenuSubTrigger className={cl("trigger")}>
                <BookIcon size={16} /> Instructions
            </MenuSubTrigger>
            <MenuSubContent>
                <MenuItem onSelect={() => assign()} className={cl("menu-item")}>
                    <Text size="sm">None</Text>
                    {!activePresetId && <CheckIcon className="size-3.5 shrink-0" />}
                </MenuItem>
                {presets.map(p => (
                    <MenuItem key={p.id} onSelect={() => assign(p.id)} className={cl("menu-item")}>
                        <Text size="sm">{p.name || "Untitled"}</Text>
                        {activePresetId === p.id && <CheckIcon className="size-3.5 shrink-0" />}
                    </MenuItem>
                ))}
            </MenuSubContent>
        </MenuSub>
    );
}

export default definePlugin({
    name: "CustomInstructions",
    icon: ScrollTextIcon,
    description: "Create instruction presets and assign them to conversations.",
    authors: [Devs.Prism],
    tags: ["chats"],
    settings,

    contextMenuItems: {
        conversation: {
            label: "Instructions",
            render: ErrorBoundary.wrap(InstructionsMenu),
        },
    },

    _getPrompt() {
        const { conversationId } = ChatPageStore.useChatPageStore.getState();
        if (!conversationId) return;
        const presetId = getAssignments()[conversationId];
        if (!presetId) return;
        const preset = getPresets().find(p => p.id === presetId);
        return preset?.prompt?.trim() || undefined;
    },

    patches: [
        {
            find: ["customInstructions:e.customInstructions,customPersonality:e.customPersonality"],
            all: true,
            replacement: {
                match: /customInstructions:(\i)\.customInstructions/g,
                replace: "customInstructions:$1.customInstructions||$self._getPrompt()",
            },
        },
    ],
});
