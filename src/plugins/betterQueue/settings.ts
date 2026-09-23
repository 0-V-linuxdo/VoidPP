/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showQueueMode: {
        type: OptionType.BOOLEAN,
        description: "Show a mode chip on each queued message.",
        default: true,
    },
    stickyOnNavigate: {
        type: OptionType.BOOLEAN,
        description: "Keep the selected mode when switching chats.",
        default: true,
    },
    persistAcrossRefresh: {
        type: OptionType.BOOLEAN,
        description: "Restore unsent queued messages in this browser after a refresh.",
        default: true,
    },
});
