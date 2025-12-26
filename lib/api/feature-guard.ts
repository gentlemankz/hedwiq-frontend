/**
 * Server-side Feature Gating
 *
 * Middleware and helper functions for API route feature access control.
 * Use these to protect API routes that require specific subscription tiers.
 *
 * @module lib/api/feature-guard
 */

import { headers } from "next/headers";
import { auth, polarClient } from "@/lib/auth";
import {
  type Feature,
  hasFeature,
  getMinimumTier,
  getFeatureDisplayName,
  getTierDisplayName,
  TIER_HIERARCHY,
} from "@/lib/feature-gates";
import {
  getTierFromProductId,
  type SubscriptionTier,
  UNLIMITED_THRESHOLD,
} from "@/lib/polar/constants";
import {
  APIError,
  ErrorCodes,
  featureLocked,
  unauthorized,
  quotaExceeded,
} from "./errors";

// ============================================================================
// Types
// ============================================================================

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  status: "active" | "trialing" | "canceled" | "past_due" | "none";
  productId: string | null;
}

export interface FeatureGuardResult {
  allowed: boolean;
  subscription: UserSubscription;
  error?: APIError;
}

export interface UsageCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  error?: APIError;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the current user's subscription status from Polar.
 *
 * @returns User subscription info or null if not authenticated
 *
 * @example
 * ```ts
 * const subscription = await getUserSubscription();
 * if (!subscription) {
 *   return unauthorized().toResponse();
 * }
 * console.log(subscription.tier); // "free", "pro", "business", etc.
 * ```
 */
export async function getUserSubscription(): Promise<UserSubscription | null> {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    // If Polar is not configured, assume free tier
    if (!polarClient) {
      return {
        userId: session.user.id,
        tier: "free",
        status: "none",
        productId: null,
      };
    }

    // Get customer state from Polar
    try {
      const customerState = await polarClient.customers.getStateExternal({
        externalId: session.user.id,
      });

      // Find active subscription
      const activeSubscription = customerState.activeSubscriptions?.find(
        (sub) => sub.status === "active" || sub.status === "trialing"
      );

      if (activeSubscription) {
        return {
          userId: session.user.id,
          tier: getTierFromProductId(activeSubscription.productId),
          status: activeSubscription.status as UserSubscription["status"],
          productId: activeSubscription.productId ?? null,
        };
      }

      // No active subscription = free tier
      return {
        userId: session.user.id,
        tier: "free",
        status: "none",
        productId: null,
      };
    } catch (polarError) {
      // If Polar fails, log and default to free tier
      console.error("[FeatureGuard] Polar API error:", polarError);
      return {
        userId: session.user.id,
        tier: "free",
        status: "none",
        productId: null,
      };
    }
  } catch (error) {
    console.error("[FeatureGuard] Error getting user subscription:", error);
    return null;
  }
}

/**
 * Check if the current user has access to a specific feature.
 *
 * @param feature - The feature to check access for
 * @returns Result object with allowed status and subscription info
 *
 * @example
 * ```ts
 * const result = await checkFeatureAccess("email_drafts");
 * if (!result.allowed) {
 *   return result.error!.toResponse();
 * }
 * // User has access, continue...
 * ```
 */
export async function checkFeatureAccess(feature: Feature): Promise<FeatureGuardResult> {
  const subscription = await getUserSubscription();

  if (!subscription) {
    return {
      allowed: false,
      subscription: {
        userId: "",
        tier: "free",
        status: "none",
        productId: null,
      },
      error: unauthorized("Authentication required to access this feature"),
    };
  }

  const allowed = hasFeature(subscription.tier, feature);

  if (!allowed) {
    const requiredTier = getMinimumTier(feature);
    const featureName = getFeatureDisplayName(feature);
    const tierName = getTierDisplayName(requiredTier);

    return {
      allowed: false,
      subscription,
      error: featureLocked(feature, tierName, featureName),
    };
  }

  return {
    allowed: true,
    subscription,
  };
}

/**
 * Require a feature to be available for the current user.
 * Throws an APIError if the feature is not available.
 *
 * @param feature - The feature to require
 * @throws {APIError} If user is not authenticated or doesn't have access
 * @returns User subscription info if access is granted
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   try {
 *     const subscription = await requireFeature("email_drafts");
 *
 *     // User has access, continue with the request...
 *     const data = await request.json();
 *     // ...
 *   } catch (error) {
 *     return handleAPIError(error);
 *   }
 * }
 * ```
 */
export async function requireFeature(feature: Feature): Promise<UserSubscription> {
  const result = await checkFeatureAccess(feature);

  if (!result.allowed) {
    // Defensive check: ensure error exists before throwing
    if (!result.error) {
      throw new APIError(
        "Feature access denied",
        403,
        ErrorCodes.FEATURE_LOCKED
      );
    }
    throw result.error;
  }

  return result.subscription;
}

/**
 * Require the user to be authenticated.
 * Throws an APIError if not authenticated.
 *
 * @throws {APIError} If user is not authenticated
 * @returns User subscription info
 *
 * @example
 * ```ts
 * export async function GET(request: Request) {
 *   try {
 *     const subscription = await requireAuth();
 *     // User is authenticated...
 *   } catch (error) {
 *     return handleAPIError(error);
 *   }
 * }
 * ```
 */
export async function requireAuth(): Promise<UserSubscription> {
  const subscription = await getUserSubscription();

  if (!subscription) {
    throw unauthorized();
  }

  return subscription;
}

/**
 * Require a minimum subscription tier.
 * Throws an APIError if tier requirement is not met.
 *
 * @param minimumTier - The minimum tier required
 * @throws {APIError} If user doesn't meet the tier requirement
 * @returns User subscription info
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   try {
 *     const subscription = await requireTier("pro");
 *     // User is Pro or higher...
 *   } catch (error) {
 *     return handleAPIError(error);
 *   }
 * }
 * ```
 */
export async function requireTier(minimumTier: SubscriptionTier): Promise<UserSubscription> {
  const subscription = await requireAuth();

  // Use centralized tier hierarchy from feature-gates
  const userTierIndex = TIER_HIERARCHY.indexOf(subscription.tier);
  const requiredTierIndex = TIER_HIERARCHY.indexOf(minimumTier);

  if (userTierIndex < requiredTierIndex) {
    const tierName = getTierDisplayName(minimumTier);
    throw new APIError(
      `This action requires ${tierName} plan or higher`,
      403,
      ErrorCodes.FEATURE_LOCKED,
      {
        requiredTier: minimumTier,
        suggestion: `Upgrade to ${tierName} to access this feature`,
      }
    );
  }

  return subscription;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * In development, allow softer degradation when Polar isn't configured.
 * In production, always fail closed for security.
 */
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/**
 * Environment flag to bypass usage checks in development.
 * Set BYPASS_USAGE_CHECKS=true in .env.local for local testing without Polar.
 */
const BYPASS_USAGE_CHECKS = process.env.BYPASS_USAGE_CHECKS === "true";

// ============================================================================
// Usage Checking (for quota-based features)
// ============================================================================

/**
 * Check if user has remaining quota for a usage-based feature.
 * Note: This requires the usage meters to be set up in Polar.
 *
 * Failure modes:
 * - Production: Fail closed on any error (503)
 * - Development with BYPASS_USAGE_CHECKS=true: Allow with free tier limits
 * - Development without bypass: Fail closed (same as production)
 *
 * @param meterSlug - The Polar meter slug (e.g., "meeting-minutes", "email-drafts")
 * @param limit - The limit for this tier
 * @returns Usage check result
 *
 * @example
 * ```ts
 * const usage = await checkUsageQuota("email-drafts", 300);
 * if (!usage.allowed) {
 *   return usage.error!.toResponse();
 * }
 * console.log(`${usage.remaining} drafts remaining`);
 * ```
 */
export async function checkUsageQuota(
  meterSlug: string,
  limit: number
): Promise<UsageCheckResult> {
  const subscription = await getUserSubscription();

  if (!subscription) {
    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      error: unauthorized(),
    };
  }

  // Unlimited for certain tiers (use imported constant)
  if (limit >= UNLIMITED_THRESHOLD) {
    return {
      allowed: true,
      currentUsage: 0,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
    };
  }

  // Handle Polar not configured
  if (!polarClient) {
    // In development with bypass enabled, allow with the provided limit
    if (IS_DEVELOPMENT && BYPASS_USAGE_CHECKS) {
      console.warn(
        `[FeatureGuard] Polar not configured, allowing ${meterSlug} with limit ${limit} (dev bypass)`
      );
      return {
        allowed: true,
        currentUsage: 0,
        limit,
        remaining: limit,
      };
    }

    // FAIL CLOSED in production or without explicit bypass
    console.error(
      `[FeatureGuard] Polar not configured. Set BYPASS_USAGE_CHECKS=true in development to bypass.`
    );
    return {
      allowed: false,
      currentUsage: 0,
      limit,
      remaining: 0,
      error: new APIError(
        "Unable to verify usage quota - service unavailable",
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        { suggestion: "Please try again in a few moments" }
      ),
    };
  }

  try {
    // First get the customer by external ID
    const customer = await polarClient.customers.getExternal({
      externalId: subscription.userId,
    });

    if (!customer) {
      // New customer without Polar record - allow (no usage yet)
      return {
        allowed: true,
        currentUsage: 0,
        limit,
        remaining: limit,
      };
    }

    // Get customer meters
    const meters = await polarClient.customerMeters.list({
      customerId: customer.id,
    });

    // STRICT MATCHING: Use exact slug match instead of loose substring
    const meter = meters.result.items?.find((m) => m.meter?.slug === meterSlug);

    if (!meter) {
      // FAIL CLOSED: Meter not found could be misconfiguration or slug mismatch
      // Don't allow unmetered usage - treat as quota exhausted
      console.error(
        `[FeatureGuard] Meter '${meterSlug}' not found for user ${subscription.userId}. ` +
        `This could indicate a misconfigured meter slug. Denying access.`
      );
      return {
        allowed: false,
        currentUsage: 0,
        limit,
        remaining: 0,
        error: new APIError(
          "Usage tracking unavailable - please contact support",
          503,
          ErrorCodes.SERVICE_UNAVAILABLE,
          {
            shouldLog: true,
            suggestion: "If this persists, please contact support",
            details: { meterSlug }, // Include for debugging
          }
        ),
      };
    }

    const currentUsage = meter.consumedUnits ?? 0;
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = remaining > 0;

    if (!allowed) {
      return {
        allowed: false,
        currentUsage,
        limit,
        remaining: 0,
        error: quotaExceeded(
          meterSlug.replace(/-/g, " "), // Replace all hyphens for display
          limit,
          currentUsage
        ),
      };
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      remaining,
    };
  } catch (error) {
    console.error(`[FeatureGuard] Failed to get usage for ${meterSlug}:`, error);

    // FAIL CLOSED on API errors - do not allow usage when we can't verify quota
    return {
      allowed: false,
      currentUsage: 0,
      limit,
      remaining: 0,
      error: new APIError(
        "Unable to verify usage quota",
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        { shouldLog: true, suggestion: "Please try again in a few moments" }
      ),
    };
  }
}

/**
 * Require the user to have remaining quota for a usage-based feature.
 * Throws an APIError if quota is exceeded.
 *
 * @param meterSlug - The Polar meter slug
 * @param limit - The limit for this tier
 * @throws {APIError} If quota is exceeded
 * @returns Usage info
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   try {
 *     const subscription = await requireFeature("email_drafts");
 *     const { remaining } = await requireUsageQuota("email-drafts", 300);
 *
 *     // Create the draft...
 *   } catch (error) {
 *     return handleAPIError(error);
 *   }
 * }
 * ```
 */
export async function requireUsageQuota(
  meterSlug: string,
  limit: number
): Promise<UsageCheckResult> {
  const result = await checkUsageQuota(meterSlug, limit);

  if (!result.allowed) {
    // Defensive check: ensure error exists before throwing
    if (!result.error) {
      throw new APIError(
        "Usage quota check failed",
        403,
        ErrorCodes.QUOTA_EXCEEDED
      );
    }
    throw result.error;
  }

  return result;
}

// ============================================================================
// Convenience wrapper for API routes
// ============================================================================

/**
 * Higher-order function to wrap an API handler with feature gating.
 *
 * @param feature - The feature required for this endpoint
 * @param handler - The actual handler function
 * @returns Wrapped handler that checks feature access first
 *
 * @example
 * ```ts
 * import { withFeatureGuard, handleAPIError } from "@/lib/api";
 *
 * export const POST = withFeatureGuard("email_drafts", async (request, subscription) => {
 *   // subscription is guaranteed to have access
 *   const data = await request.json();
 *   // ...
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withFeatureGuard<T>(
  feature: Feature,
  handler: (request: Request, subscription: UserSubscription) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const result = await checkFeatureAccess(feature);

    if (!result.allowed) {
      // Defensive check: ensure error exists before calling toResponse
      if (!result.error) {
        return new APIError(
          "Feature access denied",
          403,
          ErrorCodes.FEATURE_LOCKED
        ).toResponse();
      }
      return result.error.toResponse();
    }

    return handler(request, result.subscription);
  };
}
