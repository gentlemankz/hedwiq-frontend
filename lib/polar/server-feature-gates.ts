/**
 * Server-side Feature Gating
 *
 * Provides server-side utilities for enforcing feature access in API routes.
 * This ensures paid features cannot be accessed by bypassing the UI.
 *
 * @module lib/polar/server-feature-gates
 */

import { NextResponse } from "next/server";
import { hasFeature, getMinimumTier, getFeatureDisplayName, getTierDisplayName } from "@/lib/feature-gates";
import type { Feature } from "@/lib/feature-gates";
import type { SubscriptionTier } from "@/lib/polar/constants";
import { TIER_LIMITS, isUnlimited } from "@/lib/polar/constants";
import { getCustomerState } from "@/lib/polar/usage";
import { getSubscriptionFromCache, isCacheTooOld } from "@/lib/polar/subscription-cache";

// ============================================================================
// Types
// ============================================================================

export interface FeatureCheckResult {
  allowed: boolean;
  tier: SubscriptionTier;
  requiredTier: SubscriptionTier;
  reason?: string;
}

export interface UsageLimitCheckResult {
  allowed: boolean;
  tier: SubscriptionTier;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get user's subscription tier from Polar or cache.
 * Uses cache as fallback when Polar is unavailable.
 *
 * @param userId - The user's ID
 * @returns The user's subscription tier (defaults to "free" if unknown)
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  try {
    // Try to get from Polar (with cache fallback built-in)
    const customerState = await getCustomerState(userId);
    if (customerState) {
      return customerState.tier;
    }

    // Direct cache check as final fallback
    const cached = await getSubscriptionFromCache(userId);
    if (cached && !isCacheTooOld(cached)) {
      return cached.tier;
    }

    // Default to free tier if we can't determine
    return "free";
  } catch (error) {
    console.error("[ServerFeatureGates] Error getting user tier:", error);
    return "free";
  }
}

/**
 * Check if a user has access to a feature.
 * Server-side equivalent of the client-side useFeature hook.
 *
 * @param userId - The user's ID
 * @param feature - The feature to check access for
 * @returns FeatureCheckResult with allowed status and tier info
 */
export async function checkFeatureAccess(
  userId: string,
  feature: Feature
): Promise<FeatureCheckResult> {
  const tier = await getUserTier(userId);
  const allowed = hasFeature(tier, feature);
  const requiredTier = getMinimumTier(feature);

  return {
    allowed,
    tier,
    requiredTier,
    reason: allowed
      ? undefined
      : `${getFeatureDisplayName(feature)} requires ${getTierDisplayName(requiredTier)} plan`,
  };
}

/**
 * Check if user can create email drafts based on their tier and usage.
 *
 * @param userId - The user's ID
 * @returns UsageLimitCheckResult with allowed status and usage info
 */
export async function checkEmailDraftLimit(
  userId: string
): Promise<UsageLimitCheckResult> {
  try {
    const customerState = await getCustomerState(userId);

    if (!customerState) {
      // No customer state means free tier
      return {
        allowed: false,
        tier: "free",
        used: 0,
        limit: TIER_LIMITS.free.emailDraftsPerMonth,
        remaining: 0,
        reason: "Email drafts not included in Free plan",
      };
    }

    const { tier, emailDraftsUsed } = customerState;
    const limit = TIER_LIMITS[tier].emailDraftsPerMonth;

    // Free tier has no email drafts
    if (limit === 0) {
      return {
        allowed: false,
        tier,
        used: emailDraftsUsed,
        limit: 0,
        remaining: 0,
        reason: "Email drafts not included in current plan",
      };
    }

    // Check unlimited (enterprise)
    if (isUnlimited(limit)) {
      return {
        allowed: true,
        tier,
        used: emailDraftsUsed,
        limit: -1,
        remaining: -1,
      };
    }

    const remaining = Math.max(0, limit - emailDraftsUsed);
    const allowed = remaining > 0;

    return {
      allowed,
      tier,
      used: emailDraftsUsed,
      limit,
      remaining,
      reason: allowed ? undefined : "Monthly email draft limit reached",
    };
  } catch (error) {
    console.error("[ServerFeatureGates] Error checking email draft limit:", error);
    // Fail closed: deny when we can't verify
    return {
      allowed: false,
      tier: "free",
      used: 0,
      limit: 0,
      remaining: 0,
      reason: "Unable to verify usage limits. Please try again.",
    };
  }
}

/**
 * Check if user can upload documents based on their tier and storage usage.
 *
 * @param userId - The user's ID
 * @param additionalBytes - Optional bytes to check if this upload would exceed limit
 * @returns UsageLimitCheckResult with allowed status and storage info
 */
export async function checkStorageLimit(
  userId: string,
  additionalBytes: number = 0
): Promise<UsageLimitCheckResult> {
  try {
    const customerState = await getCustomerState(userId);

    if (!customerState) {
      // No customer state means free tier (0 storage)
      return {
        allowed: false,
        tier: "free",
        used: 0,
        limit: 0,
        remaining: 0,
        reason: "Document upload not included in Free plan",
      };
    }

    const { tier, storageUsedBytes } = customerState;
    const limitGb = TIER_LIMITS[tier].storageGb;

    // Free tier has no storage
    if (limitGb === 0) {
      return {
        allowed: false,
        tier,
        used: storageUsedBytes,
        limit: 0,
        remaining: 0,
        reason: "Document upload not included in current plan",
      };
    }

    // Check unlimited (enterprise)
    if (isUnlimited(limitGb)) {
      return {
        allowed: true,
        tier,
        used: storageUsedBytes,
        limit: -1,
        remaining: -1,
      };
    }

    const limitBytes = limitGb * 1024 * 1024 * 1024; // Convert GB to bytes
    const remaining = Math.max(0, limitBytes - storageUsedBytes);
    const allowed = remaining >= additionalBytes;

    return {
      allowed,
      tier,
      used: storageUsedBytes,
      limit: limitBytes,
      remaining,
      reason: allowed ? undefined : "Storage limit exceeded",
    };
  } catch (error) {
    console.error("[ServerFeatureGates] Error checking storage limit:", error);
    // Fail closed: deny when we can't verify
    return {
      allowed: false,
      tier: "free",
      used: 0,
      limit: 0,
      remaining: 0,
      reason: "Unable to verify storage limits. Please try again.",
    };
  }
}

// ============================================================================
// API Route Helpers
// ============================================================================

/**
 * Create a 403 Forbidden response for feature access denied.
 * Includes structured error data for clients to handle upgrade prompts.
 *
 * @param feature - The feature that was denied
 * @param result - The feature check result
 * @returns NextResponse with 403 status
 */
export function featureAccessDeniedResponse(
  feature: Feature,
  result: FeatureCheckResult
): NextResponse {
  return NextResponse.json(
    {
      error: "Feature not available",
      code: "FEATURE_NOT_AVAILABLE",
      feature,
      featureName: getFeatureDisplayName(feature),
      currentTier: result.tier,
      requiredTier: result.requiredTier,
      requiredTierName: getTierDisplayName(result.requiredTier),
      message: result.reason,
    },
    { status: 403 }
  );
}

/**
 * Create a 403 Forbidden response for usage limit exceeded.
 * Includes structured error data for clients to handle upgrade prompts.
 *
 * @param limitType - Type of limit exceeded (e.g., "email_drafts", "storage")
 * @param result - The usage limit check result
 * @returns NextResponse with 403 status
 */
export function usageLimitExceededResponse(
  limitType: "email_drafts" | "storage",
  result: UsageLimitCheckResult
): NextResponse {
  const displayNames = {
    email_drafts: "Email Drafts",
    storage: "Storage",
  };

  return NextResponse.json(
    {
      error: "Usage limit exceeded",
      code: "USAGE_LIMIT_EXCEEDED",
      limitType,
      limitName: displayNames[limitType],
      currentTier: result.tier,
      used: result.used,
      limit: result.limit,
      remaining: result.remaining,
      message: result.reason,
    },
    { status: 403 }
  );
}

/**
 * Higher-order function to wrap an API handler with feature gating.
 * Use this for simple feature checks without usage limits.
 *
 * @param feature - The feature required for this endpoint
 * @param handler - The actual handler function to execute if allowed
 * @returns Wrapped handler that checks feature access first
 *
 * @example
 * ```ts
 * export const POST = withFeatureGate("email_drafts", async (request, session) => {
 *   // Handler code here - only runs if user has email_drafts feature
 * });
 * ```
 */
export function withFeatureGate<T>(
  feature: Feature,
  handler: (userId: string) => Promise<NextResponse<T>>
) {
  return async (userId: string): Promise<NextResponse<T | unknown>> => {
    const result = await checkFeatureAccess(userId, feature);

    if (!result.allowed) {
      return featureAccessDeniedResponse(feature, result);
    }

    return handler(userId);
  };
}
