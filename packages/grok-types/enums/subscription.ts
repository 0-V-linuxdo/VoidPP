/**
 * Grok subscription tier identifiers from the API.
 *
 * Used in subscription objects (`activeSubscriptions[].tier`) and the
 * `GrokApiV2SubscriptionTier` enum. Ordered by privilege level ascending.
 */
export type SubscriptionTier =
    | "SUBSCRIPTION_TIER_INVALID"
    | "SUBSCRIPTION_TIER_X_BASIC"
    | "SUBSCRIPTION_TIER_X_PREMIUM"
    | "SUBSCRIPTION_TIER_X_PREMIUM_PLUS"
    | "SUBSCRIPTION_TIER_SUPER_GROK_LITE"
    | "SUBSCRIPTION_TIER_GROK_PRO"
    | "SUBSCRIPTION_TIER_SUPER_GROK_PLUS"
    | "SUBSCRIPTION_TIER_SUPER_GROK_PRO"
    | (string & {});

/**
 * Numeric privilege level for each subscription tier.
 * Higher number = more access. Used by `getSubscriptionLevel()` to rank tiers.
 *
 * | Tier                         | Level | Display Name  |
 * |------------------------------|-------|---------------|
 * | SUBSCRIPTION_TIER_INVALID        | 0     | Free          |
 * | SUBSCRIPTION_TIER_X_BASIC        | 1     | Basic         |
 * | SUBSCRIPTION_TIER_X_PREMIUM      | 2     | Premium       |
 * | SUBSCRIPTION_TIER_X_PREMIUM_PLUS | 3     | PremiumPlus   |
 * | SUBSCRIPTION_TIER_SUPER_GROK_LITE| 4     | SuperGrokLite |
 * | SUBSCRIPTION_TIER_GROK_PRO       | 5     | SuperGrok     |
 * | SUBSCRIPTION_TIER_SUPER_GROK_PRO | 6     | SuperGrokPro  |
 */
export type SubscriptionTierLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Display name for each subscription tier.
 * Returned by `getSubscriptionLevel()` and used in UI strings.
 */
export type SubscriptionTierName =
    | "Free"
    | "Basic"
    | "Premium"
    | "PremiumPlus"
    | "SuperGrokLite"
    | "SuperGrok"
    | "SuperGrokPro"
    | (string & {});

/** Subscription lifecycle status from the API. */
export type SubscriptionStatus =
    | "SUBSCRIPTION_STATUS_INVALID"
    | "SUBSCRIPTION_STATUS_ACTIVE"
    | "SUBSCRIPTION_STATUS_INACTIVE"
    | (string & {});

/**
 * X (Twitter) subscription type string from the linked account.
 * Stored on `GrokUser.xSubscriptionType`. Empty string if no X subscription.
 *
 * `"PremiumPlus"` grants SuperGrok access even without a direct Grok subscription.
 */
export type XSubscriptionType = "" | "Basic" | "Premium" | "PremiumPlus" | (string & {});

/**
 * Session tier ID from the user profile.
 * Stored on `GrokUser.sessionTierId` as a string-encoded number.
 *
 * This is the X-based tier, NOT the Grok subscription tier.
 * For the actual Grok subscription, use `useSubscriptions().bestSubscription`.
 *
 * | Value | Meaning      |
 * |-------|-------------|
 * | "0"   | Free        |
 * | "1"   | X Premium   |
 * | "2"   | X Premium+  |
 */
export type SessionTierId = "0" | "1" | "2" | (string & {});

/** Subscription billing period from the API (`GrokApiV2SubscriptionType`). */
export type SubscriptionType = "MONTHLY" | "YEARLY" | (string & {});

/**
 * Subscription update result status returned by the cancel/change flow.
 *
 * | Status                                               | Description                          |
 * |------------------------------------------------------|--------------------------------------|
 * | `"SUBSCRIPTION_UPDATE_STATUS_SUCCESS"`                | Update completed successfully        |
 * | `"SUBSCRIPTION_UPDATE_STATUS_FAILED"`                 | Payment or processing failure        |
 * | `"SUBSCRIPTION_UPDATE_STATUS_INVALID"`                | Invalid request                      |
 * | `"SUBSCRIPTION_UPDATE_STATUS_NOT_SUPPORTED"`          | Plan does not support this update    |
 * | `"SUBSCRIPTION_UPDATE_STATUS_NO_UPDATEABLE_SUBSCRIPTION"` | No active subscription found    |
 */
export type SubscriptionUpdateStatus =
	| "SUBSCRIPTION_UPDATE_STATUS_SUCCESS"
	| "SUBSCRIPTION_UPDATE_STATUS_FAILED"
	| "SUBSCRIPTION_UPDATE_STATUS_INVALID"
	| "SUBSCRIPTION_UPDATE_STATUS_NOT_SUPPORTED"
	| "SUBSCRIPTION_UPDATE_STATUS_NO_UPDATEABLE_SUBSCRIPTION"
	| (string & {});

/** Requested subscription tier for upgrade flows. */
export type RequestedTier =
    | "REQUESTED_TIER_INVALID"
    | "REQUESTED_TIER_SUPER_GROK_LITE"
    | "REQUESTED_TIER_GROK_PRO"
    | "REQUESTED_TIER_SUPER_GROK_PRO"
    | (string & {});
