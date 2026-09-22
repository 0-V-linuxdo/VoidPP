/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@turbopack/common/react";

export interface IconProps {
    size?: number | string;
    width?: number | string;
    height?: number | string;
    strokeWidth?: number;
    className?: string;
}

const svg = (props: IconProps, ...children: React.ReactNode[]) => (
    <svg
        width={props.width ?? props.size ?? "1em"}
        height={props.height ?? props.size ?? "1em"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={props.strokeWidth ?? 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={props.className}
        aria-hidden="true"
    >
        {children}
    </svg>
);

const filledSvg = (props: IconProps, viewBox: string, ...children: React.ReactNode[]) => (
    <svg
        width={props.width ?? props.size ?? "1em"}
        height={props.height ?? props.size ?? "1em"}
        viewBox={viewBox}
        fill="currentColor"
        className={props.className}
        aria-hidden="true"
    >
        {children}
    </svg>
);

export const BracesIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />,
        <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />,
    );

export const CopyIcon = (props: IconProps = {}) =>
    svg(props,
        <rect x="3" y="8" width="13" height="13" rx="4" stroke="currentColor" />,
        <path fillRule="evenodd" clipRule="evenodd" d="M13 2.00004L12.8842 2.00002C12.0666 1.99982 11.5094 1.99968 11.0246 2.09611C9.92585 2.31466 8.95982 2.88816 8.25008 3.69274C7.90896 4.07944 7.62676 4.51983 7.41722 5.00004H9.76392C10.189 4.52493 10.7628 4.18736 11.4147 4.05768C11.6802 4.00488 12.0228 4.00004 13 4.00004H14.6C15.7366 4.00004 16.5289 4.00081 17.1458 4.05121C17.7509 4.10066 18.0986 4.19283 18.362 4.32702C18.9265 4.61464 19.3854 5.07358 19.673 5.63807C19.8072 5.90142 19.8994 6.24911 19.9488 6.85428C19.9992 7.47112 20 8.26343 20 9.40004V11C20 11.9773 19.9952 12.3199 19.9424 12.5853C19.8127 13.2373 19.4748 13.8114 19 14.2361V16.5829C20.4795 15.9374 21.5804 14.602 21.9039 12.9755C22.0004 12.4907 22.0002 11.9334 22 11.1158L22 11V9.40004V9.35725C22 8.27346 22 7.3993 21.9422 6.69141C21.8826 5.96256 21.7568 5.32238 21.455 4.73008C20.9757 3.78927 20.2108 3.02437 19.27 2.545C18.6777 2.24322 18.0375 2.1174 17.3086 2.05785C16.6007 2.00002 15.7266 2.00003 14.6428 2.00004L14.6 2.00004H13Z" fill="currentColor" />,
    );

export const ChromiumIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M10.88 21.94 15.46 14" />,
        <path d="M21.17 8H12" />,
        <path d="M3.95 6.06 8.54 14" />,
        <circle cx="12" cy="12" r="10" />,
        <circle cx="12" cy="12" r="4" />,
    );

export const CircleAlertIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="10" />,
        <line x1="12" x2="12" y1="8" y2="12" />,
        <line x1="12" x2="12.01" y1="16" y2="16" />,
    );

export const InfoIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="10" />,
        <path d="M12 16v-4" />,
        <path d="M12 8h.01" />,
    );

export const PaletteIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />,
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />,
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />,
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />,
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />,
    );

export const TrashIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />,
        <path d="M3 6h18" />,
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
    );

export const Trash2Icon = (props: IconProps = {}) =>
    svg(props,
        <path d="M10 11v6" />,
        <path d="M14 11v6" />,
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />,
        <path d="M3 6h18" />,
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
    );

export const TestTubeIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3" />,
        <path d="m16 2 6 6" />,
        <path d="M12 16H4" />,
    );

export const TelescopeIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44" />,
        <path d="m13.56 11.747 4.332-.924" />,
        <path d="m16 21-3.105-6.21" />,
        <path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z" />,
        <path d="m6.158 8.633 1.114 4.456" />,
        <path d="m8 21 3.105-6.21" />,
        <circle cx="12" cy="13" r="2" />,
    );

export const DownloadIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
        <polyline points="7 10 12 15 17 10" />,
        <line x1="12" x2="12" y1="15" y2="3" />,
    );

export const UnplugIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m19 5 3-3" />,
        <path d="m2 22 3-3" />,
        <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />,
        <path d="M7.5 13.5 10 11" />,
        <path d="M10.5 16.5 13 14" />,
        <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" />,
    );

export const Cross2Icon = (props: IconProps = {}) =>
    filledSvg(props, "0 0 15 15",
        <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />,
    );

export const EllipsisVertical = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="1" />,
        <circle cx="12" cy="5" r="1" />,
        <circle cx="12" cy="19" r="1" />,
    );

export const EllipsisHorizontal = (props: IconProps = {}) =>
    svg(props,
        <circle cx="5" cy="12" r="1" />,
        <circle cx="12" cy="12" r="1" />,
        <circle cx="19" cy="12" r="1" />,
    );

export const GripVerticalIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="9" cy="12" r="1" />,
        <circle cx="9" cy="5" r="1" />,
        <circle cx="9" cy="19" r="1" />,
        <circle cx="15" cy="12" r="1" />,
        <circle cx="15" cy="5" r="1" />,
        <circle cx="15" cy="19" r="1" />,
    );

export const PinIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 17v5" />,
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />,
    );

export const PinFilledIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 17v5" />,
        <path fill="currentColor" d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />,
    );

export const StarIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />,
    );

export const StarFilledIcon = (props: IconProps = {}) =>
    svg(props,
        <path fill="currentColor" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />,
    );

export const GhostFilledIcon = (props: IconProps = {}) =>
    filledSvg(props, "0 0 24 24",
        <path fillRule="evenodd" clipRule="evenodd" d="M12 3C9.86974 3 8.36758 3.44687 7.30331 4.30861C6.24544 5.16518 5.77303 6.31294 5.44931 7.34656C5.34315 7.68552 5.24989 8.01119 5.16061 8.32293C4.67184 10.0297 4.3026 11.3191 2.59045 12.0877L2 12.3528V13C2 13.5638 2.1227 14.0439 2.36548 14.4568C2.59992 14.8555 2.9079 15.1234 3.14945 15.3133C3.24924 15.3917 3.33688 15.4587 3.41432 15.5178L3.41445 15.5179C3.75134 15.7753 3.89523 15.8852 4.00625 16.153C4.02083 16.1882 4.05258 16.3202 4.01681 16.6105C3.98277 16.8867 3.89932 17.2176 3.78078 17.5898C3.67031 17.9367 3.54072 18.2855 3.41195 18.6321L3.38617 18.7015C3.25634 19.0512 3.11722 19.4276 3.03341 19.7437L2.70025 21H7.87689L12 22.0308L16.1231 21H21.3378L20.9591 19.7169C20.8577 19.3732 20.7296 19.016 20.6096 18.6814L20.6 18.6547C20.4736 18.302 20.3539 17.9667 20.2541 17.6336C20.0498 16.9516 19.971 16.4061 20.0567 15.9647C20.0994 15.7444 20.1593 15.7043 20.6831 15.3528L20.697 15.3435C20.9367 15.1826 21.2889 14.9346 21.5621 14.5365C21.8517 14.1145 22 13.6069 22 13V12.3528L21.4095 12.0877C19.6974 11.3191 19.3282 10.0297 18.8394 8.32294L18.8392 8.32236C18.75 8.01083 18.6568 7.68526 18.5507 7.34656C18.227 6.31294 17.7546 5.16518 16.6967 4.30861C15.6324 3.44687 14.1303 3 12 3ZM11 10.625C11 11.7986 10.3284 12.75 9.5 12.75C8.67157 12.75 8 11.7986 8 10.625C8 9.4514 8.67157 8.5 9.5 8.5C10.3284 8.5 11 9.4514 11 10.625ZM14.5 12.75C15.3284 12.75 16 11.7986 16 10.625C16 9.4514 15.3284 8.5 14.5 8.5C13.6716 8.5 13 9.4514 13 10.625C13 11.7986 13.6716 12.75 14.5 12.75Z" />,
    );

export const TriangleAlert = (props: IconProps = {}) =>
    svg(props,
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />,
        <path d="M12 9v4" />,
        <path d="M12 17h.01" />,
    );

export const ScalingIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />,
        <path d="M14 15H9v-5" />,
        <path d="M16 3h5v5" />,
        <path d="M21 3 9 15" />,
    );

export const PencilIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />,
        <path d="m15 5 4 4" />,
    );

export const GlobeIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="10" />,
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />,
        <path d="M2 12h20" />,
    );

export const CircleXIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="10" />,
        <path d="m15 9-6 6" />,
        <path d="m9 9 6 6" />,
    );

export const CircleCheckIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="10" />,
        <path d="m9 12 2 2 4-4" />,
    );

export const FolderIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
    );

export const ClockAlertIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 6v6l4 2" />,
        <path d="M20 12v5" />,
        <path d="M20 21h.01" />,
        <path d="M21.25 8.2A10 10 0 1 0 16 21.16" />,
    );

export const CircleGaugeIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M15.6 2.7a10 10 0 1 0 5.7 5.7" />,
        <circle cx="12" cy="12" r="2" />,
        <path d="M13.4 10.6 19 5" />,
    );

export const LoaderCircleIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
    );

export const ChevronsDownUpIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m7 20 5-5 5 5" />,
        <path d="m7 4 5 5 5-5" />,
    );

export const RotateCcwIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />,
        <path d="M3 3v5h5" />,
    );

export const AppWindowIcon = (props: IconProps = {}) =>
    svg(props,
        <rect x="2" y="4" width="20" height="16" rx="2" />,
        <path d="M10 4v4" />,
        <path d="M2 8h20" />,
        <path d="M6 4v4" />,
    );

export const BrushCleaningIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m16 22-1-4" />,
        <path d="M19 13.99a1 1 0 0 0 1-1V12a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v.99a1 1 0 0 0 1 1" />,
        <path d="M5 14h14l1.973 6.767A1 1 0 0 1 20 22H4a1 1 0 0 1-.973-1.233z" />,
        <path d="m8 22 1-4" />,
    );

export const BlendIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="9" cy="9" r="7" />,
        <circle cx="15" cy="15" r="7" />,
    );

export const TerminalIcon = (props: IconProps = {}) =>
    svg(props,
        <polyline points="4 17 10 11 4 5" />,
        <line x1="12" x2="20" y1="19" y2="19" />,
    );

export const CableIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1" />,
        <path d="M19 15V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V9" />,
        <path d="M21 21v-2h-4" />,
        <path d="M3 5h4V3" />,
        <path d="M7 5a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1V3" />,
    );

export const MicOffIcon = (props: IconProps = {}) =>
    svg(props,
        <line x1="2" x2="22" y1="2" y2="22" />,
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />,
        <path d="M5 10v2a7 7 0 0 0 12 5" />,
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />,
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />,
        <line x1="12" x2="12" y1="19" y2="22" />,
    );

export const BotOffIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M13.67 8H18a2 2 0 0 1 2 2v4.33" />,
        <path d="M2 14h2" />,
        <path d="M20 14h2" />,
        <path d="M22 22 2 2" />,
        <path d="M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586" />,
        <path d="M9 13v2" />,
        <path d="M9.67 4H12v2.33" />,
    );

export const PlusIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M5 12h14" />,
        <path d="M12 5v14" />,
    );

export const Link2OffIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M9 17H7A5 5 0 0 1 7 7" />,
        <path d="M15 7h2a5 5 0 0 1 4 8" />,
        <line x1="8" x2="12" y1="12" y2="12" />,
        <line x1="2" x2="22" y1="2" y2="22" />,
    );

export const UserRoundXIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M2 21a8 8 0 0 1 11.873-7" />,
        <circle cx="10" cy="8" r="5" />,
        <path d="m17 17 5 5" />,
        <path d="m22 17-5 5" />,
    );

export const UserRoundPenIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M2 21a8 8 0 0 1 10.821-7.487" />,
        <path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />,
        <circle cx="10" cy="8" r="5" />,
    );

export const CatIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z" />,
        <path d="M8 14v.5" />,
        <path d="M16 14v.5" />,
        <path d="M11.25 16.25h1.5L12 17l-.75-.75Z" />,
    );

export const BellIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />,
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />,
    );

export const EyeOffIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />,
        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />,
        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />,
        <path d="m2 2 20 20" />,
    );

export const UnfoldHorizontalIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M16 12h6" />,
        <path d="M8 12H2" />,
        <path d="M12 2v2" />,
        <path d="M12 8v2" />,
        <path d="M12 14v2" />,
        <path d="M12 20v2" />,
        <path d="m19 15 3-3-3-3" />,
        <path d="m5 9-3 3 3 3" />,
    );

export const UsersRoundIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M18 21a8 8 0 0 0-16 0" />,
        <circle cx="10" cy="8" r="5" />,
        <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />,
    );

export const FilesIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M20 7h-3a2 2 0 0 1-2-2V2" />,
        <path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z" />,
        <path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8" />,
    );

export const ImagesIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M18 22H4a2 2 0 0 1-2-2V6" />,
        <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" />,
        <circle cx="12" cy="8" r="2" />,
        <rect width="16" height="16" x="6" y="2" rx="2" />,
    );

export const LinkIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />,
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
    );

export const PanelLeftIcon = (props: IconProps = {}) =>
    svg(props,
        <rect width="18" height="18" x="3" y="3" rx="2" />,
        <path d="M9 3v18" />,
    );

export const FrameIcon = (props: IconProps = {}) =>
    svg(props,
        <line x1="22" x2="2" y1="6" y2="6" />,
        <line x1="22" x2="2" y1="18" y2="18" />,
        <line x1="6" x2="6" y1="2" y2="22" />,
        <line x1="18" x2="18" y1="2" y2="22" />,
    );

export const ScrollTextIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M15 12h-5" />,
        <path d="M15 8h-5" />,
        <path d="M19 17V5a2 2 0 0 0-2-2H4" />,
        <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />,
    );

export const Volume2Icon = (props: IconProps = {}) =>
    svg(props,
        <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />,
        <path d="M16 9a5 5 0 0 1 0 6" />,
        <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />,
    );

export const FileDownIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />,
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />,
        <path d="M12 18v-6" />,
        <path d="m9 15 3 3 3-3" />,
    );

export const ChevronLeftIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m15 18-6-6 6-6" />,
    );

export const ChevronRightIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m9 18 6-6-6-6" />,
    );

export const ChevronUpIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m18 15-6-6-6 6" />,
    );

export const ChevronDownIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m6 9 6 6 6-6" />,
    );

export const HistoryIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />,
        <path d="M3 3v5h5" />,
        <path d="M12 7v5l4 2" />,
    );

export const ClockIcon = (props: IconProps = {}) =>
    svg(props,
        <circle cx="12" cy="12" r="10" />,
        <polyline points="12 6 12 12 16 14" />,
    );

export const TextCursorInputIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6" />,
        <path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7" />,
        <path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1" />,
        <path d="M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1" />,
        <path d="M9 6v12" />,
    );

export const LayoutGridIcon = (props: IconProps = {}) =>
    svg(props,
        <rect width="7" height="7" x="3" y="3" rx="1" />,
        <rect width="7" height="7" x="14" y="3" rx="1" />,
        <rect width="7" height="7" x="14" y="14" rx="1" />,
        <rect width="7" height="7" x="3" y="14" rx="1" />,
    );

export const GrokConnectorsIcon = (props: IconProps = {}) =>
    filledSvg(props, "0 0 24 24",
        <path fillRule="evenodd" clipRule="evenodd" d="M12 12H19V16C19 16.6836 19.0011 17.2566 18.9629 17.7236C18.9238 18.2023 18.8382 18.6571 18.6182 19.0889C18.2826 19.7474 17.7474 20.2826 17.0889 20.6182C16.6571 20.8382 16.2023 20.9238 15.7236 20.9629C15.2566 21.0011 14.6836 21 14 21H8C7.31644 21 6.74342 21.0011 6.27637 20.9629C5.79772 20.9238 5.34294 20.8382 4.91114 20.6182C4.25262 20.2826 3.71739 19.7474 3.38184 19.0889C3.16183 18.6571 3.07623 18.2023 3.03711 17.7236C2.99895 17.2566 3 16.6836 3 16V10C3 9.31644 2.99895 8.74342 3.03711 8.27637C3.07623 7.79772 3.16182 7.34294 3.38184 6.91114C3.71739 6.25262 4.25262 5.71739 4.91114 5.38184C5.34294 5.16182 5.79772 5.07623 6.27637 5.03711C6.74342 4.99895 7.31644 5 8 5H12V12ZM5 16C5 16.7165 5.00032 17.1938 5.03028 17.5605C5.05924 17.9151 5.11072 18.0777 5.16309 18.1807C5.3069 18.4629 5.5371 18.6931 5.81934 18.8369C5.92228 18.8893 6.0849 18.9408 6.43946 18.9697C6.80616 18.9997 7.28347 19 8 19H10V14H5V16ZM12 19H14C14.7165 19 15.1938 18.9997 15.5605 18.9697C15.9151 18.9408 16.0777 18.8893 16.1807 18.8369C16.4629 18.6931 16.6931 18.4629 16.8369 18.1807C16.8893 18.0777 16.9408 17.9151 16.9697 17.5605C16.9997 17.1938 17 16.7165 17 16V14H12V19ZM8 7C7.28347 7 6.80616 7.00032 6.43946 7.03028C6.0849 7.05924 5.92228 7.11072 5.81934 7.16309C5.5371 7.3069 5.3069 7.5371 5.16309 7.81934C5.11072 7.92228 5.05924 8.0849 5.03028 8.43946C5.00032 8.80616 5 9.28347 5 10V12H10V7H8Z" />,
        <path fillRule="evenodd" clipRule="evenodd" d="M17 2C17.6836 2 18.2566 1.99895 18.7236 2.03711C19.2023 2.07623 19.6571 2.16183 20.0889 2.38184C20.7474 2.71739 21.2826 3.25262 21.6182 3.91114C21.8382 4.34294 21.9238 4.79772 21.9629 5.27637C22.0011 5.74342 22 6.31644 22 7V10H14V2H17ZM16 8H20V7C20 6.28347 19.9997 5.80616 19.9697 5.43946C19.9408 5.0849 19.8893 4.92228 19.8369 4.81934C19.6931 4.5371 19.4629 4.3069 19.1807 4.16309C19.0777 4.11072 18.9151 4.05924 18.5605 4.03028C18.1938 4.00032 17.7165 4 17 4H16V8Z" />,
    );

export const ConnectedAppsIcon = (props: IconProps = {}) =>
    svg(props,
        <rect x="4" y="4" width="5" height="5" />,
        <rect x="15" y="4" width="5" height="5" />,
        <rect x="15" y="15" width="5" height="5" />,
        <path d="M11 18H10C7.79086 18 6 16.2091 6 14V13" />,
    );

export const AutoModeIcon = (props: IconProps = {}) =>
    svg(props,
        <path strokeLinecap="square" d="M6.5 12.5L11.5 17.5M6.5 12.5L11.8349 6.83172C13.5356 5.02464 15.9071 4 18.3887 4H20V5.61135C20 8.09292 18.9754 10.4644 17.1683 12.1651L11.5 17.5M6.5 12.5L2 11L5.12132 7.87868C5.68393 7.31607 6.44699 7 7.24264 7H11M11.5 17.5L13 22L16.1213 18.8787C16.6839 18.3161 17 17.553 17 16.7574V13" />,
        <path d="M4.5 16.5C4.5 16.5 4 18 4 20C6 20 7.5 19.5 7.5 19.5" />,
    );

export const FastModeIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M5 14.25L14 4L13 9.75H19L10 20L11 14.25H5Z" />,
    );

export const BuildModeIcon = (props: IconProps = {}) =>
    filledSvg(props, "0 0 24 24",
        <path fillRule="evenodd" d="M6.55273 4.60517C9.30778 1.96643 12.7289 1.47144 16.748 2.49872L19.1709 3.11787L16.9883 4.34052C16.0286 4.87786 15.0421 5.85039 14.5645 6.87763C14.3308 7.38043 14.2396 7.85117 14.2852 8.26728C14.3289 8.6664 14.5051 9.08437 14.9307 9.50068L20.5068 14.9548C22.0873 16.3103 22.1844 18.7292 20.707 20.2067C19.2281 21.6857 16.8059 21.5867 15.4512 20.0017C15.4468 19.9971 15.4413 19.9919 15.4355 19.986C15.4119 19.9617 15.3773 19.9252 15.332 19.8786C15.2412 19.7851 15.1086 19.6485 14.9424 19.4772C14.6098 19.1346 14.1405 18.653 13.5977 18.0944C12.5116 16.9769 11.1275 15.5535 9.93457 14.3317C9.65277 14.0434 9.32401 13.9826 9.07031 14.0456C8.82894 14.1056 8.57482 14.2967 8.46875 14.7136L8.40137 14.9802L6.5 16.8815L1.08594 11.4675L3.08594 9.46747H3.5C3.84716 9.46747 3.9785 9.37185 4.0752 9.26728C4.22615 9.1039 4.36795 8.82197 4.55371 8.30732C4.8865 7.38517 5.29734 5.80772 6.55273 4.60517ZM11.668 13.2448C12.789 14.3937 14.0363 15.6752 15.0322 16.6999C15.5754 17.2588 16.0441 17.7419 16.377 18.0847C16.5432 18.2559 16.6757 18.3924 16.7666 18.486C16.812 18.5328 16.8474 18.569 16.8711 18.5935C16.8826 18.6053 16.8914 18.6146 16.8975 18.6208C16.9004 18.6238 16.9028 18.627 16.9043 18.6286L16.9062 18.6296L16.9072 18.6306L16.9336 18.6579L16.957 18.6862C17.5529 19.4013 18.6348 19.4509 19.293 18.7927C19.951 18.1345 19.9016 17.0526 19.1865 16.4567L19.1562 16.4313L19.1279 16.404L13.7598 11.153L11.668 13.2448ZM14.1406 4.05244C11.6131 3.80062 9.61076 4.44487 7.93555 6.04951C7.10476 6.84532 6.84901 7.83879 6.43457 8.98701C6.24676 9.5073 5.99495 10.1367 5.54395 10.6247C5.12935 11.0732 4.597 11.349 3.94531 11.4352L3.91406 11.4675L6.5 14.0534L6.61914 13.9333C6.95792 12.978 7.6995 12.326 8.58789 12.1052C9.04163 11.9924 9.51491 11.9981 9.96875 12.1159L12.5625 9.52216C12.4239 9.18685 12.3357 8.83958 12.2969 8.48505C12.2019 7.6178 12.4054 6.77723 12.751 6.03388C13.0875 5.31006 13.578 4.63529 14.1406 4.05244Z" />,
    );

export const RocketIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />,
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />,
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />,
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />,
    );

export const ZapIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
    );

export const LightbulbIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />,
        <path d="M9 18h6" />,
        <path d="M10 22h4" />,
    );

export const HammerIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />,
        <path d="m18 15 4-4" />,
        <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />,
    );

export const SparklesIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
        <path d="M20 3v4" />,
        <path d="M22 5h-4" />,
        <path d="M4 17v2" />,
        <path d="M5 18H3" />,
    );

export const ShieldOffIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="m2 2 20 20" />,
        <path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71" />,
        <path d="M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264" />,
    );

export const SettingsIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />,
        <circle cx="12" cy="12" r="3" />,
    );

export const Settings2Icon = (props: IconProps = {}) =>
    svg(props,
        <path d="M20 7h-9" />,
        <path d="M14 17H5" />,
        <circle cx="17" cy="17" r="3" />,
        <circle cx="7" cy="7" r="3" />,
    );

export const ListFilterIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M3 6h18" />,
        <path d="M7 12h10" />,
        <path d="M10 18h4" />,
    );

export const ListOrderedIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M10 6h11" />,
        <path d="M10 12h11" />,
        <path d="M10 18h11" />,
        <path d="M4 6h1v4" />,
        <path d="M4 10h2" />,
        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />,
    );

export const Minimize2Icon = (props: IconProps = {}) =>
    svg(props,
        <path d="m14 10 7-7" />,
        <path d="M20 10h-6V4" />,
        <path d="m3 21 7-7" />,
        <path d="M4 14h6v6" />,
    );

export const TextQuoteIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M17 6H3" />,
        <path d="M21 12H8" />,
        <path d="M21 18H8" />,
        <path d="M3 12v6" />,
    );

export const TextSearchIcon = (props: IconProps = {}) =>
    svg(props,
        <path d="M21 6H3" />,
        <path d="M10 12H3" />,
        <path d="M10 18H3" />,
        <circle cx="17" cy="15" r="3" />,
        <path d="m21 19-1.9-1.9" />,
    );

export const VoidPPIcon = (props: IconProps = {}) =>
    svg({ ...props, strokeWidth: props.strokeWidth ?? 2.15 },
        <path d="M2.2 7.4 L8.4 20.2 L13.03 11.30" />,
        <path fill="currentColor" stroke="none" d="M13.985 11.792 L14.045 11.678 L14.104 11.567 L14.163 11.458 L14.222 11.352 L14.280 11.249 L14.338 11.148 L14.395 11.049 L14.452 10.953 L14.508 10.859 L14.563 10.768 L14.618 10.679 L14.673 10.592 L14.727 10.508 L14.781 10.426 L14.834 10.347 L14.887 10.270 L14.939 10.195 L14.992 10.122 L15.044 10.052 L15.095 9.984 L15.147 9.918 L15.198 9.855 L15.249 9.794 L15.300 9.735 L15.351 9.678 L15.402 9.623 L15.452 9.571 L15.503 9.521 L15.554 9.473 L15.606 9.427 L15.657 9.384 L15.709 9.342 L15.760 9.303 L15.813 9.267 L15.865 9.232 L15.918 9.200 L15.972 9.170 L16.026 9.142 L16.081 9.117 L16.136 9.094 L16.191 9.074 L16.248 9.056 L16.305 9.041 L16.363 9.028 L16.421 9.018 L16.480 9.011 L16.540 9.006 L16.600 9.005 L23.700 9.005 L23.700 7.555 L16.600 7.555 L16.494 7.556 L16.388 7.560 L16.282 7.566 L16.177 7.574 L16.071 7.585 L15.966 7.598 L15.860 7.615 L15.755 7.634 L15.650 7.655 L15.545 7.680 L15.440 7.707 L15.336 7.737 L15.231 7.771 L15.127 7.807 L15.024 7.846 L14.921 7.888 L14.818 7.933 L14.716 7.981 L14.614 8.032 L14.513 8.086 L14.413 8.144 L14.313 8.204 L14.214 8.267 L14.116 8.334 L14.018 8.403 L13.922 8.475 L13.826 8.550 L13.731 8.629 L13.638 8.710 L13.545 8.794 L13.453 8.882 L13.363 8.972 L13.273 9.065 L13.185 9.161 L13.098 9.260 L13.012 9.361 L12.927 9.466 L12.844 9.573 L12.762 9.684 L12.681 9.797 L12.601 9.913 L12.522 10.031 L12.445 10.153 L12.369 10.277 L12.294 10.404 L12.221 10.533 L12.149 10.666 L12.077 10.800 Z" />,
        <g fill="currentColor" stroke="none">
            <rect x="16.775" y="5.78" width="1.45" height="5.0" />
            <rect x="20.475" y="5.78" width="1.45" height="5.0" />
        </g>,
    );



