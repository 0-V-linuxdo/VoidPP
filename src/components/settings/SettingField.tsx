/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./SettingField.css";

import { dispatch } from "@api/Events";
import { mergePluginSettings, pluginPath, resolveDefault, Settings, SettingsStore } from "@api/Settings";
import { Flex, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SettingsDescription, SettingsRow, SettingsTitle, Switch, Text } from "@components";
import { React, useCallback, useEffect, useMemo, useState } from "@turbopack/common/react";
import { classNameFactory } from "@utils/css";
import { humanizeKey } from "@utils/text";
import { OptionType, type PluginSettingBigIntDef, type PluginSettingBooleanDef, type PluginSettingCommon, type PluginSettingComponentDef, type PluginSettingDef, type PluginSettingNumberDef, type PluginSettingSelectDef, type PluginSettingSliderDef, type PluginSettingStringDef, type PluginSettingValue } from "@utils/types";

import { type InputChangeEvent } from "./utils";

const cl = classNameFactory("void-setting-");

interface SettingFieldProps<S extends PluginSettingDef = PluginSettingDef> {
    id: string;
    setting: S;
    pluginName: string;
}

type Field<S extends PluginSettingDef> = (props: SettingFieldProps<S>) => React.ReactNode;

function usePluginSetting(pluginName: string, id: string, setting: PluginSettingDef) {
    const resolve = () => (Settings.plugins[pluginName] ?? {})[id] ?? resolveDefault(setting);
    const [value, setValue] = useState(resolve);

    useEffect(() => {
        const path = pluginPath(pluginName, id);
        const listener = () => setValue(resolve());
        SettingsStore.addChangeListener(path, listener);
        return () => SettingsStore.removeChangeListener(path, listener);
    }, [pluginName, id]);

    const update = useCallback(
        (val: PluginSettingValue) => {
            setValue(val);
            mergePluginSettings(pluginName, { [id]: val });
            setting.onChange?.(val);
            if (setting.restartNeeded) dispatch("reloadNeeded");
        },
        [id, pluginName, setting],
    );

    return [value, update] as const;
}

function SettingLabel({ id, setting }: { id: string; setting: Partial<Pick<PluginSettingCommon, "description">> }) {
    return (
        <Flex flexDirection="column" gap="0">
            <SettingsTitle>{humanizeKey(id)}</SettingsTitle>
            {setting.description && <SettingsDescription>{setting.description}</SettingsDescription>}
        </Flex>
    );
}

function LabeledField({ id, setting, children }: { id: string; setting: Partial<Pick<PluginSettingCommon, "description">>; children: React.ReactNode }) {
    return (
        <Flex flexDirection="column" gap="0.5rem">
            <SettingLabel id={id} setting={setting} />
            {children}
        </Flex>
    );
}

const BooleanField: Field<PluginSettingBooleanDef & PluginSettingCommon> = ({ id, setting, pluginName }) => {
    const [value, update] = usePluginSetting(pluginName, id, setting);
    return (
        <SettingsRow action={<Switch checked={!!value} onCheckedChange={update} />}>
            <SettingLabel id={id} setting={setting} />
        </SettingsRow>
    );
};

const SelectField: Field<PluginSettingSelectDef & PluginSettingCommon> = ({ id, setting, pluginName }) => {
    const [value, update] = usePluginSetting(pluginName, id, setting);
    const { options } = setting;
    const valueMap = useMemo(() => new Map(options.map(o => [String(o.value), o.value])), [options]);

    return (
        <SettingsRow action={
            <Select value={String(value ?? "")} onValueChange={(v: string) => update(valueMap.get(v) ?? v)}>
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className={cl("select-content")}>
                    {options.map(o => (
                        <SelectItem key={String(o.value)} value={String(o.value)}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        }>
            <SettingLabel id={id} setting={setting} />
        </SettingsRow>
    );
};

const SliderField: Field<PluginSettingSliderDef & PluginSettingCommon> = ({ id, setting, pluginName }) => {
    const [value, update] = usePluginSetting(pluginName, id, setting);
    const { min, max } = setting;
    const n = typeof value === "number" ? value : min;
    const pct = max === min ? 100 : ((n - min) / (max - min)) * 100;

    return (
        <LabeledField id={id} setting={setting}>
            <Flex gap="0.75rem" className={cl("slider-row")}>
                <div className={cl("slider-wrap")}>
                    <div className={cl("slider-rail")} aria-hidden="true">
                        <div className={cl("slider-fill")} style={{ width: `${pct}%` }} />
                        <div className={cl("slider-thumb")} style={{ left: `${pct}%` }} />
                    </div>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        step={1}
                        value={n}
                        onChange={(e: InputChangeEvent) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v)) update(v);
                        }}
                        className={cl("slider")}
                        aria-valuemin={min}
                        aria-valuemax={max}
                        aria-valuenow={n}
                    />
                </div>
                <Text size="sm" color="secondary" className={cl("slider-value")}>{n}</Text>
            </Flex>
        </LabeledField>
    );
};

const ComponentField: Field<PluginSettingComponentDef> = ({ setting, pluginName }) => {
    const [, update] = usePluginSetting(pluginName, "component", setting);
    const Comp = setting.component;
    return <Comp setValue={update} option={setting} />;
};

const NumberField: Field<PluginSettingNumberDef & PluginSettingCommon> = ({ id, setting, pluginName }) => {
    const [value, update] = usePluginSetting(pluginName, id, setting);
    return (
        <LabeledField id={id} setting={setting}>
            <Input
                type="number"
                value={String(value ?? "")}
                onChange={(e: InputChangeEvent) => {
                    const n = Number(e.target.value);
                    if (!isNaN(n)) update(n);
                }}
                className={cl("number-input")}
            />
        </LabeledField>
    );
};

const BigIntField: Field<PluginSettingBigIntDef & PluginSettingCommon> = ({ id, setting, pluginName }) => {
    const [value, update] = usePluginSetting(pluginName, id, setting);
    return (
        <LabeledField id={id} setting={setting}>
            <Input
                type="text"
                inputMode="numeric"
                value={String(value ?? "")}
                onChange={(e: InputChangeEvent) => {
                    const raw = e.target.value.trim();
                    if (!raw) return update(0n);
                    try { update(BigInt(raw)); } catch {}
                }}
                className={cl("number-input")}
            />
        </LabeledField>
    );
};

const StringField: Field<PluginSettingStringDef & PluginSettingCommon> = ({ id, setting, pluginName }) => {
    const [value, update] = usePluginSetting(pluginName, id, setting);
    return (
        <LabeledField id={id} setting={setting}>
            <Input
                type="text"
                value={String(value ?? "")}
                onChange={(e: InputChangeEvent) => update(e.target.value)}
                placeholder={setting.placeholder}
                className={cl("string-input")}
            />
        </LabeledField>
    );
};

const FIELD_MAP = {
    [OptionType.BOOLEAN]: BooleanField,
    [OptionType.SELECT]: SelectField,
    [OptionType.SLIDER]: SliderField,
    [OptionType.COMPONENT]: ComponentField,
    [OptionType.NUMBER]: NumberField,
    [OptionType.BIGINT]: BigIntField,
    [OptionType.STRING]: StringField,
    [OptionType.CUSTOM]: null,
} as const satisfies Record<OptionType, Field<never> | null>;

export default function SettingField({ id, setting, pluginName }: SettingFieldProps) {
    const Field = FIELD_MAP[setting.type] as Field<PluginSettingDef> | null;
    if (!Field) return null;
    return <Field id={id} setting={setting} pluginName={pluginName} />;
}
