/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SubscriptionTier } from "@grok-types/enums";

import { findByPropsLazy } from "../turbopack";
import { SubscriptionsStore } from "./stores";

const COMMERCE_BILLING = "BILLING_SYSTEM_COMMERCE";

const SubscriptionsApi = findByPropsLazy("useSubscriptions", "getSubscriptionTierName");
const QueryClientApi = findByPropsLazy("getQueryClient");

export interface SubscriptionRecord {
    tier?: string;
    billingSystem?: string;
}

export interface SubscriptionSnapshot {
    bestSubscription?: SubscriptionTier;
    isSubscribed?: boolean;
    isSuperGrokLiteUser?: boolean;
    isSuperGrokUser?: boolean;
    isSuperGrokPlusUser?: boolean;
    isSuperGrokProUser?: boolean;
    isEnterpriseUser?: boolean;
    hasXSubscription?: boolean;
    isXPremiumUser?: boolean;
    activeSubscriptions?: SubscriptionRecord[];
}

type SnapshotHook = {
    (): SubscriptionSnapshot;
    <T>(selector: (state: SubscriptionSnapshot) => T): T;
    getState?: () => SubscriptionSnapshot;
};

function legacyHook(): SnapshotHook | null {
    const store = (SubscriptionsStore as { useSubscriptionsStore?: unknown }).useSubscriptionsStore;
    if (typeof store === "function" && typeof (store as SnapshotHook).getState === "function") {
        return store as SnapshotHook;
    }
    return null;
}

function modernHook(): (() => SubscriptionSnapshot) | null {
    const hook = (SubscriptionsApi as { useSubscriptions?: unknown }).useSubscriptions;
    return typeof hook === "function" ? hook as () => SubscriptionSnapshot : null;
}

function cachedSnapshot(): SubscriptionSnapshot {
    try {
        const client = (QueryClientApi as { getQueryClient?: () => {
            getQueryCache?: () => { find?: (opts: { queryKey: string[] }) => { state?: { data?: SubscriptionSnapshot } } | undefined };
        } }).getQueryClient?.();
        const data = client?.getQueryCache?.().find?.({ queryKey: ["subscriptions"] })?.state?.data;
        if (data && typeof data === "object") return data;
    } catch {
        // Query client is absent on older bundles.
    }
    return {};
}

/** Outside React. Zustand getState, else the subscriptions query cache. */
export function readSubscriptionSnapshot(): SubscriptionSnapshot {
    const legacy = legacyHook();
    if (legacy?.getState) return legacy.getState() ?? {};
    return cachedSnapshot();
}

/**
 * Inside a component. Prefer Grok's `useSubscriptions` hook (post X-subscription
 * merge). Fall back to the removed Zustand store, then the query cache.
 * The chosen hook is stable once the module cache has the export.
 */
export function useSubscriptionSnapshot(): SubscriptionSnapshot {
    const modern = modernHook();
    if (modern) return modern() ?? {};
    const legacy = legacyHook();
    if (legacy) return legacy(state => state) ?? {};
    return cachedSnapshot();
}

export function subscriptionIsCommerce(snapshot: SubscriptionSnapshot | null | undefined): boolean {
    const tier = snapshot?.bestSubscription;
    if (!tier) return false;
    return !!snapshot.activeSubscriptions?.some(sub =>
        sub?.tier === tier && sub.billingSystem === COMMERCE_BILLING,
    );
}

export function subscriptionIsPaid(snapshot: SubscriptionSnapshot | null | undefined): boolean {
    if (!snapshot) return false;
    if (snapshot.isSubscribed) return true;
    if (
        snapshot.isSuperGrokUser
        || snapshot.isSuperGrokLiteUser
        || snapshot.isSuperGrokPlusUser
        || snapshot.isSuperGrokProUser
        || snapshot.isEnterpriseUser
        || snapshot.hasXSubscription
        || snapshot.isXPremiumUser
    ) return true;
    const tier = snapshot.bestSubscription;
    return !!tier && tier !== "SUBSCRIPTION_TIER_INVALID";
}
