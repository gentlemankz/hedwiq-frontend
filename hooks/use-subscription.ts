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

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  useSubscriptionContext,
  useSubscriptionOptional,
  TIER_LIMITS,
  isUnlimitedMinutes,
  type SubscriptionTier,
  type SubscriptionState,
};

// ============================================================================
// Feature Types
// ============================================================================

export type Feature =
  | "transcription"
  | "insights"
  | "notes"
  | "actions"
  | "agenda_tracking"
  | "recordings"
  | "email_drafts"
  | "teams"
  | "unlimited_meetings"
  | "extended_history"
  | "increased_storage";

// ============================================================================
// Feature Tier Requirements
// ============================================================================

/**
 * Maps features to the tiers that have access to them
 */
const FEATURE_TIERS: Record<Feature, SubscriptionTier[]> = {
  transcription: ["free", "pro", "business", "enterprise"],
  insights: ["free", "pro", "business", "enterprise"],
  notes: ["free", "pro", "business", "enterprise"],
  actions: ["pro", "business", "enterprise"],
  agenda_tracking: ["pro", "business", "enterprise"],
  recordings: ["pro", "business", "enterprise"],
  email_drafts: ["pro", "business", "enterprise"],
  teams: ["pro", "business", "enterprise"],
  unlimited_meetings: ["business", "enterprise"],
  extended_history: ["pro", "business", "enterprise"],
  increased_storage: ["business", "enterprise"],
};

/**
 * Get the minimum tier required for a feature
 */
export function getMinimumTierForFeature(feature: Feature): SubscriptionTier {
  const tiers = FEATURE_TIERS[feature];
  // Return the first (lowest) tier that has access
  if (tiers.includes("free")) return "free";
  if (tiers.includes("pro")) return "pro";
  if (tiers.includes("business")) return "business";
  return "enterprise";
}

/**
 * Check if a tier has access to a feature
 */
export function hasFeatureAccess(tier: SubscriptionTier, feature: Feature): boolean {
  return FEATURE_TIERS[feature]?.includes(tier) ?? false;
}

// ============================================================================
// Feature Hook
// ============================================================================

interface UseFeatureResult {
  /** Whether the feature is enabled for the current tier */
  enabled: boolean;
  /** The user's current subscription tier */
  tier: SubscriptionTier;
  /** Whether the user needs to upgrade to access this feature */
  requiresUpgrade: boolean;
  /** The minimum tier required to access this feature */
  requiredTier: SubscriptionTier;
  /** Function to prompt the user to upgrade */
  promptUpgrade: () => Promise<void>;
}

/**
 * Hook to check if a feature is available for the current subscription
 *
 * @example
 * ```tsx
 * const { enabled, requiresUpgrade, promptUpgrade } = useFeature("email_drafts");
 *
 * if (!enabled) {
 *   return <FeatureLockedCard onUpgrade={promptUpgrade} />;
 * }
 * ```
 */
export function useFeature(feature: Feature): UseFeatureResult {
  const { tier, openCheckout } = useSubscriptionContext();

  const enabled = useMemo(() => hasFeatureAccess(tier, feature), [tier, feature]);
  const requiredTier = useMemo(() => getMinimumTierForFeature(feature), [feature]);

  const promptUpgrade = useCallback(async () => {
    // Default to the minimum required tier with annual billing for best value
    const slug = requiredTier === "pro" ? "pro-annual" : "business-annual";
    await openCheckout(slug);
  }, [openCheckout, requiredTier]);

  return {
    enabled,
    tier,
    requiresUpgrade: !enabled,
    requiredTier,
    promptUpgrade,
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
