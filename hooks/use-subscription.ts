"use client";

import { useCallback, useMemo } from "react";
import {
  useSubscriptionContext,
  useSubscriptionOptional,
  type SubscriptionTier,
  type SubscriptionState,
  TIER_LIMITS,
  isUnlimitedMinutes,
} from "@/contexts/subscription-context";

// Import feature gating logic from lib (pure functions, server-compatible)
import {
  type Feature,
  hasFeature,
  getMinimumTier,
  getFeatureDisplayName,
  getFeatureDescription,
  getFeaturesForTier,
  getLockedFeatures,
  isTierHigher,
  isTierAtLeast,
  getTierDisplayName,
  getUpgradeSlug,
  FEATURE_TIERS,
  TIER_HIERARCHY,
} from "@/lib/feature-gates";

// ============================================================================
// Re-exports for convenience
// ============================================================================

// From subscription context
export {
  useSubscriptionContext,
  useSubscriptionOptional,
  TIER_LIMITS,
  isUnlimitedMinutes,
  type SubscriptionTier,
  type SubscriptionState,
};

// From feature-gates (pure functions)
export {
  type Feature,
  hasFeature,
  getMinimumTier,
  getFeatureDisplayName,
  getFeatureDescription,
  getFeaturesForTier,
  getLockedFeatures,
  isTierHigher,
  isTierAtLeast,
  getTierDisplayName,
  getUpgradeSlug,
  FEATURE_TIERS,
  TIER_HIERARCHY,
};

// Legacy aliases for backward compatibility
export const getMinimumTierForFeature = getMinimumTier;
export const hasFeatureAccess = hasFeature;

// ============================================================================
// Feature Hook
// ============================================================================

export interface UseFeatureResult {
  /** Whether the feature is enabled for the current tier */
  enabled: boolean;
  /** The raw feature identifier passed to the hook */
  feature: Feature;
  /** The user's current subscription tier */
  tier: SubscriptionTier;
  /** Whether the user needs to upgrade to access this feature */
  requiresUpgrade: boolean;
  /** The minimum tier required to access this feature */
  requiredTier: SubscriptionTier;
  /** Human-readable name of the required tier */
  requiredTierName: string;
  /** Human-readable display name of the feature (e.g., "Email Drafts") */
  featureName: string;
  /** Description of the feature */
  featureDescription: string;
  /** Function to prompt the user to upgrade */
  promptUpgrade: () => Promise<void>;
  /** Whether the subscription data is still loading */
  isLoading: boolean;
  /** Error message if subscription loading failed */
  error: string | null;
}

/**
 * Hook to check if a feature is available for the current subscription.
 *
 * Uses pure feature-gating logic from @/lib/feature-gates.
 *
 * @example
 * ```tsx
 * const { enabled, feature, promptUpgrade, featureName } = useFeature("email_drafts");
 *
 * if (!enabled) {
 *   return (
 *     <FeatureLockedCard
 *       feature={feature}        // Raw feature identifier for component props
 *       onUpgrade={promptUpgrade}
 *     />
 *   );
 * }
 *
 * // featureName is the display string: "Email Drafts"
 * // feature is the raw identifier: "email_drafts"
 * ```
 */
export function useFeature(feature: Feature): UseFeatureResult {
  const { tier, openCheckout, isLoading, error } = useSubscriptionContext();

  const enabled = useMemo(() => hasFeature(tier, feature), [tier, feature]);
  const requiredTier = useMemo(() => getMinimumTier(feature), [feature]);
  const requiredTierName = useMemo(() => getTierDisplayName(requiredTier), [requiredTier]);
  const featureName = useMemo(() => getFeatureDisplayName(feature), [feature]);
  const featureDescription = useMemo(() => getFeatureDescription(feature), [feature]);

  const promptUpgrade = useCallback(async () => {
    // Use the upgrade slug helper for consistent behavior
    const slug = getUpgradeSlug(requiredTier, true); // preferAnnual = true
    await openCheckout(slug);
  }, [openCheckout, requiredTier]);

  return {
    enabled,
    feature,
    tier,
    requiresUpgrade: !enabled,
    requiredTier,
    requiredTierName,
    featureName,
    featureDescription,
    promptUpgrade,
    isLoading,
    error,
  };
}

// ============================================================================
// Subscription Status Helpers
// ============================================================================

/**
 * Hook to get formatted subscription status for display
 */
export function useSubscriptionStatus() {
  const subscription = useSubscriptionContext();

  const statusText = useMemo(() => {
    if (subscription.isLoading) return "Loading...";

    switch (subscription.status) {
      case "active":
        return "Active";
      case "trialing":
        return "Trial";
      case "canceled":
        return subscription.subscription?.cancelAtPeriodEnd ? "Canceling" : "Canceled";
      case "past_due":
        return "Past Due";
      default:
        return "Free";
    }
  }, [subscription.isLoading, subscription.status, subscription.subscription?.cancelAtPeriodEnd]);

  const periodEndText = useMemo(() => {
    const endDate = subscription.subscription?.currentPeriodEnd;
    if (!endDate) return null;

    const now = new Date();
    const daysRemaining = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysRemaining < 0) return "Expired";
    if (daysRemaining === 0) return "Ends today";
    if (daysRemaining === 1) return "Ends tomorrow";
    if (daysRemaining <= 7) return `Ends in ${daysRemaining} days`;

    return `Renews ${endDate.toLocaleDateString()}`;
  }, [subscription.subscription?.currentPeriodEnd]);

  return {
    ...subscription,
    statusText,
    periodEndText,
  };
}

// ============================================================================
// Usage Helpers
// ============================================================================

interface UseUsageWarningResult {
  showWarning: boolean;
  showCritical: boolean;
  percentage: number;
  tier: SubscriptionTier;
  remainingMinutes: number;
}

/**
 * Hook to check if user is approaching their usage limit
 */
export function useUsageWarning(
  warningThreshold = 80,
  criticalThreshold = 95
): UseUsageWarningResult {
  const { tier, usage, limits, getUsagePercentage } = useSubscriptionContext();
  const percentage = getUsagePercentage();

  // Business and Enterprise have unlimited minutes
  if (isUnlimitedMinutes(limits.minutesPerMonth)) {
    return {
      showWarning: false,
      showCritical: false,
      percentage: 0,
      tier,
      remainingMinutes: Number.MAX_SAFE_INTEGER,
    };
  }

  return {
    showWarning: percentage >= warningThreshold && percentage < criticalThreshold,
    showCritical: percentage >= criticalThreshold,
    percentage,
    tier,
    remainingMinutes: Math.max(0, limits.minutesPerMonth - usage.minutesUsed),
  };
}

// ============================================================================
// Upgrade Helpers
// ============================================================================

interface UpgradeRecommendation {
  slug: string;
  tier: SubscriptionTier;
}

/**
 * Get recommended upgrade product based on current tier
 */
export function getRecommendedUpgrade(
  currentTier: SubscriptionTier,
  preferAnnual = true
): UpgradeRecommendation | null {
  switch (currentTier) {
    case "free":
      return { slug: preferAnnual ? "pro-annual" : "pro", tier: "pro" };
    case "pro":
      return { slug: preferAnnual ? "business-annual" : "business", tier: "business" };
    case "business":
    case "enterprise":
      return null; // Already at top tier
    default:
      return { slug: preferAnnual ? "pro-annual" : "pro", tier: "pro" };
  }
}

interface UseUpgradeRecommendationResult {
  currentTier: SubscriptionTier;
  canUpgrade: boolean;
  recommendedTier: SubscriptionTier | null;
  recommendedSlug: string | null;
  upgrade: () => Promise<void>;
}

/**
 * Hook to get upgrade recommendations
 */
export function useUpgradeRecommendation(preferAnnual = true): UseUpgradeRecommendationResult {
  const { tier, openCheckout } = useSubscriptionContext();
  const recommendation = useMemo(
    () => getRecommendedUpgrade(tier, preferAnnual),
    [tier, preferAnnual]
  );

  const upgrade = useCallback(async () => {
    if (recommendation) {
      await openCheckout(recommendation.slug);
    }
  }, [openCheckout, recommendation]);

  return {
    currentTier: tier,
    canUpgrade: recommendation !== null,
    recommendedTier: recommendation?.tier ?? null,
    recommendedSlug: recommendation?.slug ?? null,
    upgrade,
  };
}
