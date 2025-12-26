/**
 * Polar Webhook Handlers
 *
 * Processes webhook events from Polar to keep local state in sync:
 * - Updates subscription_cache when subscription status changes
 * - Logs all webhook events to webhook_log for auditing
 *
 * @module lib/polar/webhook-handlers
 */

import { db } from "@/lib/db";
import { subscriptionCache, webhookLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getTierFromProductId, TIER_LIMITS, type SubscriptionTier } from "@/lib/polar/constants";

// ============================================================================
// Types
// ============================================================================

/**
 * Simplified subscription payload from Polar webhooks
 */
interface SubscriptionPayload {
  id: string;
  productId: string;
  status: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  recurringInterval?: string | null;
  customer?: {
    id: string;
    externalId?: string | null;
    email: string;
  };
}

/**
 * Result of processing a webhook event
 */
interface WebhookProcessResult {
  success: boolean;
  error?: string;
  userId?: string;
  tier?: SubscriptionTier;
}

// ============================================================================
// Webhook Logging
// ============================================================================

/**
 * Log a webhook event to the database.
 * Uses eventId for idempotency - duplicate events are skipped.
 *
 * @param eventId - Polar's event ID for idempotency
 * @param eventType - The type of webhook event
 * @param success - Whether processing was successful
 * @param payload - The raw payload (will be truncated if too large)
 * @param error - Error message if processing failed
 */
export async function logWebhookEvent(
  eventId: string,
  eventType: string,
  success: boolean,
  payload?: unknown,
  error?: string
): Promise<void> {
  try {
    // Truncate payload to avoid storing huge objects
    const truncatedPayload = payload ? truncatePayload(payload) : null;

    await db
      .insert(webhookLog)
      .values({
        id: nanoid(),
        eventId,
        eventType,
        success,
        error: error?.slice(0, 1000), // Limit error message length
        payload: truncatedPayload,
        receivedAt: new Date(),
      })
      .onConflictDoNothing(); // Skip duplicate events
  } catch (err) {
    // Log but don't throw - webhook processing should not fail due to logging
    console.error("[Webhook Log] Failed to log event:", err);
  }
}

/**
 * Truncate payload to prevent storing huge JSON objects
 */
function truncatePayload(payload: unknown): unknown {
  const str = JSON.stringify(payload);
  if (str.length > 10000) {
    // Store truncated indicator
    return {
      _truncated: true,
      _originalLength: str.length,
      _preview: str.slice(0, 5000),
    };
  }
  return payload;
}

// ============================================================================
// Subscription Cache Updates
// ============================================================================

/**
 * Update subscription cache when a subscription becomes active.
 * Called by onSubscriptionActive webhook handler.
 *
 * @param payload - The subscription data from Polar
 * @returns Processing result
 */
export async function handleSubscriptionActive(
  payload: SubscriptionPayload
): Promise<WebhookProcessResult> {
  const userId = payload.customer?.externalId;

  if (!userId) {
    return {
      success: false,
      error: "No externalId found in customer data - cannot map to local user",
    };
  }

  try {
    const tier = getTierFromProductId(payload.productId);
    const limits = TIER_LIMITS[tier];

    // Determine billing interval
    let billingInterval: "month" | "year" | null = null;
    if (payload.recurringInterval === "year") {
      billingInterval = "year";
    } else if (payload.recurringInterval === "month") {
      billingInterval = "month";
    }

    // Parse period end date
    const currentPeriodEnd = payload.currentPeriodEnd
      ? new Date(payload.currentPeriodEnd)
      : null;

    // Upsert subscription cache
    const [existing] = await db
      .select({ id: subscriptionCache.id })
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId))
      .limit(1);

    const now = new Date();

    if (existing) {
      await db
        .update(subscriptionCache)
        .set({
          polarCustomerId: payload.customer?.id,
          polarSubscriptionId: payload.id,
          tier,
          status: "active",
          billingInterval,
          currentPeriodEnd,
          cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? false,
          minutesLimit: limits.minutesPerMonth,
          storageLimitGb: limits.storageGb,
          historyDays: limits.historyDays,
          emailDraftsLimit: limits.emailDraftsPerMonth,
          lastSyncedAt: now,
          syncError: null,
          updatedAt: now,
        })
        .where(eq(subscriptionCache.userId, userId));
    } else {
      await db.insert(subscriptionCache).values({
        id: nanoid(),
        userId,
        polarCustomerId: payload.customer?.id,
        polarSubscriptionId: payload.id,
        tier,
        status: "active",
        billingInterval,
        currentPeriodEnd,
        cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? false,
        minutesLimit: limits.minutesPerMonth,
        storageLimitGb: limits.storageGb,
        historyDays: limits.historyDays,
        emailDraftsLimit: limits.emailDraftsPerMonth,
        minutesUsed: 0,
        emailDraftsUsed: 0,
        storageUsedBytes: 0,
        usagePeriodStart: now,
        lastSyncedAt: now,
        syncError: null,
      });
    }

    console.log(`[Webhook Handler] Updated subscription cache for user ${userId}: tier=${tier}, status=active`);

    return { success: true, userId, tier };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook Handler] Failed to update subscription cache:", error);
    return { success: false, error };
  }
}

/**
 * Update subscription cache when a subscription is canceled.
 * Subscription remains active until period end (cancelAtPeriodEnd=true).
 *
 * @param payload - The subscription data from Polar
 * @returns Processing result
 */
export async function handleSubscriptionCanceled(
  payload: SubscriptionPayload
): Promise<WebhookProcessResult> {
  const userId = payload.customer?.externalId;

  if (!userId) {
    return {
      success: false,
      error: "No externalId found in customer data",
    };
  }

  try {
    const [existing] = await db
      .select({ id: subscriptionCache.id })
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId))
      .limit(1);

    const now = new Date();

    const tier = getTierFromProductId(payload.productId);

    if (existing) {
      await db
        .update(subscriptionCache)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: true,
          lastSyncedAt: now,
          syncError: null,
          updatedAt: now,
        })
        .where(eq(subscriptionCache.userId, userId));
    } else {
      const limits = TIER_LIMITS[tier];
      await db.insert(subscriptionCache).values({
        id: nanoid(),
        userId,
        polarCustomerId: payload.customer?.id,
        polarSubscriptionId: payload.id,
        tier,
        status: "canceled",
        billingInterval: payload.recurringInterval === "year" ? "year" : payload.recurringInterval === "month" ? "month" : null,
        currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd) : null,
        cancelAtPeriodEnd: true,
        minutesLimit: limits.minutesPerMonth,
        storageLimitGb: limits.storageGb,
        historyDays: limits.historyDays,
        emailDraftsLimit: limits.emailDraftsPerMonth,
        minutesUsed: 0,
        emailDraftsUsed: 0,
        storageUsedBytes: 0,
        usagePeriodStart: now,
        lastSyncedAt: now,
        syncError: null,
      });
    }

    console.log(`[Webhook Handler] Subscription canceled for user ${userId} (will end at period end)`);

    return { success: true, userId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook Handler] Failed to handle subscription canceled:", error);
    return { success: false, error };
  }
}

/**
 * Update subscription cache when a subscription is revoked.
 * Immediate cancellation - downgrade to free tier immediately.
 *
 * @param payload - The subscription data from Polar
 * @returns Processing result
 */
export async function handleSubscriptionRevoked(
  payload: SubscriptionPayload
): Promise<WebhookProcessResult> {
  const userId = payload.customer?.externalId;

  if (!userId) {
    return {
      success: false,
      error: "No externalId found in customer data",
    };
  }

  try {
    const freeLimits = TIER_LIMITS.free;
    const now = new Date();

    const [existing] = await db
      .select({ id: subscriptionCache.id })
      .from(subscriptionCache)
      .where(eq(subscriptionCache.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(subscriptionCache)
        .set({
          tier: "free",
          status: "none",
          billingInterval: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          polarSubscriptionId: null,
          minutesLimit: freeLimits.minutesPerMonth,
          storageLimitGb: freeLimits.storageGb,
          historyDays: freeLimits.historyDays,
          emailDraftsLimit: freeLimits.emailDraftsPerMonth,
          lastSyncedAt: now,
          syncError: null,
          updatedAt: now,
        })
        .where(eq(subscriptionCache.userId, userId));
    } else {
      await db.insert(subscriptionCache).values({
        id: nanoid(),
        userId,
        polarCustomerId: payload.customer?.id,
        polarSubscriptionId: null,
        tier: "free",
        status: "none",
        billingInterval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        minutesLimit: freeLimits.minutesPerMonth,
        storageLimitGb: freeLimits.storageGb,
        historyDays: freeLimits.historyDays,
        emailDraftsLimit: freeLimits.emailDraftsPerMonth,
        minutesUsed: 0,
        emailDraftsUsed: 0,
        storageUsedBytes: 0,
        usagePeriodStart: now,
        lastSyncedAt: now,
        syncError: null,
      });
    }

    console.log(`[Webhook Handler] Subscription revoked for user ${userId} - downgraded to free tier`);

    return { success: true, userId, tier: "free" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook Handler] Failed to handle subscription revoked:", error);
    return { success: false, error };
  }
}

/**
 * Handle subscription status updates (past_due, trialing, etc.)
 * Generic handler for status changes not covered by specific handlers.
 *
 * @param payload - The subscription data from Polar
 * @param newStatus - The new subscription status
 * @returns Processing result
 */
export async function handleSubscriptionStatusChange(
  payload: SubscriptionPayload,
  newStatus: "active" | "trialing" | "past_due" | "canceled"
): Promise<WebhookProcessResult> {
  const userId = payload.customer?.externalId;

  if (!userId) {
    return {
      success: false,
      error: "No externalId found in customer data",
    };
  }

  try {
    const now = new Date();
    const tier = getTierFromProductId(payload.productId);

    await db
      .update(subscriptionCache)
      .set({
        tier,
        status: newStatus,
        lastSyncedAt: now,
        syncError: null,
        updatedAt: now,
      })
      .where(eq(subscriptionCache.userId, userId));

    console.log(`[Webhook Handler] Subscription status changed for user ${userId}: status=${newStatus}`);

    return { success: true, userId, tier };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook Handler] Failed to handle status change:", error);
    return { success: false, error };
  }
}
