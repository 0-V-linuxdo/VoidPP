/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./Paragraph.css";

import { Tooltip, TooltipContent, TooltipTrigger } from "@turbopack/common/components";
import { React } from "@turbopack/common/react";
import { ClassNames } from "@turbopack/common/utils";
import type { HTMLAttributes, ReactNode } from "react";

import { Flex } from "./Flex";
import { InfoIcon } from "./icons";
import { Text, type TextColor } from "./Text";

export interface ParagraphProps extends HTMLAttributes<HTMLParagraphElement> {
    color?: TextColor;
    children?: ReactNode;
}

export function Paragraph({ color = "secondary", className, children, ...props }: ParagraphProps) {
    return (
        <Text as="p" size="xs" color={color} className={ClassNames.cn("text-pretty", className)} {...props}>
            {children}
        </Text>
    );
}

export function InfoHint({ children }: { children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="void-info-hint" aria-label={typeof children === "string" ? children : undefined}>
                    <InfoIcon size={16} />
                </span>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="void-info-hint-content">
                {children}
            </TooltipContent>
        </Tooltip>
    );
}

export function SectionHeader({ title, description, className }: { title: string; description?: string; className?: string }) {
    return (
        <Flex flexDirection="column" gap="0" className={ClassNames.cn("max-w-sm min-w-0", className)}>
            <Text size="sm" weight="medium">{title}</Text>
            {description && <Paragraph>{description}</Paragraph>}
        </Flex>
    );
}
