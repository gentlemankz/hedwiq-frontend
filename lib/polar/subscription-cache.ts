/**
 * Subscription Cache Service
 *
 * Provides caching layer for Polar subscription data to:
 * - Reduce API calls and latency
 * - Provide fallback when Polar is unavailable
 * - Track local usage between syncs
 */

import { db } from "@/lib/db";
import { subscriptionCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
// Cache Operations
// ============================================================================

/**
 * Get subscription from cache for a user.
 * Returns null if no cache exists.
 */
export async function getSubscriptionFromCache(
  userId: string
): Promise<CachedSubscription | null> {
  try {
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
        minutesUsed: cached.minutesUsed,
        emailDraftsUsed: cached.emailDraftsUsed,
        storageUsedBytes: Number(cached.storageUsedBytes),
      },
      polarCustomerId: cached.polarCustomerId,
      polarSubscriptionId: cached.polarSubscriptionId,
      lastSyncedAt: cached.lastSyncedAt,
      isStale,
    };
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
