/**
 * Polar Payment Integration Constants
 *
 * Single source of truth for all Polar product configuration.
 * Used by both server (auth.ts) and client (subscription-context.tsx) code.
 */

// ============================================================================
// Types
// ============================================================================

export type SubscriptionTier = "free" | "pro" | "business" | "enterprise";
export type BillingInterval = "month" | "year";

export interface PolarProduct {
  productId: string;
  slug: string;
  tier: SubscriptionTier;
  interval: BillingInterval;
  displayName: string;
}

export interface TierLimits {
  minutesPerMonth: number;
  storageGb: number;
  historyDays: number;
  emailDraftsPerMonth: number;
}

// ============================================================================
// Product Configuration
// ============================================================================

/**
 * Polar products mapped to their slugs and tiers.
 * This is the single source of truth for product configuration.
 */
export const POLAR_PRODUCTS: PolarProduct[] = [
  {
    productId: "96ef3a99-c31f-4c71-ad3a-a18c73875442",
    slug: "pro",
    tier: "pro",
    interval: "month",
    displayName: "Pro Monthly",
  },
  {
    productId: "55e07982-ec4e-4cc9-9388-2174f0f9ad92",
    slug: "pro-annual",
    tier: "pro",
    interval: "year",
    displayName: "Pro Annual",
  },
  {
    productId: "c7884495-e190-4182-bad7-3ca8f5386207",
    slug: "business",
    tier: "business",
    interval: "month",
    displayName: "Business Monthly",
  },
  {
    productId: "d71eb319-0a18-4150-a7cd-0409b2c01fba",
    slug: "business-annual",
    tier: "business",
    interval: "year",
    displayName: "Business Annual",
  },
];

/**
 * Products formatted for Better Auth checkout plugin
 */
export const POLAR_CHECKOUT_PRODUCTS = POLAR_PRODUCTS.map(({ productId, slug }) => ({
  productId,
  slug,
}));

/**
 * Valid product slugs for validation
 */
export const VALID_PRODUCT_SLUGS = new Set(POLAR_PRODUCTS.map((p) => p.slug));

// ============================================================================
// Tier Limits Configuration
// ============================================================================

/**
 * Usage limits for each subscription tier.
 * Note: Infinity values represent unlimited usage.
 */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    minutesPerMonth: 300,
    storageGb: 0,
    historyDays: 7,
    emailDraftsPerMonth: 0,
  },
  pro: {
    minutesPerMonth: 3000,
    storageGb: 10,
    historyDays: 30,
    emailDraftsPerMonth: 300,
  },
  business: {
    minutesPerMonth: Number.MAX_SAFE_INTEGER, // Treated as unlimited
    storageGb: 20,
    historyDays: 90,
    emailDraftsPerMonth: 1500,
  },
  enterprise: {
    minutesPerMonth: Number.MAX_SAFE_INTEGER, // Treated as unlimited
    storageGb: Number.MAX_SAFE_INTEGER,
    historyDays: Number.MAX_SAFE_INTEGER,
    emailDraftsPerMonth: Number.MAX_SAFE_INTEGER,
  },
};

/**
 * Threshold for considering a tier as having "unlimited" minutes
 */
export const UNLIMITED_THRESHOLD = 100000;

/**
 * Check if minutes limit should be considered unlimited
 */
export function isUnlimitedMinutes(limit: number): boolean {
  return limit >= UNLIMITED_THRESHOLD;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tier from product ID
 */
export function getTierFromProductId(productId: string | null | undefined): SubscriptionTier {
  if (!productId) return "free";
  const product = POLAR_PRODUCTS.find((p) => p.productId === productId);
  return product?.tier ?? "free";
}

/**
 * Get billing interval from product ID
 */
export function getIntervalFromProductId(productId: string | null | undefined): BillingInterval | null {
  if (!productId) return null;
  const product = POLAR_PRODUCTS.find((p) => p.productId === productId);
  return product?.interval ?? null;
}

/**
 * Get product by slug
 */
export function getProductBySlug(slug: string): PolarProduct | undefined {
  return POLAR_PRODUCTS.find((p) => p.slug === slug);
}

/**
 * Validate if a slug is a valid product slug
 */
export function isValidProductSlug(slug: string): boolean {
  return VALID_PRODUCT_SLUGS.has(slug);
}

/**
 * Get limits for a tier
 */
export function getLimitsForTier(tier: SubscriptionTier): TierLimits {
  return TIER_LIMITS[tier];
}
