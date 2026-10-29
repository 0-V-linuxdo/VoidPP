/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonWithPopover, ButtonWithTooltip } from "@components";
import type { ButtonShape, ButtonSize, ButtonVariant } from "@grok-types";
import { React } from "@turbopack/common/react";
import { classes } from "@utils/css";
import type { ReactNode } from "react";

export interface ChatBarButtonProps {
    icon: ReactNode;
    tooltip?: ReactNode;
    popover?: ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    shape?: ButtonShape;
    disabled?: boolean;
    active?: boolean;
    "aria-label"?: string;
    className?: string;
}

const preventOpenFocus = (e: Event) => e.preventDefault();
const TOOLTIP_PROPS = { delayDuration: 100 } as const;
const TOOLTIP_CONTENT_PROPS = { side: "top", sideOffset: 8 } as const;
const POPOVER_PROPS = { modal: false } as const;
const POPOVER_CONTENT_PROPS = { side: "top", align: "center", onOpenAutoFocus: preventOpenFocus } as const;

export function ChatBarButton({
    icon,
    tooltip,
    popover,
    onClick,
    variant = "ghost",
    size = "xl",
    shape = "circle",
    disabled,
    active,
    className,
    "aria-label": ariaLabel,
}: ChatBarButtonProps) {
    const cls = classes(active && "bg-button-secondary-fill", className);
    const label = ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined);

    if (popover) {
        return (
            <ButtonWithPopover
                variant={variant}
                size={size}
                shape={shape}
                disabled={disabled}
                className={cls}
                popoverContent={popover}
                popoverProps={POPOVER_PROPS}
                popoverContentProps={POPOVER_CONTENT_PROPS}
                onClick={onClick}
                aria-label={label}
            >
                {icon}
            </ButtonWithPopover>
        );
    }

    return (
        <ButtonWithTooltip
            variant={variant}
            size={size}
            shape={shape}
            disabled={disabled}
            className={cls}
            tooltipContent={tooltip}
            tooltipProps={TOOLTIP_PROPS}
            tooltipContentProps={TOOLTIP_CONTENT_PROPS}
            onClick={onClick}
            aria-label={label}
        >
            {icon}
        </ButtonWithTooltip>
    );
}
