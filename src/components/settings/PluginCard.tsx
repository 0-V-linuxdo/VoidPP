/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./PluginCard.css";

import { dispatch } from "@api/Events";
import { isNewPlugin, isPluginEnabled, plugins, togglePlugin } from "@api/PluginManager";
import { isPluginPinned, isPluginStarred, togglePluginPinned, togglePluginStarred } from "@api/Settings";
import { Badge, SettingsSwitch, Tooltip, TooltipContent, TooltipTrigger } from "@components";
import { CircleAlertIcon, PinFilledIcon, PinIcon, Settings2Icon, StarFilledIcon, StarIcon, TriangleAlert, UnplugIcon } from "@components/icons";
import { React } from "@turbopack/common/react";
import { classes, classNameFactory } from "@utils/css";
import { useForceUpdater } from "@utils/react";

import BaseCard from "./BaseCard";
import { IconButton } from "./IconButton";
import { PluginBadges, TooltipIcon } from "./pluginBadges";
import { hasVisibleSettings } from "./utils";

const cl = classNameFactory("void-plugin-card-");

interface PluginCardProps {
    name: string;
    onSettings(name: string): void;
    onReload(pluginName: string): void;
}

export default function PluginCard({ name, onSettings, onReload }: PluginCardProps) {
    const plugin = plugins[name];
    const { icon: Icon } = plugin;
    const forceUpdate = useForceUpdater();
    const enabled = isPluginEnabled(name);
    const pinned = isPluginPinned(name);
    const starred = isPluginStarred(name);
    const crashed = enabled && !plugin.started && !plugin.required;

    const handleToggle = () => {
        const needsReload = togglePlugin(name);
        forceUpdate();
        if (needsReload) onReload(name);
    };

    const handlePin = () => {
        togglePluginPinned(name);
        forceUpdate();
        dispatch("pluginPin");
    };

    const handleStar = () => {
        togglePluginStarred(name);
        forceUpdate();
        dispatch("pluginStar");
    };

    return (
        <BaseCard
            className={classes(plugin.required && cl("required"), crashed && cl("crashed"))}
            name={name}
            icon={Icon ? <Icon size={14} /> : <UnplugIcon size={14} />}
            badges={
                <>
                    {crashed && <TooltipIcon icon={TriangleAlert} tooltip="This plugin failed to start" className={cl("crashed-icon")} />}
                    {plugin.required && <TooltipIcon icon={CircleAlertIcon} tooltip="This plugin is required for Void++ to work" className={cl("required-icon")} />}
                    <PluginBadges plugin={plugin} className={cl("badge")} />
                    {isNewPlugin(name) && <Badge variant="accent">New</Badge>}
                </>
            }
            description={plugin.description}
            controls={
                <>
                    <IconButton
                        icon={starred ? StarFilledIcon : StarIcon}
                        label={starred ? "Remove from favorites" : "Add to favorites"}
                        className={classes(cl("star"), starred && cl("star-active"))}
                        onClick={handleStar}
                    />
                    {!plugin.required && (
                        <IconButton
                            icon={pinned ? PinFilledIcon : PinIcon}
                            label={pinned ? "Unpin from top" : "Pin to top"}
                            className={classes(cl("pin"), pinned && cl("pin-active"))}
                            onClick={handlePin}
                        />
                    )}
                    {hasVisibleSettings(plugin) && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <IconButton
                                    icon={Settings2Icon}
                                    label="config"
                                    className={cl("settings")}
                                    onClick={() => onSettings(name)}
                                />
                            </TooltipTrigger>
                            <TooltipContent>config</TooltipContent>
                        </Tooltip>
                    )}
                    <SettingsSwitch checked={enabled} disabled={plugin.required} onCheckedChange={handleToggle} />
                </>
            }
            footer={<div className="void-card-author">{plugin.authors?.join(", ") || "\u00A0"}</div>}
        />
    );
}
