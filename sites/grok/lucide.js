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
    path("M10.268 21a2 2 0 0 0 3.464 0"),
    path("M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"),
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
    h("path", { fill: "currentColor", stroke: "none", d: "M13.985 11.792 L14.045 11.678 L14.104 11.567 L14.163 11.458 L14.222 11.352 L14.280 11.249 L14.338 11.148 L14.395 11.049 L14.452 10.953 L14.508 10.859 L14.563 10.768 L14.618 10.679 L14.673 10.592 L14.727 10.508 L14.781 10.426 L14.834 10.347 L14.887 10.270 L14.939 10.195 L14.992 10.122 L15.044 10.052 L15.095 9.984 L15.147 9.918 L15.198 9.855 L15.249 9.794 L15.300 9.735 L15.351 9.678 L15.402 9.623 L15.452 9.571 L15.503 9.521 L15.554 9.473 L15.606 9.427 L15.657 9.384 L15.709 9.342 L15.760 9.303 L15.813 9.267 L15.865 9.232 L15.918 9.200 L15.972 9.170 L16.026 9.142 L16.081 9.117 L16.136 9.094 L16.191 9.074 L16.248 9.056 L16.305 9.041 L16.363 9.028 L16.421 9.018 L16.480 9.011 L16.540 9.006 L16.600 9.005 L23.700 9.005 L23.700 7.555 L16.600 7.555 L16.494 7.556 L16.388 7.560 L16.282 7.566 L16.177 7.574 L16.071 7.585 L15.966 7.598 L15.860 7.615 L15.755 7.634 L15.650 7.655 L15.545 7.680 L15.440 7.707 L15.336 7.737 L15.231 7.771 L15.127 7.807 L15.024 7.846 L14.921 7.888 L14.818 7.933 L14.716 7.981 L14.614 8.032 L14.513 8.086 L14.413 8.144 L14.313 8.204 L14.214 8.267 L14.116 8.334 L14.018 8.403 L13.922 8.475 L13.826 8.550 L13.731 8.629 L13.638 8.710 L13.545 8.794 L13.453 8.882 L13.363 8.972 L13.273 9.065 L13.185 9.161 L13.098 9.260 L13.012 9.361 L12.927 9.466 L12.844 9.573 L12.762 9.684 L12.681 9.797 L12.601 9.913 L12.522 10.031 L12.445 10.153 L12.369 10.277 L12.294 10.404 L12.221 10.533 L12.149 10.666 L12.077 10.800 Z" }),
    h("g", { fill: "currentColor", stroke: "none" },
        h("rect", { x: "16.775", y: "5.78", width: "1.45", height: "5.0" }),
        h("rect", { x: "20.475", y: "5.78", width: "1.45", height: "5.0" }),
    ),
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
