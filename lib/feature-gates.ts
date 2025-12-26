/**
 * Feature Gating Logic
 *
 * Pure functions for feature access control based on subscription tiers.
 * This module can be used on both client and server sides.
 *
 * @module lib/feature-gates
 */

import { type SubscriptionTier } from "@/lib/polar/constants";

// ============================================================================
// Feature Types
// ============================================================================

/**
 * All gated features in the application.
 * Features map to specific subscription tiers.
 */
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
  | "increased_storage"
  | "document_upload";

// ============================================================================
// Feature Tier Requirements
// ============================================================================

/**
 * Maps features to the tiers that have access to them.
 * Order matters: tiers are listed from lowest to highest.
 */
const FEATURE_TIERS: Record<Feature, SubscriptionTier[]> = {
  // Free tier features (available to all users)
  transcription: ["free", "pro", "business", "enterprise"],
  insights: ["free", "pro", "business", "enterprise"],
  notes: ["free", "pro", "business", "enterprise"],

  // Pro tier features (requires Pro or higher)
  actions: ["pro", "business", "enterprise"],
  agenda_tracking: ["pro", "business", "enterprise"],
  recordings: ["pro", "business", "enterprise"],
  email_drafts: ["pro", "business", "enterprise"],
  teams: ["pro", "business", "enterprise"],
  extended_history: ["pro", "business", "enterprise"],
  document_upload: ["pro", "business", "enterprise"],

  // Business tier features (requires Business or higher)
  unlimited_meetings: ["business", "enterprise"],
  increased_storage: ["business", "enterprise"],
};

/**
 * Tier hierarchy for comparison operations (lower index = lower tier)
 */
const TIER_HIERARCHY: SubscriptionTier[] = ["free", "pro", "business", "enterprise"];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check if a tier has access to a specific feature.
 *
 * @param tier - The user's subscription tier
 * @param feature - The feature to check access for
 * @returns true if the tier has access to the feature
 *
 * @example
 * ```ts
 * hasFeature("free", "transcription") // true
 * hasFeature("free", "email_drafts")  // false
 * hasFeature("pro", "email_drafts")   // true
 * ```
 */
export function hasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  const allowedTiers = FEATURE_TIERS[feature];
  return allowedTiers?.includes(tier) ?? false;
}

/**
 * Get the minimum tier required to access a feature.
 *
 * @param feature - The feature to check
 * @returns The minimum subscription tier required
 *
 * @example
 * ```ts
 * getMinimumTier("transcription")     // "free"
 * getMinimumTier("email_drafts")      // "pro"
 * getMinimumTier("unlimited_meetings") // "business"
 * ```
 */
export function getMinimumTier(feature: Feature): SubscriptionTier {
  const tiers = FEATURE_TIERS[feature];

  // Return the first (lowest) tier that has access
  for (const tier of TIER_HIERARCHY) {
    if (tiers?.includes(tier)) {
      return tier;
    }
  }

  // Fallback to enterprise if not found (shouldn't happen)
  return "enterprise";
}

/**
 * Get the display name for a feature.
 *
 * @param feature - The feature to get the name for
 * @returns Human-readable feature name
 */
export function getFeatureDisplayName(feature: Feature): string {
  const displayNames: Record<Feature, string> = {
    transcription: "Transcription",
    insights: "AI Insights",
    notes: "Meeting Notes",
    actions: "Action Items",
    agenda_tracking: "Agenda Tracking",
    recordings: "Recordings",
    email_drafts: "Email Drafts",
    teams: "Teams",
    unlimited_meetings: "Unlimited Meetings",
    extended_history: "Extended History",
    increased_storage: "Increased Storage",
    document_upload: "Document Upload",
  };

  return displayNames[feature] ?? feature;
}

/**
 * Get the description for a feature.
 *
 * @param feature - The feature to get the description for
 * @returns Human-readable feature description
 */
export function getFeatureDescription(feature: Feature): string {
  const descriptions: Record<Feature, string> = {
    transcription: "Real-time meeting transcription powered by AI",
    insights: "AI-generated insights and key points from your meetings",
    notes: "Collaborative meeting notes with rich formatting",
    actions: "Track and manage action items from your meetings",
    agenda_tracking: "Track agenda progress during meetings",
    recordings: "Record and replay your meetings",
    email_drafts: "AI-generated email drafts from meeting discussions",
    teams: "Collaborate with your team on meetings",
    unlimited_meetings: "No limits on meeting duration or count",
    extended_history: "Access your meeting history for longer",
    increased_storage: "More storage for recordings and documents",
    document_upload: "Upload and reference documents during meetings",
  };

  return descriptions[feature] ?? "";
}

/**
 * Get all features available at a specific tier.
 *
 * @param tier - The subscription tier
 * @returns Array of features available at this tier
 */
export function getFeaturesForTier(tier: SubscriptionTier): Feature[] {
  return (Object.keys(FEATURE_TIERS) as Feature[]).filter((feature) =>
    FEATURE_TIERS[feature].includes(tier)
  );
}

/**
 * Get all features that require upgrade from current tier.
 *
 * @param currentTier - The user's current subscription tier
 * @returns Array of features that require upgrade
 */
export function getLockedFeatures(currentTier: SubscriptionTier): Feature[] {
  return (Object.keys(FEATURE_TIERS) as Feature[]).filter(
    (feature) => !FEATURE_TIERS[feature].includes(currentTier)
  );
}

/**
 * Compare two tiers and determine if tier1 is higher than tier2.
 *
 * @param tier1 - First tier to compare
 * @param tier2 - Second tier to compare
 * @returns true if tier1 is higher than tier2
 */
export function isTierHigher(tier1: SubscriptionTier, tier2: SubscriptionTier): boolean {
  return TIER_HIERARCHY.indexOf(tier1) > TIER_HIERARCHY.indexOf(tier2);
}

/**
 * Compare two tiers and determine if tier1 is at least tier2.
 *
 * @param tier1 - First tier to compare
 * @param tier2 - Minimum tier required
 * @returns true if tier1 is at least tier2
 */
export function isTierAtLeast(tier1: SubscriptionTier, tier2: SubscriptionTier): boolean {
  return TIER_HIERARCHY.indexOf(tier1) >= TIER_HIERARCHY.indexOf(tier2);
}

/**
 * Get the display name for a tier.
 *
 * @param tier - The subscription tier
 * @returns Human-readable tier name
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  const displayNames: Record<SubscriptionTier, string> = {
    free: "Free",
    pro: "Pro",
    business: "Business",
    enterprise: "Enterprise",
  };

  return displayNames[tier] ?? tier;
}

/**
 * Get the recommended upgrade product slug based on the required tier.
 *
 * @param requiredTier - The tier required for a feature
 * @param preferAnnual - Whether to prefer annual billing (default: true)
 * @returns Product slug for checkout
 */
export function getUpgradeSlug(requiredTier: SubscriptionTier, preferAnnual = true): string {
  const slugMap: Record<SubscriptionTier, { annual: string; monthly: string }> = {
    free: { annual: "pro-annual", monthly: "pro" },
    pro: { annual: "pro-annual", monthly: "pro" },
    business: { annual: "business-annual", monthly: "business" },
    enterprise: { annual: "business-annual", monthly: "business" }, // Enterprise requires contact
  };

  return preferAnnual ? slugMap[requiredTier].annual : slugMap[requiredTier].monthly;
}

// ============================================================================
// Export FEATURE_TIERS for advanced use cases
// ============================================================================

export { FEATURE_TIERS, TIER_HIERARCHY };
