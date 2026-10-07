/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SettingsDescriptionProps, SettingsRowProps, SettingsTitleProps, SwitchProps } from "@grok-types";
import { classes, classNameFactory } from "@utils/css";
import type { ComponentType } from "react";

import { Switch } from "./components";
import { React } from "./react";

export interface SettingsPrimitives {
    SettingsTitle: ComponentType<SettingsTitleProps>;
    SettingsDescription: ComponentType<SettingsDescriptionProps>;
    SettingsRow: ComponentType<SettingsRowProps>;
    SettingsSwitch: ComponentType<SwitchProps>;
}

const cl = classNameFactory("void-settings-");

const captured: Partial<SettingsPrimitives> = {};

function FallbackTitle({ children, className }: SettingsTitleProps) {
    return React.createElement("div", { className: classes(cl("title"), className) }, children);
}

function FallbackDescription({ children }: SettingsDescriptionProps) {
    return React.createElement("div", { className: cl("description") }, children);
}

function FallbackRow({ children, action, hidden, className }: SettingsRowProps) {
    if (hidden) return null;
    return React.createElement(
        "div",
        { className: classes(cl("row"), className) },
        React.createElement("div", { className: cl("row-body") }, children),
        action ?? null,
    );
}

function FallbackSwitch(props: SwitchProps) {
    return React.createElement(Switch, { size: "sm", ...props });
}

const fallbacks = {
    SettingsTitle: FallbackTitle,
    SettingsDescription: FallbackDescription,
    SettingsRow: FallbackRow,
    SettingsSwitch: FallbackSwitch,
} satisfies SettingsPrimitives;

export function setSettingsPrimitive<K extends keyof SettingsPrimitives>(name: K, component: SettingsPrimitives[K]): void {
    captured[name] = component;
}

export const SettingsTitle: ComponentType<SettingsTitleProps> = props =>
    React.createElement(captured.SettingsTitle ?? fallbacks.SettingsTitle, props);

export const SettingsDescription: ComponentType<SettingsDescriptionProps> = props =>
    React.createElement(captured.SettingsDescription ?? fallbacks.SettingsDescription, props);

export const SettingsRow: ComponentType<SettingsRowProps> = props =>
    React.createElement(captured.SettingsRow ?? fallbacks.SettingsRow, props);

export const SettingsSwitch: ComponentType<SwitchProps> = props =>
    React.createElement(captured.SettingsSwitch ?? fallbacks.SettingsSwitch, props);
