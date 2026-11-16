// @ts-nocheck
/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { U, whenApi } from "../../u.js";

export { classes, classNameFactory } from "../../../../src/utils/css.ts";

export function registerStyle(name, css) {
    whenApi(u => u.registerStyle(name, css));
}
export function unregisterStyle(name) {
    whenApi(u => u.unregisterStyle(name));
}
export const enableStyle = name => U?.enableStyle(name) ?? false;
export const disableStyle = name => U?.disableStyle(name) ?? false;
