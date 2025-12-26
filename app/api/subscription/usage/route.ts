/**
 * Subscription Usage API
 *
 * GET /api/subscription/usage
 * Returns the current user's usage statistics and remaining quotas.
 *
 * Authentication: User session required
 *
 * Response:
 * - tier: Current subscription tier
 * - usage: Current period usage (minutes, email drafts, storage)
 * - limits: Current tier's limits
 * - remaining: Remaining quota for each resource
 * - percentUsed: Percentage of quota used for each resource
 * - period: Current billing period dates
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, polarClient } from "@/lib/auth";
import { handleAPIError, unauthorized } from "@/lib/api";
import {
  TIER_LIMITS,
  getTierFromProductId,
  isUnlimited,
  identifyMeterType,
  isPastDueWithinGrace,
  type SubscriptionTier,
} from "@/lib/polar/constants";
import { getPolarCustomer } from "@/lib/polar/usage";
import { getSubscriptionFromCache, isCacheTooOld } from "@/lib/polar/subscription-cache";

// ============================================================================
// Types
// ============================================================================

interface UsageStats {
  minutesUsed: number;
  emailDraftsUsed: number;
  storageUsedBytes: number;
  storageUsedGb: number;
}

interface UsageLimits {
  minutesPerMonth: number;
  emailDraftsPerMonth: number;
  storageGb: number;
  historyDays: number;
}

interface RemainingQuota {
  /** Remaining minutes (-1 if unlimited, use minutesUnlimited flag for display logic) */
  minutes: number;
  /** Remaining email drafts (-1 if unlimited, use emailDraftsUnlimited flag for display logic) */
  emailDrafts: number;
  /** Remaining storage in GB (-1 if unlimited, use storageUnlimited flag for display logic) */
  storageGb: number;
  /** True if minutes quota is unlimited (Business/Enterprise) */
  minutesUnlimited: boolean;
  /** True if email drafts quota is unlimited (Enterprise) */
  emailDraftsUnlimited: boolean;
  /** True if storage quota is unlimited (Enterprise) */
  storageUnlimited: boolean;
}

interface UsagePercentage {
  minutes: number;
  emailDrafts: number;
  storage: number;
}

interface UsageResponse {
  tier: SubscriptionTier;
  usage: UsageStats;
  limits: UsageLimits;
  remaining: RemainingQuota;
  percentUsed: UsagePercentage;
  period: {
    start: string | null;
    end: string | null;
  };
  canStartMeeting: boolean;
  canCreateEmailDraft: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculatePercentage(used: number, limit: number): number {
  if (isUnlimited(limit)) return 0;
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/**
 * Calculate remaining quota.
 * Returns -1 for unlimited quotas (clients should check *Unlimited flags).
 * This avoids sending Number.MAX_SAFE_INTEGER which can break JSON parsers and progress bars.
 */
function calculateRemaining(used: number, limit: number): number {
  if (isUnlimited(limit)) return -1;
  return Math.max(0, limit - used);
}

function buildResponseFromCache(
  cached: Awaited<ReturnType<typeof getSubscriptionFromCache>>,
  tier: SubscriptionTier
): UsageResponse | null {
  if (!cached) return null;
  if (isCacheTooOld(cached)) return null;

  const pastDueOutOfGrace =
    cached.status === "past_due" && !isPastDueWithinGrace(cached.currentPeriodEnd);
  const effectiveTier = pastDueOutOfGrace ? "free" : tier;

  const limits = TIER_LIMITS[effectiveTier];
  const minutesUnlimited = isUnlimited(limits.minutesPerMonth);
  const emailDraftsUnlimited = isUnlimited(limits.emailDraftsPerMonth);
  const storageUnlimited = isUnlimited(limits.storageGb);

  const storageUsedGb = cached.usage.storageUsedBytes / (1024 * 1024 * 1024);
  const remainingMinutes = calculateRemaining(cached.usage.minutesUsed, limits.minutesPerMonth);
  const remainingEmailDrafts = calculateRemaining(cached.usage.emailDraftsUsed, limits.emailDraftsPerMonth);
  const remainingStorageGb = calculateRemaining(storageUsedGb, limits.storageGb);

  return {
    tier: effectiveTier,
    usage: {
      minutesUsed: cached.usage.minutesUsed,
      emailDraftsUsed: cached.usage.emailDraftsUsed,
      storageUsedBytes: cached.usage.storageUsedBytes,
      storageUsedGb,
    },
    limits: {
      minutesPerMonth: limits.minutesPerMonth,
      emailDraftsPerMonth: limits.emailDraftsPerMonth,
      storageGb: limits.storageGb,
      historyDays: limits.historyDays,
    },
    remaining: {
      minutes: remainingMinutes,
      emailDrafts: remainingEmailDrafts,
      storageGb: remainingStorageGb,
      minutesUnlimited,
      emailDraftsUnlimited,
      storageUnlimited,
    },
    percentUsed: {
      minutes: calculatePercentage(cached.usage.minutesUsed, limits.minutesPerMonth),
      emailDrafts: calculatePercentage(cached.usage.emailDraftsUsed, limits.emailDraftsPerMonth),
      storage: calculatePercentage(storageUsedGb, limits.storageGb),
    },
    period: {
      start: cached.lastSyncedAt ? cached.lastSyncedAt.toISOString() : null,
      end: cached.currentPeriodEnd ? cached.currentPeriodEnd.toISOString() : null,
    },
    canStartMeeting: minutesUnlimited || remainingMinutes > 0,
    canCreateEmailDraft:
      (limits.emailDraftsPerMonth > 0 || emailDraftsUnlimited) &&
      (emailDraftsUnlimited || remainingEmailDrafts > 0),
  };
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET() {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw unauthorized("Authentication required");
    }

    const userId = session.user.id;

    // Default response for when Polar is not configured
    const defaultResponse = (tier: SubscriptionTier): UsageResponse => {
      const limits = TIER_LIMITS[tier];
      const minutesUnlimited = isUnlimited(limits.minutesPerMonth);
      const emailDraftsUnlimited = isUnlimited(limits.emailDraftsPerMonth);
      const storageUnlimited = isUnlimited(limits.storageGb);

      return {
        tier,
        usage: {
          minutesUsed: 0,
          emailDraftsUsed: 0,
          storageUsedBytes: 0,
          storageUsedGb: 0,
        },
        limits: {
          minutesPerMonth: limits.minutesPerMonth,
          emailDraftsPerMonth: limits.emailDraftsPerMonth,
          storageGb: limits.storageGb,
          historyDays: limits.historyDays,
        },
        remaining: {
          // Use -1 for unlimited to avoid Number.MAX_SAFE_INTEGER issues
          minutes: minutesUnlimited ? -1 : limits.minutesPerMonth,
          emailDrafts: emailDraftsUnlimited ? -1 : limits.emailDraftsPerMonth,
          storageGb: storageUnlimited ? -1 : limits.storageGb,
          minutesUnlimited,
          emailDraftsUnlimited,
          storageUnlimited,
        },
        percentUsed: {
          minutes: 0,
          emailDrafts: 0,
          storage: 0,
        },
        period: {
          start: null,
          end: null,
        },
        canStartMeeting: true,
        canCreateEmailDraft: limits.emailDraftsPerMonth > 0 || emailDraftsUnlimited,
      };
    };

    // If Polar is not configured, return cached data or free tier defaults
    if (!polarClient) {
      const cached = await getSubscriptionFromCache(userId);
      const cachedResponse = buildResponseFromCache(cached, cached?.tier ?? "free");
      if (cachedResponse) return NextResponse.json(cachedResponse);
      return NextResponse.json(defaultResponse("free"));
    }

    // Get Polar customer using shared utility
    let polarCustomer;
    try {
      ({ customer: polarCustomer } = await getPolarCustomer(userId));
    } catch (error) {
      console.error("[Subscription Usage] Polar customer lookup failed, checking cache:", error);
      const cached = await getSubscriptionFromCache(userId);
      const cachedResponse = buildResponseFromCache(cached, cached?.tier ?? "free");
      if (cachedResponse) return NextResponse.json(cachedResponse);
      return NextResponse.json(defaultResponse("free"));
    }

    // Customer doesn't exist - return free tier
    if (!polarCustomer) {
      return NextResponse.json(defaultResponse("free"));
    }

    // Get subscriptions and meters in parallel
    let subscriptions;
    let meters;
    try {
      [subscriptions, meters] = await Promise.all([
        polarClient.subscriptions.list({
          customerId: polarCustomer.id,
          active: true,
        }),
        polarClient.customerMeters.list({
          customerId: polarCustomer.id,
        }),
      ]);
    } catch (error) {
      console.error("[Subscription Usage] Polar API failed, checking cache:", error);
      const cached = await getSubscriptionFromCache(userId);
      const cachedResponse = buildResponseFromCache(cached, cached?.tier ?? "free");
      if (cachedResponse) return NextResponse.json(cachedResponse);
      return NextResponse.json(defaultResponse("free"));
    }

    // Determine tier from active subscription
    // Include past_due only within grace period to prevent unpaid usage
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
    if (activeSubscription) {
      if (activeSubscription.status === "past_due" && !isPastDueWithinGrace(activeSubscription.currentPeriodEnd)) {
        tier = "free"; // Past grace period
      } else {
        tier = getTierFromProductId(activeSubscription.productId);
      }
    }
    const limits = TIER_LIMITS[tier];

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

    const storageUsedGb = storageUsedBytes / (1024 * 1024 * 1024);

    // Calculate remaining quotas
    const remainingMinutes = calculateRemaining(minutesUsed, limits.minutesPerMonth);
    const remainingEmailDrafts = calculateRemaining(emailDraftsUsed, limits.emailDraftsPerMonth);
    const remainingStorageGb = calculateRemaining(storageUsedGb, limits.storageGb);

    // Calculate percentages
    const minutesPercent = calculatePercentage(minutesUsed, limits.minutesPerMonth);
    const emailDraftsPercent = calculatePercentage(emailDraftsUsed, limits.emailDraftsPerMonth);
    const storagePercent = calculatePercentage(storageUsedGb, limits.storageGb);

    // Get period dates from subscription
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    if (activeSubscription) {
      periodStart = activeSubscription.currentPeriodStart
        ? new Date(activeSubscription.currentPeriodStart).toISOString()
        : null;
      periodEnd = activeSubscription.currentPeriodEnd
        ? new Date(activeSubscription.currentPeriodEnd).toISOString()
        : null;
    }

    // Determine if user can perform actions
    // Note: remainingMinutes is -1 for unlimited, so we check flags explicitly
    const minutesUnlimited = isUnlimited(limits.minutesPerMonth);
    const emailDraftsUnlimited = isUnlimited(limits.emailDraftsPerMonth);
    const storageUnlimited = isUnlimited(limits.storageGb);

    const canStartMeeting = minutesUnlimited || remainingMinutes > 0;
    const canCreateEmailDraft =
      (limits.emailDraftsPerMonth > 0 || emailDraftsUnlimited) &&
      (emailDraftsUnlimited || remainingEmailDrafts > 0);

    const response: UsageResponse = {
      tier,
      usage: {
        minutesUsed,
        emailDraftsUsed,
        storageUsedBytes,
        storageUsedGb,
      },
      limits: {
        minutesPerMonth: limits.minutesPerMonth,
        emailDraftsPerMonth: limits.emailDraftsPerMonth,
        storageGb: limits.storageGb,
        historyDays: limits.historyDays,
      },
      remaining: {
        minutes: remainingMinutes,
        emailDrafts: remainingEmailDrafts,
        storageGb: remainingStorageGb,
        minutesUnlimited,
        emailDraftsUnlimited,
        storageUnlimited,
      },
      percentUsed: {
        minutes: minutesPercent,
        emailDrafts: emailDraftsPercent,
        storage: storagePercent,
      },
      period: {
        start: periodStart,
        end: periodEnd,
      },
      canStartMeeting,
      canCreateEmailDraft,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleAPIError(error);
  }
}
