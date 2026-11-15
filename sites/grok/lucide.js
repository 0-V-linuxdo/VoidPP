import { h } from "./u.js";

function svg(props = {}, ...children) {
    return h("svg", {
        width: props.width ?? props.size ?? "1em",
        height: props.height ?? props.size ?? "1em",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: props.strokeWidth ?? 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: props.className,
        "aria-hidden": "true",
    }, ...children);
}

const path = d => h("path", { d });

export const UnplugIcon = (props = {}) => svg(props,
    path("m19 5 3-3"), path("m2 22 3-3"),
    path("M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"),
    path("M7.5 13.5 10 11"), path("M10.5 16.5 13 14"),
    path("m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"),
);
export const PaletteIcon = (props = {}) => svg(props,
    path("M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"),
    h("circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }),
    h("circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor" }),
    h("circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }),
    h("circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }),
);
export const BracesIcon = (props = {}) => svg(props,
    path("M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"),
    path("M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"),
);
export const TestTubeIcon = (props = {}) => svg(props,
    path("M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3"),
    path("m16 2 6 6"), path("M12 16H4"),
);
export const BellIcon = (props = {}) => svg(props,
    path("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"),
    path("M10.3 21a1.94 1.94 0 0 0 3.4 0"),
);
export const Settings2Icon = (props = {}) => svg(props,
    path("M20 7h-9"), path("M14 17H5"),
    h("circle", { cx: "17", cy: "17", r: "3" }),
    h("circle", { cx: "7", cy: "7", r: "3" }),
);
export const FileDownIcon = (props = {}) => svg(props,
    path("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"),
    path("M14 2v4a2 2 0 0 0 2 2h4"), path("M12 18v-6"), path("m9 15 3 3 3-3"),
);
export const RotateCcwIcon = (props = {}) => svg(props,
    path("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"),
    path("M3 3v5h5"),
);
export const VoidPPIcon = (props = {}) => svg({ ...props, strokeWidth: props.strokeWidth ?? 2.15 },
    path("M2.2 7.4 L8.4 20.2 L13.03 11.30"),
);
UnplugIcon.displayName = "UnplugIcon";
PaletteIcon.displayName = "PaletteIcon";
BracesIcon.displayName = "BracesIcon";
TestTubeIcon.displayName = "TestTubeIcon";
BellIcon.displayName = "BellIcon";
Settings2Icon.displayName = "Settings2Icon";
FileDownIcon.displayName = "FileDownIcon";
RotateCcwIcon.displayName = "RotateCcwIcon";
VoidPPIcon.displayName = "VoidPPIcon";
