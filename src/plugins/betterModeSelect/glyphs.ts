/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const HEAVY = "heavy";

// Grok still labels Heavy as iconHint "connected_apps", but that hint now
// renders ConnectorsIcon (the filled four-tile mark). The old Heavy glyph
// is the three-square elbow kept as ConnectedAppsIcon.
const CONNECTORS_MARKS = ["M12 12H19V16", "17.7236"];

export function keepHarvestedGlyph(modeId: string, markup: string) {
    if (modeId !== HEAVY) return true;
    return !CONNECTORS_MARKS.some(mark => markup.includes(mark));
}
