/**
 * Generic Limit Check Strategy (DRY Pattern)
 *
 * Reusable logic for checking usage limits against subscription tiers.
 */

import { polarClient } from "@/lib/auth";
import { TIER_LIMITS, type SubscriptionTier } from "@/lib/polar/constants";

// ============================================================================
// Generic Limit Check Strategy (DRY Pattern)
// ============================================================================

/**
 * Configuration for a usage limit check.
 * Allows parameterizing the limit check logic for different usage types.
 */
export interface LimitCheckConfig<T> {
  /** Usage field to check in customer state */
  usageField: "minutesUsed" | "emailDraftsUsed";
  /** Limit field in TIER_LIMITS */
  limitField: "minutesPerMonth" | "emailDraftsPerMonth";
  /** Function to check if limit is unlimited */
  isUnlimitedFn: (limit: number) => boolean;
  /** Error message when limit is reached */
  limitReachedMessage: string;
  /** Error message when limit is zero (not included in plan) */
  notIncludedMessage?: string;
  /** Transform usage/limit values into the return type */
  buildResult: (params: {
    allowed: boolean;
    tier: SubscriptionTier;
    used: number;
    limit: number;
    remaining: number;
    reason?: string;
  }) => T;
}

/**
 * Generic limit check function that handles both Polar API and local cache strategies.
 * Extracted to avoid duplication between canUserStartMeeting and canUserCreateEmailDraft.
 *
 * Strategy:
 * 1. For paid users (with Polar customer): Check Polar API for usage
 * 2. For free users (no Polar customer): Check local database cache
 * 3. Fail open for paid users during API blips, fail closed for free users
 */
export async function checkUsageLimit<T>(
  userId: string,
  config: LimitCheckConfig<T>,
  errorResult: T
): Promise<T> {
  // Import cache functions dynamically to avoid circular dependencies
  const {
    getOrCreateSubscriptionCache,
    getSubscriptionFromCache,
  } = await import("@/lib/polar/subscription-cache");

  // Dynamic import to avoid circular dependency
  const { getCustomerState } = await import("./customer-state");

  // Strategy 1: Try to get Polar customer state for paid users
  if (polarClient) {
    try {
      const customerState = await getCustomerState(userId);

      // If we got customer state from Polar with active subscription, use it (paid user)
      if (customerState && customerState.activeSubscriptions.length > 0) {
        const { tier } = customerState;
        const used = customerState[config.usageField];
        const limits = TIER_LIMITS[tier];
        const limit = limits[config.limitField];

        // Check unlimited
        if (config.isUnlimitedFn(limit)) {
          return config.buildResult({
            allowed: true,
            tier,
            used,
            limit,
            remaining: -1, // -1 indicates unlimited
          });
        }

        // Check if not included in plan
        if (limit === 0 && config.notIncludedMessage) {
          return config.buildResult({
            allowed: false,
            tier,
            used,
            limit: 0,
            remaining: 0,
            reason: config.notIncludedMessage,
          });
        }

        const remaining = Math.max(0, limit - used);
        const allowed = remaining > 0;

        return config.buildResult({
          allowed,
          tier,
          used,
          limit,
          remaining,
          reason: allowed ? undefined : config.limitReachedMessage,
        });
      }
      // If no active subscription, fall through to local cache for free tier
    } catch (error) {
      console.warn("[Polar Usage] Polar check failed, checking if paid user:", error);

      // CRITICAL: Use NON-CREATING lookup to avoid giving new paid users free-tier limits
      try {
        const cached = await getSubscriptionFromCache(userId);

        if (cached && cached.tier !== "free") {
          // PAID user with existing cache experiencing Polar blip - ALLOW them through
          const limits = TIER_LIMITS[cached.tier];
          const limit = limits[config.limitField];
          const used = cached.usage[config.usageField];

          console.warn(
            `[Polar Usage] PAID user ${userId} (tier=${cached.tier}) allowed during Polar blip`
          );

          // For unlimited plans, allow
          if (config.isUnlimitedFn(limit)) {
            return config.buildResult({
              allowed: true,
              tier: cached.tier,
              used,
              limit,
              remaining: -1,
            });
          }

          // For paid tiers with limits, still allow but show cached usage
          return config.buildResult({
            allowed: true,
            tier: cached.tier,
            used,
            limit,
            remaining: Math.max(0, limit - used),
          });
        }

        // No cache exists - this might be a NEW paid user right after purchase
        if (!cached) {
          console.warn(
            `[Polar Usage] No cache for user ${userId} during Polar blip - returning retry error`
          );
          return errorResult;
        }

        // Free user with existing cache - fall through to local cache enforcement below
      } catch (cacheError) {
        console.error("[Polar Usage] Cache lookup also failed:", cacheError);
        return errorResult;
      }
    }
  }

  // Strategy 2: Use local cache for free users (or when Polar unavailable)
  try {
    const cached = await getOrCreateSubscriptionCache(userId);
    const tier = cached.tier;
    const used = cached.usage[config.usageField];
    const limits = TIER_LIMITS[tier];
    const limit = limits[config.limitField];

    // Check unlimited (shouldn't happen for free, but handle it)
    if (config.isUnlimitedFn(limit)) {
      return config.buildResult({
        allowed: true,
        tier,
        used,
        limit,
        remaining: -1,
      });
    }

    // Check if not included in plan (e.g., email drafts for free tier)
    if (limit === 0 && config.notIncludedMessage) {
      return config.buildResult({
        allowed: false,
        tier,
        used,
        limit: 0,
        remaining: 0,
        reason: config.notIncludedMessage,
      });
    }

    const remaining = Math.max(0, limit - used);
    const allowed = remaining > 0;

    console.debug(
      `[Polar Usage] Local cache check: user=${userId}, tier=${tier}, used=${used}/${limit}, allowed=${allowed}`
    );

    return config.buildResult({
      allowed,
      tier,
      used,
      limit,
      remaining,
      reason: allowed ? undefined : config.limitReachedMessage,
    });
  } catch (error) {
    console.error("[Polar Usage] Failed to check limits from cache:", error);
    return errorResult;
  }
}
