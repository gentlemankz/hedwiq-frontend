/**
 * Customer State & Limit Check Functions
 *
 * Functions for getting customer state from Polar and checking usage limits.
 */

import { polarClient } from "@/lib/auth";
import {
  getTierFromProductId,
  isUnlimited,
  isUnlimitedMinutes,
  identifyMeterType,
  isPastDueWithinGrace,
  type SubscriptionTier,
} from "@/lib/polar/constants";
import type { CustomerState, MeetingLimitCheck } from "./types";
import { checkUsageLimit } from "./limit-check";

// ============================================================================
// Customer State & Limit Check Functions
// ============================================================================

/**
 * Get customer state from Polar with cache fallback.
 *
 * Strategy:
 * 1. Try to get from Polar API first
 * 2. Update cache on success
 * 3. Fall back to cache if Polar fails (with staleness warning)
 *
 * @param userId - The user's ID (external customer ID)
 */
export async function getCustomerState(userId: string): Promise<CustomerState | null> {
  // Import cache functions dynamically to avoid circular dependencies
  const {
    getSubscriptionFromCache,
    updateSubscriptionCache,
    isCacheTooOld,
    recordCacheSyncError,
  } = await import("@/lib/polar/subscription-cache");

  // If Polar is not configured, try cache first
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured, checking cache");
    const cached = await getSubscriptionFromCache(userId);
    if (cached && !isCacheTooOld(cached)) {
      return {
        tier: cached.tier,
        minutesUsed: cached.usage.minutesUsed,
        emailDraftsUsed: cached.usage.emailDraftsUsed,
        storageUsedBytes: cached.usage.storageUsedBytes,
        activeSubscriptions: [],
      };
    }
    return null;
  }

  try {
    // First, get the customer (required for subsequent calls)
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });

    if (!customer) {
      return null;
    }

    // Parallelize subscriptions and meters fetch (both depend only on customer.id)
    const [subscriptions, meters] = await Promise.all([
      polarClient.subscriptions.list({
        customerId: customer.id,
        active: true,
      }),
      polarClient.customerMeters.list({
        customerId: customer.id,
      }),
    ]);

    // Determine tier from active subscription
    // Include past_due status only within grace period to prevent unpaid usage
    const activeSubscription = subscriptions.result.items?.find((sub) => {
      if (sub.status === "active" || sub.status === "trialing") {
        return true;
      }
      // For past_due, check if within grace period
      if (sub.status === "past_due") {
        return isPastDueWithinGrace(sub.currentPeriodEnd);
      }
      return false;
    });

    // Determine tier - downgrade to free if past_due is beyond grace period
    let tier: SubscriptionTier = "free";
    let status: "none" | "active" | "trialing" | "canceled" | "past_due" = "none";

    if (activeSubscription) {
      if (activeSubscription.status === "past_due" && !isPastDueWithinGrace(activeSubscription.currentPeriodEnd)) {
        // Past grace period - treat as free tier
        console.log(`[Polar Usage] Subscription ${activeSubscription.id} past_due beyond grace period, using free tier`);
        tier = "free";
        status = "past_due";
      } else {
        tier = getTierFromProductId(activeSubscription.productId);
        status = activeSubscription.status as typeof status;
      }
    }

    // Extract usage from meters using robust meter type identification
    let minutesUsed = 0;
    let emailDraftsUsed = 0;
    let storageUsedBytes = 0;

    for (const meter of meters.result.items || []) {
      const meterType = identifyMeterType(meter.meter?.name);
      switch (meterType) {
        case "meeting_minutes":
          minutesUsed = meter.consumedUnits || 0;
          break;
        case "email_drafts":
          emailDraftsUsed = meter.consumedUnits || 0;
          break;
        case "storage_bytes":
          storageUsedBytes = meter.consumedUnits || 0;
          break;
      }
    }

    // Update cache with fresh data (fire-and-forget, don't block response)
    updateSubscriptionCache({
      userId,
      tier,
      status,
      polarCustomerId: customer.id,
      polarSubscriptionId: activeSubscription?.id ?? null,
      minutesUsed,
      emailDraftsUsed,
      storageUsedBytes,
    }).catch((err) => console.error("[Polar Usage] Cache update failed:", err));

    return {
      tier,
      minutesUsed,
      emailDraftsUsed,
      storageUsedBytes,
      activeSubscriptions: (subscriptions.result.items || []).map((sub) => ({
        id: sub.id,
        productId: sub.productId,
        status: sub.status,
      })),
    };
  } catch (error) {
    console.error("[Polar Usage] Failed to get customer state from Polar:", error);

    // Record sync error for debugging
    recordCacheSyncError(
      userId,
      error instanceof Error ? error.message : "Unknown error"
    ).catch(() => {});

    // Fall back to cache
    const cached = await getSubscriptionFromCache(userId);
    if (cached) {
      if (isCacheTooOld(cached)) {
        console.warn("[Polar Usage] Cache too old, cannot use as fallback");
        return null;
      }

      console.log("[Polar Usage] Using cached subscription data as fallback");
      return {
        tier: cached.tier,
        minutesUsed: cached.usage.minutesUsed,
        emailDraftsUsed: cached.usage.emailDraftsUsed,
        storageUsedBytes: cached.usage.storageUsedBytes,
        activeSubscriptions: [],
      };
    }

    return null;
  }
}

/**
 * Check if a user can start/join a meeting based on their subscription limits
 *
 * Uses the generic checkUsageLimit strategy with minutes-specific configuration.
 *
 * @param userId - The user's ID
 * @returns Meeting limit check result
 */
export async function canUserStartMeeting(userId: string): Promise<MeetingLimitCheck> {
  const errorResult: MeetingLimitCheck = {
    allowed: false,
    tier: "free",
    remainingMinutes: 0,
    minutesUsed: 0,
    minutesLimit: 0,
    reason: "Unable to verify subscription. Please retry in a moment.",
  };

  return checkUsageLimit<MeetingLimitCheck>(
    userId,
    {
      usageField: "minutesUsed",
      limitField: "minutesPerMonth",
      isUnlimitedFn: isUnlimitedMinutes,
      limitReachedMessage: "Monthly minutes limit reached. Upgrade to continue.",
      buildResult: ({ allowed, tier, used, limit, remaining, reason }) => ({
        allowed,
        tier,
        remainingMinutes: remaining,
        minutesUsed: used,
        minutesLimit: limit,
        reason,
      }),
    },
    errorResult
  );
}

/**
 * Check if a user can create an email draft based on their subscription limits
 *
 * Uses the generic checkUsageLimit strategy with drafts-specific configuration.
 *
 * @param userId - The user's ID
 * @returns Whether the user can create an email draft
 */
export async function canUserCreateEmailDraft(userId: string): Promise<{
  allowed: boolean;
  tier: SubscriptionTier;
  remainingDrafts: number;
  draftsUsed: number;
  draftsLimit: number;
  reason?: string;
}> {
  type EmailDraftCheck = {
    allowed: boolean;
    tier: SubscriptionTier;
    remainingDrafts: number;
    draftsUsed: number;
    draftsLimit: number;
    reason?: string;
  };

  const errorResult: EmailDraftCheck = {
    allowed: false,
    tier: "free",
    remainingDrafts: 0,
    draftsUsed: 0,
    draftsLimit: 0,
    reason: "Unable to verify subscription. Please retry in a moment.",
  };

  return checkUsageLimit<EmailDraftCheck>(
    userId,
    {
      usageField: "emailDraftsUsed",
      limitField: "emailDraftsPerMonth",
      isUnlimitedFn: isUnlimited,
      limitReachedMessage: "Monthly email draft limit reached. Upgrade to continue.",
      notIncludedMessage: "Email drafts not included in Free plan. Upgrade to Pro.",
      buildResult: ({ allowed, tier, used, limit, remaining, reason }) => ({
        allowed,
        tier,
        remainingDrafts: remaining,
        draftsUsed: used,
        draftsLimit: limit,
        reason,
      }),
    },
    errorResult
  );
}
