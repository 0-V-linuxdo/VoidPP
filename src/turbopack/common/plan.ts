/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SubscriptionTier, XSubscriptionType } from "@grok-types/enums";

const PLAN_NAMES: Partial<Record<SubscriptionTier, string>> = {
    SUBSCRIPTION_TIER_X_BASIC: "X Basic",
    SUBSCRIPTION_TIER_X_PREMIUM: "X Premium",
    SUBSCRIPTION_TIER_X_PREMIUM_PLUS: "X Premium+",
    SUBSCRIPTION_TIER_SUPER_GROK_LITE: "SuperGrok Lite",
    SUBSCRIPTION_TIER_GROK_PRO: "SuperGrok",
    SUBSCRIPTION_TIER_SUPER_GROK_PLUS: "SuperGrok Plus",
    SUBSCRIPTION_TIER_SUPER_GROK_PRO: "SuperGrok Heavy",
};

/** Commerce billing (The X Subscription) renames the same tier ids. */
const COMMERCE_PLAN_NAMES: Partial<Record<SubscriptionTier, string>> = {
    SUBSCRIPTION_TIER_SUPER_GROK_LITE: "Plus",
    SUBSCRIPTION_TIER_GROK_PRO: "Premium",
    SUBSCRIPTION_TIER_SUPER_GROK_PLUS: "Super",
    SUBSCRIPTION_TIER_SUPER_GROK_PRO: "Ultra",
};

const X_SUB_NAMES: Partial<Record<XSubscriptionType, string>> = {
    PremiumPlus: "SuperGrok",
    Premium: "X Premium",
    Basic: "X Basic",
};

export function getPlanName(
    bestSubscription?: SubscriptionTier,
    xSubscriptionType?: XSubscriptionType,
    commerce = false,
): string {
    if (commerce && bestSubscription) {
        const unified = COMMERCE_PLAN_NAMES[bestSubscription];
        if (unified) return unified;
    }
    return (bestSubscription ? PLAN_NAMES[bestSubscription] : undefined)
        ?? (xSubscriptionType ? X_SUB_NAMES[xSubscriptionType] : undefined)
        ?? "Free";
}
