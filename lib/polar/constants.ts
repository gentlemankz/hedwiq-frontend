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
 * Determine which Polar environment to use.
 * Set POLAR_ENVIRONMENT=sandbox for development, POLAR_ENVIRONMENT=production for live payments.
 */
const isProduction = process.env.POLAR_ENVIRONMENT === "production";

/**
 * Sandbox (development) product IDs from Polar sandbox environment.
 * Used when POLAR_ENVIRONMENT=sandbox or not set.
 */
const SANDBOX_PRODUCTS: PolarProduct[] = [
  {
    productId: "6a513e7d-07cd-4809-9c01-4cb29604a207",
    slug: "pro",
    tier: "pro",
    interval: "month",
    displayName: "Pro Monthly",
  },
  {
    productId: "d6825cb5-35b6-4c94-9106-b6523aeac079",
    slug: "pro-annual",
    tier: "pro",
    interval: "year",
    displayName: "Pro Annual",
  },
  {
    productId: "0ba11623-5fd2-479d-bf1b-79ee61eba60c",
    slug: "business",
    tier: "business",
    interval: "month",
    displayName: "Business Monthly",
  },
  {
    productId: "7a26630b-1dbb-4d67-a685-643c98c0cc0a",
    slug: "business-annual",
    tier: "business",
    interval: "year",
    displayName: "Business Annual",
  },
];

/**
 * Production product IDs from Polar production environment (polar.sh).
 */
const PRODUCTION_PRODUCTS: PolarProduct[] = [
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
 * Polar products mapped to their slugs and tiers.
 * Automatically selects sandbox or production based on POLAR_ENVIRONMENT.
 */
export const POLAR_PRODUCTS: PolarProduct[] = isProduction
  ? PRODUCTION_PRODUCTS
  : SANDBOX_PRODUCTS;

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
 * Sentinel value for unlimited usage.
 * Using -1 instead of Number.MAX_SAFE_INTEGER to avoid JSON serialization issues.
 */
export const UNLIMITED = -1;

/**
 * Grace period for past_due subscriptions in days.
 * After this period, users will be downgraded to free tier limits.
 * Polar typically retries payments for ~7 days before canceling.
 */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Usage limits for each subscription tier.
 * Note: -1 represents unlimited usage.
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
    minutesPerMonth: UNLIMITED,
    storageGb: 20,
    historyDays: 90,
    emailDraftsPerMonth: 1500,
  },
  enterprise: {
    minutesPerMonth: UNLIMITED,
    storageGb: UNLIMITED,
    historyDays: UNLIMITED,
    emailDraftsPerMonth: UNLIMITED,
  },
};

/**
 * Threshold for considering a limit as "unlimited"
 * @deprecated Use UNLIMITED constant (-1) for unlimited values
 */
export const UNLIMITED_THRESHOLD = 100000;

/**
 * Check if a numeric limit should be considered unlimited.
 * Checks for both -1 (new standard) and legacy threshold values.
 */
export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED || limit >= UNLIMITED_THRESHOLD;
}

/**
 * Check if minutes limit should be considered unlimited
 * Alias for isUnlimited() with a more descriptive name for meeting minutes context
 */
export function isUnlimitedMinutes(limit: number): boolean {
  return isUnlimited(limit);
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

/**
 * Check if a past_due subscription is within the grace period.
 * Users retain their tier benefits during the grace period.
 *
 * @param currentPeriodEnd - When the billing period ended (payment was due)
 * @returns true if within grace period, false if grace period expired
 */
export function isPastDueWithinGrace(currentPeriodEnd: Date | string | null): boolean {
  if (!currentPeriodEnd) {
    // Missing end date - treat as out of grace to avoid indefinite unpaid access
    return false;
  }

  const periodEnd = typeof currentPeriodEnd === "string"
    ? new Date(currentPeriodEnd)
    : currentPeriodEnd;

  const gracePeriodMs = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const graceExpiry = new Date(periodEnd.getTime() + gracePeriodMs);

  return new Date() < graceExpiry;
}

// ============================================================================
// Meter Configuration
// ============================================================================

/**
 * Meter slug identifiers used in Polar.
 * These should match exactly the meter names configured in Polar dashboard.
 */
export const METER_SLUGS = {
  MEETING_MINUTES: "meeting-minutes",
  EMAIL_DRAFTS: "email-drafts",
  STORAGE_BYTES: "storage-bytes",
} as const;

export type MeterSlug = (typeof METER_SLUGS)[keyof typeof METER_SLUGS];

/**
 * Meter type for categorizing usage data
 */
export type MeterType = "meeting_minutes" | "email_drafts" | "storage_bytes" | "unknown";

/**
 * Identify meter type from meter name.
 * Uses exact slug matching first, then falls back to keyword matching for flexibility.
 *
 * @param meterName - The meter name from Polar API (meter.meter?.name)
 * @returns The identified meter type
 */
export function identifyMeterType(meterName: string | null | undefined): MeterType {
  if (!meterName) return "unknown";

  const normalized = meterName.toLowerCase().trim();

  // Exact match on configured slugs (preferred)
  if (normalized === METER_SLUGS.MEETING_MINUTES) return "meeting_minutes";
  if (normalized === METER_SLUGS.EMAIL_DRAFTS) return "email_drafts";
  if (normalized === METER_SLUGS.STORAGE_BYTES) return "storage_bytes";

  // Fallback: keyword matching for flexibility with Polar meter naming variations
  // Check meeting minutes (must have both keywords to avoid false matches)
  if (normalized.includes("meeting") && normalized.includes("minute")) {
    return "meeting_minutes";
  }
  // Check email drafts (must have both keywords)
  if (normalized.includes("email") && normalized.includes("draft")) {
    return "email_drafts";
  }
  // Check storage (must have both keywords)
  if (normalized.includes("storage") && normalized.includes("byte")) {
    return "storage_bytes";
  }

  return "unknown";
}
