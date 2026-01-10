/**
 * Subscription Cache Service
 *
 * Provides caching layer for Polar subscription data to:
 * - Reduce API calls and latency
 * - Provide fallback when Polar is unavailable
 * - Track local usage between syncs
 *
 * REFACTORED: Extracted helpers, atomic idempotency, separate keys for minutes/drafts
 */

import { db } from "@/lib/db";
import { subscriptionCache } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  TIER_LIMITS,
  type SubscriptionTier,
} from "@/lib/polar/constants";

// ============================================================================
// Types
// ============================================================================

export interface CachedSubscription {
  tier: SubscriptionTier;
  status: "none" | "active" | "trialing" | "canceled" | "past_due";
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  limits: {
    minutesPerMonth: number;
    storageGb: number;
    historyDays: number;
    emailDraftsPerMonth: number;
  };
  usage: {
    minutesUsed: number;
    emailDraftsUsed: number;
    storageUsedBytes: number;
  };
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  lastSyncedAt: Date | null;
  isStale: boolean;
}

export interface CacheUpdateInput {
  userId: string;
  tier: SubscriptionTier;
  status: "none" | "active" | "trialing" | "canceled" | "past_due";
  billingInterval?: "month" | "year" | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  polarCustomerId?: string | null;
  polarSubscriptionId?: string | null;
  minutesUsed?: number;
  emailDraftsUsed?: number;
  storageUsedBytes?: number;
}

interface IncrementResult {
  success: boolean;
  value: number;
  error?: string;
  deduplicated?: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * How long before cache is considered stale (in minutes).
 * Stale cache can still be used as fallback, but should trigger a refresh.
 */
export const CACHE_FRESHNESS_MINUTES = 5;

/**
 * Maximum age before cache is considered too old to use (in hours).
 * After this, we must get fresh data from Polar.
 */
export const CACHE_MAX_AGE_HOURS = 24;

// ============================================================================
// Billing Period Utilities
// ============================================================================

/**
 * Check if the usage period has crossed into a new billing month.
 * Usage resets at the start of each UTC month.
 *
 * @param periodStart - The start of the current usage period
 * @returns true if we've crossed into a new month and should reset
 */
function shouldResetUsagePeriod(periodStart: Date | null): boolean {
  if (!periodStart) return true; // No period start = needs reset

  const now = new Date();
  const periodYear = periodStart.getUTCFullYear();
  const periodMonth = periodStart.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  // Reset if we're in a different month
  return periodYear !== currentYear || periodMonth !== currentMonth;
}

/**
 * Get the start of the current billing period (first day of current UTC month).
 */
function getCurrentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate userId is non-empty string
 */
function validateUserId(userId: string): void {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    throw new Error("Invalid userId: must be a non-empty string");
  }
}

/**
 * Validate numeric value is positive
 */
function validatePositiveNumber(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}: must be a non-negative number`);
  }
}

/**
 * Maximum allowed length for idempotency keys.
 * This prevents storage issues and ensures reasonable key sizes.
 * Format: `minutes:${sessionId}:${bucket}` or `draft:${meetingId}:${actionId}`
 * Typical length: 50-100 chars, max allows for longer IDs.
 */
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/**
 * Allowed characters in idempotency keys.
 * Alphanumeric, hyphens, underscores, colons, and periods only.
 * This prevents control characters and potential encoding issues.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_\-\.]+$/;

/**
 * Validate idempotency key format.
 * Returns the sanitized key or undefined if invalid.
 *
 * SECURITY: While Drizzle parameterizes values (preventing SQL injection),
 * validating format ensures consistent behavior and prevents:
 * - Control characters that could cause encoding issues
 * - Excessively long keys that waste storage
 * - Unexpected characters that could affect logging/debugging
 *
 * @param key - The idempotency key to validate
 * @returns The validated key or undefined if invalid
 */
function validateIdempotencyKey(key: string | undefined): string | undefined {
  if (!key) return undefined;

  // Check type
  if (typeof key !== "string") {
    console.warn("[SubscriptionCache] Invalid idempotency key type, ignoring");
    return undefined;
  }

  // Check length
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    console.warn(
      `[SubscriptionCache] Idempotency key too long (${key.length} > ${MAX_IDEMPOTENCY_KEY_LENGTH}), ignoring`
    );
    return undefined;
  }

  // Check format
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    console.warn("[SubscriptionCache] Idempotency key contains invalid characters, ignoring");
    return undefined;
  }

  return key;
}

// ============================================================================
// Free Tier Cache Entry Creation (DRY Helper)
// ============================================================================

/**
 * Create a new free tier cache entry defaults.
 * Extracted to avoid duplication across multiple functions.
 */
function createFreeTierCacheDefaults(userId: string, overrides?: {
  minutesUsed?: number;
  emailDraftsUsed?: number;
  minutesIdempotencyKey?: string | null;
  draftsIdempotencyKey?: string | null;
}) {
  const limits = TIER_LIMITS.free;
  const currentPeriodStart = getCurrentPeriodStart();
  const now = new Date();

  return {
    id: nanoid(),
    userId,
    tier: "free" as const,
    status: "none" as const,
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    polarCustomerId: null,
    polarSubscriptionId: null,
    minutesLimit: limits.minutesPerMonth,
    storageLimitGb: limits.storageGb,
    historyDays: limits.historyDays,
    emailDraftsLimit: limits.emailDraftsPerMonth,
    minutesUsed: overrides?.minutesUsed ?? 0,
    emailDraftsUsed: overrides?.emailDraftsUsed ?? 0,
    storageUsedBytes: 0,
    usagePeriodStart: currentPeriodStart,
    lastSyncedAt: now,
    lastMinutesIdempotencyKey: overrides?.minutesIdempotencyKey ?? null,
    lastDraftsIdempotencyKey: overrides?.draftsIdempotencyKey ?? null,
    syncError: null,
  };
}

/**
 * Convert DB cache row to CachedSubscription type.
 */
function dbRowToCachedSubscription(
  cached: typeof subscriptionCache.$inferSelect,
  isStale: boolean,
  usageOverrides?: { minutesUsed?: number; emailDraftsUsed?: number }
): CachedSubscription {
  return {
    tier: cached.tier as SubscriptionTier,
    status: cached.status as CachedSubscription["status"],
    billingInterval: cached.billingInterval as "month" | "year" | null,
    currentPeriodEnd: cached.currentPeriodEnd,
    cancelAtPeriodEnd: cached.cancelAtPeriodEnd,
    limits: {
      minutesPerMonth: cached.minutesLimit,
      storageGb: cached.storageLimitGb,
      historyDays: cached.historyDays,
      emailDraftsPerMonth: cached.emailDraftsLimit,
    },
    usage: {
      minutesUsed: usageOverrides?.minutesUsed ?? cached.minutesUsed,
      emailDraftsUsed: usageOverrides?.emailDraftsUsed ?? cached.emailDraftsUsed,
      storageUsedBytes: Number(cached.storageUsedBytes), // Storage doesn't reset
    },
    polarCustomerId: cached.polarCustomerId,
    polarSubscriptionId: cached.polarSubscriptionId,
    lastSyncedAt: cached.lastSyncedAt,
    isStale,
  };
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get subscription from cache for a user.
 * Returns null if no cache exists.
 *
 * IMPORTANT: If the billing period has changed since last update,
 * returns 0 for usage values (lazy reset - actual DB reset happens on next increment).
 */
export async function getSubscriptionFromCache(
  userId: string
): Promise<CachedSubscription | null> {
  try {
    validateUserId(userId);

    const [cached] = await db
      .select()
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId))
      .limit(1);

    if (!cached) {
      return null;
    }

    const now = new Date();
    const lastSynced = cached.lastSyncedAt;
    const freshnessMs = CACHE_FRESHNESS_MINUTES * 60 * 1000;
    const isStale = !lastSynced || now.getTime() - lastSynced.getTime() > freshnessMs;

    // Check if billing period has changed - if so, return 0 usage
    // The actual DB reset will happen lazily on the next increment operation
    const needsReset = shouldResetUsagePeriod(cached.usagePeriodStart);

    return dbRowToCachedSubscription(
      cached,
      isStale,
      needsReset ? { minutesUsed: 0, emailDraftsUsed: 0 } : undefined
    );
  } catch (error) {
    console.error("[SubscriptionCache] Failed to read from cache:", error);
    return null;
  }
}

/**
 * Check if cached subscription is too old to use as fallback.
 */
export function isCacheTooOld(cached: CachedSubscription): boolean {
  if (!cached.lastSyncedAt) return true;

  const maxAgeMs = CACHE_MAX_AGE_HOURS * 60 * 60 * 1000;
  const now = new Date();
  return now.getTime() - cached.lastSyncedAt.getTime() > maxAgeMs;
}

/**
 * Update or create subscription cache entry.
 */
export async function updateSubscriptionCache(
  input: CacheUpdateInput
): Promise<boolean> {
  try {
    validateUserId(input.userId);

    const limits = TIER_LIMITS[input.tier];
    const now = new Date();

    // Check if entry exists
    const [existing] = await db
      .select({ id: subscriptionCache.id })
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, input.userId))
      .limit(1);

    if (existing) {
      // Update existing
      await db
        .update(subscriptionCache)
        .set({
          tier: input.tier,
          status: input.status,
          billingInterval: input.billingInterval ?? null,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
          polarCustomerId: input.polarCustomerId ?? null,
          polarSubscriptionId: input.polarSubscriptionId ?? null,
          minutesLimit: limits.minutesPerMonth,
          storageLimitGb: limits.storageGb,
          historyDays: limits.historyDays,
          emailDraftsLimit: limits.emailDraftsPerMonth,
          minutesUsed: input.minutesUsed ?? 0,
          emailDraftsUsed: input.emailDraftsUsed ?? 0,
          storageUsedBytes: input.storageUsedBytes ?? 0,
          lastSyncedAt: now,
          syncError: null,
          updatedAt: now,
        })
        .where(eq(subscriptionCache.userId, input.userId));
    } else {
      // Create new
      await db.insert(subscriptionCache).values({
        id: nanoid(),
        userId: input.userId,
        tier: input.tier,
        status: input.status,
        billingInterval: input.billingInterval ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        polarCustomerId: input.polarCustomerId ?? null,
        polarSubscriptionId: input.polarSubscriptionId ?? null,
        minutesLimit: limits.minutesPerMonth,
        storageLimitGb: limits.storageGb,
        historyDays: limits.historyDays,
        emailDraftsLimit: limits.emailDraftsPerMonth,
        minutesUsed: input.minutesUsed ?? 0,
        emailDraftsUsed: input.emailDraftsUsed ?? 0,
        storageUsedBytes: input.storageUsedBytes ?? 0,
        usagePeriodStart: now,
        lastSyncedAt: now,
        lastMinutesIdempotencyKey: null,
        lastDraftsIdempotencyKey: null,
        syncError: null,
      });
    }

    return true;
  } catch (error) {
    console.error("[SubscriptionCache] Failed to update cache:", error);
    return false;
  }
}

/**
 * Record a sync error for a user's subscription cache.
 */
export async function recordCacheSyncError(
  userId: string,
  error: string
): Promise<void> {
  try {
    await db
      .update(subscriptionCache)
      .set({
        syncError: error.slice(0, 500), // Truncate to fit column
      })
      .where(eq(subscriptionCache.userId, userId));
  } catch (dbError) {
    console.error("[SubscriptionCache] Failed to record sync error:", dbError);
  }
}

/**
 * Delete subscription cache for a user (e.g., on account deletion).
 */
export async function deleteSubscriptionCache(userId: string): Promise<void> {
  try {
    await db
      .delete(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId));
  } catch (error) {
    console.error("[SubscriptionCache] Failed to delete cache:", error);
  }
}

// ============================================================================
// Local Usage Tracking (Critical for Free Tier Users)
// ============================================================================

/**
 * Maps JavaScript camelCase field names to PostgreSQL snake_case column names.
 * Required for raw SQL queries using sql.identifier() - PostgreSQL double-quoted
 * identifiers are case-sensitive, so we must use the actual column names.
 */
const FIELD_TO_COLUMN: Record<string, string> = {
  minutesUsed: "minutes_used",
  emailDraftsUsed: "email_drafts_used",
  lastMinutesIdempotencyKey: "last_minutes_idempotency_key",
  lastDraftsIdempotencyKey: "last_drafts_idempotency_key",
};

/**
 * Atomic increment with idempotency check using PostgreSQL conditional update.
 * Returns { applied: true, newValue } if increment was applied.
 * Returns { applied: false, currentValue } if deduplicated.
 *
 * This solves the race condition by making the check-and-update atomic.
 */
async function atomicIncrementWithIdempotency(
  userId: string,
  field: "minutesUsed" | "emailDraftsUsed",
  idempotencyField: "lastMinutesIdempotencyKey" | "lastDraftsIdempotencyKey",
  amount: number,
  idempotencyKey: string | undefined,
  needsReset: boolean,
  currentPeriodStart: Date
): Promise<{ applied: boolean; newValue: number; currentValue: number }> {
  // Use raw SQL for atomic conditional update
  // This prevents race conditions by doing check-and-set in one query
  const otherField = field === "minutesUsed" ? "emailDraftsUsed" : "minutesUsed";

  // Map camelCase field names to snake_case column names for PostgreSQL
  const fieldColumn = FIELD_TO_COLUMN[field];
  const idempotencyColumn = FIELD_TO_COLUMN[idempotencyField];
  const otherColumn = FIELD_TO_COLUMN[otherField];

  if (idempotencyKey) {
    // With idempotency key: only update if key is different
    // postgres-js returns rows directly as array
    const result = await db.execute<{ new_value: number; was_deduped: boolean }>(sql`
      UPDATE subscription_cache
      SET
        ${sql.identifier(fieldColumn)} = CASE
          WHEN ${sql.identifier(idempotencyColumn)} = ${idempotencyKey} THEN ${sql.identifier(fieldColumn)}
          WHEN ${needsReset} THEN ${amount}
          ELSE ${sql.identifier(fieldColumn)} + ${amount}
        END,
        ${sql.identifier(otherColumn)} = CASE
          WHEN ${needsReset} AND ${sql.identifier(idempotencyColumn)} != ${idempotencyKey} THEN 0
          ELSE ${sql.identifier(otherColumn)}
        END,
        usage_period_start = CASE
          WHEN ${needsReset} AND ${sql.identifier(idempotencyColumn)} != ${idempotencyKey} THEN ${currentPeriodStart}
          ELSE usage_period_start
        END,
        ${sql.identifier(idempotencyColumn)} = CASE
          WHEN ${sql.identifier(idempotencyColumn)} = ${idempotencyKey} THEN ${sql.identifier(idempotencyColumn)}
          ELSE ${idempotencyKey}
        END,
        updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING
        ${sql.identifier(fieldColumn)} as new_value,
        (${sql.identifier(idempotencyColumn)} = ${idempotencyKey}) as was_deduped
    `);

    const row = result[0];
    if (row) {
      return {
        applied: !row.was_deduped,
        newValue: row.new_value,
        currentValue: row.new_value,
      };
    }
  } else {
    // Without idempotency key: always apply
    // postgres-js returns rows directly as array
    const result = await db.execute<{ new_value: number }>(sql`
      UPDATE subscription_cache
      SET
        ${sql.identifier(fieldColumn)} = CASE
          WHEN ${needsReset} THEN ${amount}
          ELSE ${sql.identifier(fieldColumn)} + ${amount}
        END,
        ${sql.identifier(otherColumn)} = CASE WHEN ${needsReset} THEN 0 ELSE ${sql.identifier(otherColumn)} END,
        usage_period_start = CASE WHEN ${needsReset} THEN ${currentPeriodStart} ELSE usage_period_start END,
        updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING ${sql.identifier(fieldColumn)} as new_value
    `);

    const row = result[0];
    if (row) {
      return { applied: true, newValue: row.new_value, currentValue: row.new_value };
    }
  }

  // No row returned means user doesn't exist
  return { applied: false, newValue: 0, currentValue: 0 };
}

/**
 * Increment meeting minutes usage locally in the cache.
 * This is the PRIMARY tracking mechanism for free tier users who don't have
 * Polar customer records. Also serves as a fallback for paid users when
 * Polar event ingestion fails.
 *
 * IMPORTANT:
 * - Automatically resets usage at the start of each billing month.
 * - Uses atomic DB operation to prevent race conditions.
 * - Uses separate idempotency key column from email drafts.
 *
 * @param userId - The user's ID
 * @param minutes - Minutes to add (must be positive)
 * @param idempotencyKey - Optional key to prevent duplicate increments
 * @returns Object with success status and updated usage
 */
export async function incrementLocalMinutesUsage(
  userId: string,
  minutes: number,
  idempotencyKey?: string
): Promise<IncrementResult & { minutesUsed: number }> {
  try {
    // Input validation
    validateUserId(userId);
    validatePositiveNumber(minutes, "minutes");

    // Validate and sanitize idempotency key
    const validatedKey = validateIdempotencyKey(idempotencyKey);

    if (minutes === 0) {
      // Nothing to increment - get current value
      const cached = await getSubscriptionFromCache(userId);
      return { success: true, value: cached?.usage.minutesUsed ?? 0, minutesUsed: cached?.usage.minutesUsed ?? 0 };
    }

    // Get existing cache to check period and for potential insert
    const [existing] = await db
      .select()
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId))
      .limit(1);

    if (existing) {
      const needsReset = shouldResetUsagePeriod(existing.usagePeriodStart);
      const currentPeriodStart = getCurrentPeriodStart();

      // Check for idempotency BEFORE doing any update (fast path)
      if (validatedKey && existing.lastMinutesIdempotencyKey === validatedKey) {
        console.debug(
          `[SubscriptionCache] Duplicate minutes increment detected (key=${validatedKey}), skipping`
        );
        return {
          success: true,
          value: needsReset ? 0 : existing.minutesUsed,
          minutesUsed: needsReset ? 0 : existing.minutesUsed,
          deduplicated: true,
        };
      }

      // Atomic increment with idempotency protection
      const result = await atomicIncrementWithIdempotency(
        userId,
        "minutesUsed",
        "lastMinutesIdempotencyKey",
        minutes,
        validatedKey,
        needsReset,
        currentPeriodStart
      );

      if (!result.applied && validatedKey) {
        // Was deduplicated by atomic operation
        return {
          success: true,
          value: result.currentValue,
          minutesUsed: result.currentValue,
          deduplicated: true,
        };
      }

      if (needsReset) {
        console.info(
          `[SubscriptionCache] New billing period for user ${userId}, reset to ${minutes} mins`
        );
      } else {
        console.debug(
          `[SubscriptionCache] Incremented: +${minutes} mins, total=${result.newValue} for ${userId}`
        );
      }

      return { success: true, value: result.newValue, minutesUsed: result.newValue };
    } else {
      // Create new cache entry for free user
      const defaults = createFreeTierCacheDefaults(userId, {
        minutesUsed: minutes,
        minutesIdempotencyKey: validatedKey,
      });

      await db.insert(subscriptionCache).values(defaults);

      console.debug(
        `[SubscriptionCache] Created free tier cache with ${minutes} minutes for user ${userId}`
      );

      return { success: true, value: minutes, minutesUsed: minutes };
    }
  } catch (error) {
    console.error("[SubscriptionCache] Failed to increment local minutes:", error);
    return {
      success: false,
      value: 0,
      minutesUsed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Increment email drafts usage locally in the cache.
 *
 * IMPORTANT:
 * - Automatically resets usage at the start of each billing month.
 * - Uses atomic DB operation to prevent race conditions.
 * - Uses separate idempotency key column from minutes.
 *
 * @param userId - The user's ID
 * @param count - Number of drafts to add (must be positive)
 * @param idempotencyKey - Optional key to prevent duplicate increments
 * @returns Object with success status and updated usage
 */
export async function incrementLocalEmailDraftsUsage(
  userId: string,
  count: number,
  idempotencyKey?: string
): Promise<IncrementResult & { emailDraftsUsed: number }> {
  try {
    // Input validation
    validateUserId(userId);
    validatePositiveNumber(count, "count");

    // Validate and sanitize idempotency key
    const validatedKey = validateIdempotencyKey(idempotencyKey);

    if (count === 0) {
      // Nothing to increment - get current value
      const cached = await getSubscriptionFromCache(userId);
      return { success: true, value: cached?.usage.emailDraftsUsed ?? 0, emailDraftsUsed: cached?.usage.emailDraftsUsed ?? 0 };
    }

    // Get existing cache to check period and for potential insert
    const [existing] = await db
      .select()
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId))
      .limit(1);

    if (existing) {
      const needsReset = shouldResetUsagePeriod(existing.usagePeriodStart);
      const currentPeriodStart = getCurrentPeriodStart();

      // Check for idempotency BEFORE doing any update (fast path)
      if (validatedKey && existing.lastDraftsIdempotencyKey === validatedKey) {
        console.debug(
          `[SubscriptionCache] Duplicate drafts increment detected (key=${validatedKey}), skipping`
        );
        return {
          success: true,
          value: needsReset ? 0 : existing.emailDraftsUsed,
          emailDraftsUsed: needsReset ? 0 : existing.emailDraftsUsed,
          deduplicated: true,
        };
      }

      // Atomic increment with idempotency protection
      const result = await atomicIncrementWithIdempotency(
        userId,
        "emailDraftsUsed",
        "lastDraftsIdempotencyKey",
        count,
        validatedKey,
        needsReset,
        currentPeriodStart
      );

      if (!result.applied && validatedKey) {
        return {
          success: true,
          value: result.currentValue,
          emailDraftsUsed: result.currentValue,
          deduplicated: true,
        };
      }

      if (needsReset) {
        console.info(
          `[SubscriptionCache] New billing period for user ${userId}, reset drafts to ${count}`
        );
      } else {
        console.debug(
          `[SubscriptionCache] Incremented: +${count} drafts, total=${result.newValue} for ${userId}`
        );
      }

      return { success: true, value: result.newValue, emailDraftsUsed: result.newValue };
    } else {
      // Create new cache entry for free user
      const defaults = createFreeTierCacheDefaults(userId, {
        emailDraftsUsed: count,
        draftsIdempotencyKey: validatedKey,
      });

      await db.insert(subscriptionCache).values(defaults);

      console.debug(
        `[SubscriptionCache] Created free tier cache with ${count} email drafts for user ${userId}`
      );

      return { success: true, value: count, emailDraftsUsed: count };
    }
  } catch (error) {
    console.error("[SubscriptionCache] Failed to increment local drafts:", error);
    return {
      success: false,
      value: 0,
      emailDraftsUsed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get or create a subscription cache entry for a user.
 * This ensures free users always have a cache entry for usage tracking.
 *
 * @param userId - The user's ID
 * @returns The cached subscription data (created with free tier defaults if new)
 */
export async function getOrCreateSubscriptionCache(
  userId: string
): Promise<CachedSubscription> {
  try {
    validateUserId(userId);

    // Try to get existing cache
    const existing = await getSubscriptionFromCache(userId);
    if (existing) {
      return existing;
    }

    // Create new cache entry for free user
    const defaults = createFreeTierCacheDefaults(userId);
    await db.insert(subscriptionCache).values(defaults);

    console.debug(`[SubscriptionCache] Created free tier cache for user ${userId}`);

    // Return the newly created cache
    const limits = TIER_LIMITS.free;
    return {
      tier: "free",
      status: "none",
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: {
        minutesPerMonth: limits.minutesPerMonth,
        storageGb: limits.storageGb,
        historyDays: limits.historyDays,
        emailDraftsPerMonth: limits.emailDraftsPerMonth,
      },
      usage: {
        minutesUsed: 0,
        emailDraftsUsed: 0,
        storageUsedBytes: 0,
      },
      polarCustomerId: null,
      polarSubscriptionId: null,
      lastSyncedAt: new Date(),
      isStale: false,
    };
  } catch (error) {
    console.error("[SubscriptionCache] Failed to get or create cache:", error);
    // Return default free tier data as fallback
    const limits = TIER_LIMITS.free;
    return {
      tier: "free",
      status: "none",
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: {
        minutesPerMonth: limits.minutesPerMonth,
        storageGb: limits.storageGb,
        historyDays: limits.historyDays,
        emailDraftsPerMonth: limits.emailDraftsPerMonth,
      },
      usage: {
        minutesUsed: 0,
        emailDraftsUsed: 0,
        storageUsedBytes: 0,
      },
      polarCustomerId: null,
      polarSubscriptionId: null,
      lastSyncedAt: null,
      isStale: true,
    };
  }
}

/**
 * Check if user has a Polar customer record (paid user indicator).
 *
 * Strategy:
 * 1. Check local cache first (fast path)
 * 2. If cache exists with polarCustomerId, return true
 * 3. If cache is EMPTY (new user), do direct Polar lookup to catch new paid users
 * 4. If cache exists but no polarCustomerId, user is free tier - return false
 *
 * This prevents the bug where newly paid users skip Polar usage reporting
 * because their cache hasn't been populated yet.
 *
 * @param userId - The user's ID
 * @param skipDirectLookup - If true, only check cache (for performance-critical paths)
 */
export async function hasPolarCustomer(
  userId: string,
  skipDirectLookup: boolean = false
): Promise<boolean> {
  try {
    const cached = await getSubscriptionFromCache(userId);

    // If cache exists and has Polar customer ID, user is paid
    if (cached?.polarCustomerId) {
      return true;
    }

    // If cache exists but no Polar customer ID, user is free tier
    if (cached) {
      return false;
    }

    // Cache is EMPTY - this could be a NEW paid user
    // Do direct Polar lookup to avoid missing usage for new subscribers
    if (skipDirectLookup) {
      return false;
    }

    // Dynamic import to avoid circular dependency
    const { getPolarCustomer } = await import("@/lib/polar/usage");
    const result = await getPolarCustomer(userId);

    if (result.customer) {
      // Found in Polar! Create cache entry for next time
      console.info(
        `[SubscriptionCache] New Polar customer detected for ${userId}, creating cache`
      );

      // We don't have full subscription details here, but we can mark them as having a customer
      // The next getCustomerState call will populate the full details
      const limits = TIER_LIMITS.free; // Temporary - will be updated on next sync
      const now = new Date();

      try {
        await db.insert(subscriptionCache).values({
          id: nanoid(),
          userId,
          tier: "free", // Will be updated when subscription details are fetched
          status: "none",
          billingInterval: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          polarCustomerId: result.customer.id, // The important part!
          polarSubscriptionId: null,
          minutesLimit: limits.minutesPerMonth,
          storageLimitGb: limits.storageGb,
          historyDays: limits.historyDays,
          emailDraftsLimit: limits.emailDraftsPerMonth,
          minutesUsed: 0,
          emailDraftsUsed: 0,
          storageUsedBytes: 0,
          usagePeriodStart: now,
          lastSyncedAt: now,
          lastMinutesIdempotencyKey: null,
          lastDraftsIdempotencyKey: null,
          syncError: null,
        });
      } catch (insertError) {
        // Race condition - another request may have created it
        console.debug("[SubscriptionCache] Cache insert race condition (expected):", insertError);
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error("[SubscriptionCache] hasPolarCustomer error:", error);
    return false;
  }
}
