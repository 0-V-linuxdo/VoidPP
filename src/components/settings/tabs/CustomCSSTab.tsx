/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./CustomCSSTab.css";

import { getSettingsPluginData, updateSettingsPluginData } from "@api/Settings";
import { Flex, SettingsDescription, SettingsRow, SettingsTitle, Switch } from "@components";
import { React, useCallback, useState } from "@turbopack/common/react";
import { classes, classNameFactory, disableStyle, enableStyle, registerStyle } from "@utils/css";

import { CssEditor } from "../CssEditor";

const cl = classNameFactory("void-css-");
const STYLE_ID = "void-custom-css";

function setCustomCSSEnabled(enabled: boolean) {
    updateSettingsPluginData({ customCSSEnabled: enabled });
    if (!enabled) return disableStyle(STYLE_ID);
    const css = getSettingsPluginData().customCSS;
    if (typeof css === "string" && css) {
        registerStyle(STYLE_ID, css);
        enableStyle(STYLE_ID);
    }
}

export function loadSavedCSS(): string {
    const { customCSS: saved, customCSSEnabled } = getSettingsPluginData();
    if (typeof saved === "string" && saved && customCSSEnabled !== false) {
        registerStyle(STYLE_ID, saved);
    }
    return typeof saved === "string" ? saved : "";
}

export default function CustomCSSTab() {
    const [enabled, setEnabled] = useState(() => getSettingsPluginData().customCSSEnabled !== false);
    const [css, setCss] = useState(loadSavedCSS);

    const apply = useCallback((val: string) => {
        setCss(val);
        updateSettingsPluginData({ customCSS: val });
        if (getSettingsPluginData().customCSSEnabled !== false) registerStyle(STYLE_ID, val);
    }, []);

    const handleToggle = (checked: boolean) => {
        setEnabled(checked);
        setCustomCSSEnabled(checked);
    };

    return (
        <Flex flexDirection="column" gap="1rem" className={classes(cl("root"), "void-tab-root")}>
            <SettingsRow action={<Switch checked={enabled} onCheckedChange={handleToggle} />}>
                <Flex flexDirection="column" gap="0">
                    <SettingsTitle>Enable Quick CSS</SettingsTitle>
                    <SettingsDescription>
                        Write CSS that applies instantly as you type. Stored only on this device. Disable to keep your code without applying it.
                    </SettingsDescription>
                </Flex>
            </SettingsRow>
            <CssEditor value={css} onChange={apply} disabled={!enabled} placeholder="Paste your CSS here..." />
        </Flex>
    );
}
