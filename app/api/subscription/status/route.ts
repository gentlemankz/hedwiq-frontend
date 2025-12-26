/**
 * Subscription Status API
 *
 * GET /api/subscription/status
 * Returns the current user's subscription status, tier, and limits.
 *
 * Authentication: User session required
 *
 * Response:
 * - tier: "free" | "pro" | "business" | "enterprise"
 * - status: "active" | "trialing" | "canceled" | "past_due" | "none"
 * - billingInterval: "month" | "year" | null
 * - subscription: Subscription details if active
 * - limits: Current tier's usage limits
 * - cancelAtPeriodEnd: Whether subscription is set to cancel
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, polarClient } from "@/lib/auth";
import { handleAPIError, unauthorized } from "@/lib/api";
import {
  TIER_LIMITS,
  getTierFromProductId,
  getIntervalFromProductId,
  isPastDueWithinGrace,
  type SubscriptionTier,
  type BillingInterval,
} from "@/lib/polar/constants";
import { getPolarCustomer } from "@/lib/polar/usage";
import { getSubscriptionFromCache, isCacheTooOld } from "@/lib/polar/subscription-cache";

// ============================================================================
// Types
// ============================================================================

interface SubscriptionStatusResponse {
  tier: SubscriptionTier;
  status: "active" | "trialing" | "canceled" | "past_due" | "none";
  billingInterval: BillingInterval | null;
  subscription: {
    id: string;
    productId: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  limits: {
    minutesPerMonth: number;
    storageGb: number;
    historyDays: number;
    emailDraftsPerMonth: number;
  };
  customer: {
    id: string;
    polarCustomerId: string | null;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapSubscriptionStatus(
  status: string | undefined
): SubscriptionStatusResponse["status"] {
  if (!status) return "none";

  const normalizedStatus = status.toLowerCase();
  switch (normalizedStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    default:
      return "none";
  }
}

function buildResponseFromCache(
  cached: Awaited<ReturnType<typeof getSubscriptionFromCache>>,
  userId: string
): SubscriptionStatusResponse | null {
  if (!cached) return null;
  if (isCacheTooOld(cached)) return null;

  const pastDueOutOfGrace =
    cached.status === "past_due" && !isPastDueWithinGrace(cached.currentPeriodEnd);
  const tier = pastDueOutOfGrace ? "free" : cached.tier;

  return {
    tier,
    status: pastDueOutOfGrace ? "past_due" : cached.status,
    billingInterval: cached.billingInterval,
    subscription: {
      id: cached.polarSubscriptionId || "cached",
      productId: cached.polarSubscriptionId || "cached",
      status: cached.status,
      currentPeriodStart: cached.lastSyncedAt ? cached.lastSyncedAt.toISOString() : null,
      currentPeriodEnd: cached.currentPeriodEnd ? cached.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: cached.cancelAtPeriodEnd,
    },
    limits: cached.limits,
    customer: {
      id: userId,
      polarCustomerId: cached.polarCustomerId,
    },
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

    // If Polar is not configured, return cached data or free tier
    if (!polarClient) {
      const cached = await getSubscriptionFromCache(userId);
      const cachedResponse = buildResponseFromCache(cached, userId);
      if (cachedResponse) return NextResponse.json(cachedResponse);

      return NextResponse.json({
        tier: "free",
        status: "none",
        billingInterval: null,
        subscription: null,
        limits: TIER_LIMITS.free,
        customer: {
          id: userId,
          polarCustomerId: null,
        },
      });
    }

    // Get customer from Polar using shared utility
    let polarCustomer;
    try {
      ({ customer: polarCustomer } = await getPolarCustomer(userId));
    } catch (error) {
      console.error("[Subscription Status] Polar customer lookup failed, checking cache:", error);
      const cached = await getSubscriptionFromCache(userId);
      const cachedResponse = buildResponseFromCache(cached, userId);
      if (cachedResponse) return NextResponse.json(cachedResponse);
      return NextResponse.json({
        tier: "free",
        status: "none",
        billingInterval: null,
        subscription: null,
        limits: TIER_LIMITS.free,
        customer: {
          id: userId,
          polarCustomerId: null,
        },
      });
    }

    // Customer may not exist in Polar yet (hasn't subscribed)
    if (!polarCustomer) {
      const response: SubscriptionStatusResponse = {
        tier: "free",
        status: "none",
        billingInterval: null,
        subscription: null,
        limits: TIER_LIMITS.free,
        customer: {
          id: userId,
          polarCustomerId: null,
        },
      };
      return NextResponse.json(response);
    }

    // Get active subscriptions
    let subscriptions;
    try {
      subscriptions = await polarClient.subscriptions.list({
        customerId: polarCustomer.id,
        active: true,
      });
    } catch (error) {
      console.error("[Subscription Status] Polar subscription fetch failed, checking cache:", error);
      const cached = await getSubscriptionFromCache(userId);
      const cachedResponse = buildResponseFromCache(cached, userId);
      if (cachedResponse) return NextResponse.json(cachedResponse);
      return NextResponse.json({
        tier: "free",
        status: "none",
        billingInterval: null,
        subscription: null,
        limits: TIER_LIMITS.free,
        customer: {
          id: userId,
          polarCustomerId: null,
        },
      });
    }

    // Find the active subscription
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

    // Build response
    if (activeSubscription) {
      // Determine tier - downgrade to free if past_due is beyond grace period
      let tier: SubscriptionTier;
      if (activeSubscription.status === "past_due" && !isPastDueWithinGrace(activeSubscription.currentPeriodEnd)) {
        tier = "free"; // Past grace period
      } else {
        tier = getTierFromProductId(activeSubscription.productId);
      }
      const billingInterval = getIntervalFromProductId(activeSubscription.productId);

      const response: SubscriptionStatusResponse = {
        tier,
        status: mapSubscriptionStatus(activeSubscription.status),
        billingInterval,
        subscription: {
          id: activeSubscription.id,
          productId: activeSubscription.productId,
          status: activeSubscription.status,
          currentPeriodStart: activeSubscription.currentPeriodStart
            ? new Date(activeSubscription.currentPeriodStart).toISOString()
            : null,
          currentPeriodEnd: activeSubscription.currentPeriodEnd
            ? new Date(activeSubscription.currentPeriodEnd).toISOString()
            : null,
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd || false,
        },
        limits: TIER_LIMITS[tier],
        customer: {
          id: userId,
          polarCustomerId: polarCustomer.id,
        },
      };
      return NextResponse.json(response);
    }

    // No active subscription - free tier
    const response: SubscriptionStatusResponse = {
      tier: "free",
      status: "none",
      billingInterval: null,
      subscription: null,
      limits: TIER_LIMITS.free,
      customer: {
        id: userId,
        polarCustomerId: polarCustomer.id,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    return handleAPIError(error);
  }
}
