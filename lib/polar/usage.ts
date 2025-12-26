/**
 * Polar Usage Tracking Service
 *
 * Handles usage-based billing with Polar:
 * - Meeting minutes tracking
 * - Email draft tracking
 * - Storage usage tracking
 * - Pre-meeting limit checks
 */

import { polarClient } from "@/lib/auth";
import {
  TIER_LIMITS,
  getTierFromProductId,
  isUnlimited,
  isUnlimitedMinutes,
  identifyMeterType,
  isPastDueWithinGrace,
  type SubscriptionTier,
} from "@/lib/polar/constants";

// ============================================================================
// Types
// ============================================================================

export interface UsageReport {
  success: boolean;
  error?: string;
  eventId?: string;
}

export interface MeetingLimitCheck {
  allowed: boolean;
  tier: SubscriptionTier;
  remainingMinutes: number;
  minutesUsed: number;
  minutesLimit: number;
  reason?: string;
}

export interface CustomerState {
  tier: SubscriptionTier;
  minutesUsed: number;
  emailDraftsUsed: number;
  storageUsedBytes: number;
  activeSubscriptions: Array<{
    id: string;
    productId: string;
    status: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Event names for Polar usage tracking */
export const USAGE_EVENTS = {
  MEETING_MINUTES: "meeting-minutes",
  EMAIL_DRAFTS: "email-drafts",
  STORAGE_BYTES: "storage-bytes",
} as const;

// ============================================================================
// Customer Utilities
// ============================================================================

/**
 * Result of getting or creating a Polar customer
 */
export interface PolarCustomerResult {
  customer: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  error?: string;
  created?: boolean;
}

/**
 * Get a Polar customer by external ID (user ID).
 * Returns null if Polar is not configured or customer doesn't exist.
 *
 * @param userId - The user's ID (external customer ID in Polar)
 */
export async function getPolarCustomer(userId: string): Promise<PolarCustomerResult> {
  if (!polarClient) {
    return { customer: null, error: "Polar not configured" };
  }

  try {
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });
    return { customer };
  } catch {
    return { customer: null };
  }
}

/**
 * Get or create a Polar customer.
 * If the customer doesn't exist, creates one with the provided details.
 *
 * @param userId - The user's ID (external customer ID in Polar)
 * @param email - The user's email
 * @param name - Optional user name
 */
export async function getOrCreatePolarCustomer(
  userId: string,
  email: string,
  name?: string | null
): Promise<PolarCustomerResult> {
  if (!polarClient) {
    return { customer: null, error: "Polar not configured" };
  }

  try {
    // Try to get existing customer
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });
    return { customer, created: false };
  } catch {
    // Customer doesn't exist, create one
    try {
      const newCustomer = await polarClient.customers.create({
        email,
        name: name || undefined,
        externalId: userId,
      });
      return { customer: newCustomer, created: true };
    } catch (createError) {
      console.error("[Polar] Failed to create customer:", createError);
      return {
        customer: null,
        error: createError instanceof Error ? createError.message : "Failed to create customer",
      };
    }
  }
}

// ============================================================================
// Usage Ingestion Functions
// ============================================================================

/**
 * Report meeting minutes usage to Polar
 *
 * @param userId - The user's ID (maps to externalCustomerId in Polar)
 * @param minutes - Number of minutes to track
 * @param metadata - Optional additional metadata (roomId, meetingId, etc.)
 */
export async function reportMeetingMinutes(
  userId: string,
  minutes: number,
  metadata?: {
    roomId?: string;
    meetingId?: string;
    sessionId?: string;
  }
): Promise<UsageReport> {
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured, skipping usage report");
    return { success: false, error: "Polar not configured" };
  }

  if (minutes <= 0) {
    return { success: true }; // Nothing to report
  }

  try {
    await polarClient.events.ingest({
      events: [
        {
          name: USAGE_EVENTS.MEETING_MINUTES,
          externalCustomerId: userId,
          metadata: {
            minutes,
            ...metadata,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.log(`[Polar Usage] Reported ${minutes} meeting minutes for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("[Polar Usage] Failed to report meeting minutes:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Report email draft usage to Polar
 *
 * @param userId - The user's ID
 * @param count - Number of email drafts (usually 1)
 * @param metadata - Optional additional metadata
 */
export async function reportEmailDraft(
  userId: string,
  count: number = 1,
  metadata?: {
    meetingId?: string;
    actionType?: string;
  }
): Promise<UsageReport> {
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured, skipping usage report");
    return { success: false, error: "Polar not configured" };
  }

  if (count <= 0) {
    return { success: true };
  }

  try {
    await polarClient.events.ingest({
      events: [
        {
          name: USAGE_EVENTS.EMAIL_DRAFTS,
          externalCustomerId: userId,
          metadata: {
            count,
            ...metadata,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.log(`[Polar Usage] Reported ${count} email draft(s) for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("[Polar Usage] Failed to report email draft:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Report storage usage change to Polar
 *
 * @param userId - The user's ID
 * @param bytes - Number of bytes (positive for add, negative for delete)
 * @param metadata - Optional additional metadata
 */
export async function reportStorageChange(
  userId: string,
  bytes: number,
  metadata?: {
    documentId?: string;
    fileName?: string;
    action?: "upload" | "delete";
  }
): Promise<UsageReport> {
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured, skipping usage report");
    return { success: false, error: "Polar not configured" };
  }

  if (bytes === 0) {
    return { success: true };
  }

  try {
    await polarClient.events.ingest({
      events: [
        {
          name: USAGE_EVENTS.STORAGE_BYTES,
          externalCustomerId: userId,
          metadata: {
            bytes,
            ...metadata,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.log(`[Polar Usage] Reported ${bytes} bytes storage change for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("[Polar Usage] Failed to report storage change:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Customer State & Limit Check Functions
// ============================================================================

/**
 * Get customer state from Polar with cache fallback.
 *
 * Strategy:
 * 1. Try to get from Polar API first
 * 2. Update cache on success
 * 3. Fall back to cache if Polar fails (with staleness warning)
 *
 * @param userId - The user's ID (external customer ID)
 */
export async function getCustomerState(userId: string): Promise<CustomerState | null> {
  // Import cache functions dynamically to avoid circular dependencies
  const {
    getSubscriptionFromCache,
    updateSubscriptionCache,
    isCacheTooOld,
    recordCacheSyncError,
  } = await import("@/lib/polar/subscription-cache");

  // If Polar is not configured, try cache first
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured, checking cache");
    const cached = await getSubscriptionFromCache(userId);
    if (cached && !isCacheTooOld(cached)) {
      return {
        tier: cached.tier,
        minutesUsed: cached.usage.minutesUsed,
        emailDraftsUsed: cached.usage.emailDraftsUsed,
        storageUsedBytes: cached.usage.storageUsedBytes,
        activeSubscriptions: [],
      };
    }
    return null;
  }

  try {
    // First, get the customer (required for subsequent calls)
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });

    if (!customer) {
      return null;
    }

    // Parallelize subscriptions and meters fetch (both depend only on customer.id)
    const [subscriptions, meters] = await Promise.all([
      polarClient.subscriptions.list({
        customerId: customer.id,
        active: true,
      }),
      polarClient.customerMeters.list({
        customerId: customer.id,
      }),
    ]);

    // Determine tier from active subscription
    // Include past_due status only within grace period to prevent unpaid usage
    const activeSubscription = subscriptions.result.items?.find((sub) => {
      if (sub.status === "active" || sub.status === "trialing") {
        return true;
      }
      // For past_due, check if within grace period
      if (sub.status === "past_due") {
        return isPastDueWithinGrace(sub.currentPeriodEnd);
      }
      return false;
    });

    // Determine tier - downgrade to free if past_due is beyond grace period
    let tier: SubscriptionTier = "free";
    let status: "none" | "active" | "trialing" | "canceled" | "past_due" = "none";

    if (activeSubscription) {
      if (activeSubscription.status === "past_due" && !isPastDueWithinGrace(activeSubscription.currentPeriodEnd)) {
        // Past grace period - treat as free tier
        console.log(`[Polar Usage] Subscription ${activeSubscription.id} past_due beyond grace period, using free tier`);
        tier = "free";
        status = "past_due";
      } else {
        tier = getTierFromProductId(activeSubscription.productId);
        status = activeSubscription.status as typeof status;
      }
    }

    // Extract usage from meters using robust meter type identification
    let minutesUsed = 0;
    let emailDraftsUsed = 0;
    let storageUsedBytes = 0;

    for (const meter of meters.result.items || []) {
      const meterType = identifyMeterType(meter.meter?.name);
      switch (meterType) {
        case "meeting_minutes":
          minutesUsed = meter.consumedUnits || 0;
          break;
        case "email_drafts":
          emailDraftsUsed = meter.consumedUnits || 0;
          break;
        case "storage_bytes":
          storageUsedBytes = meter.consumedUnits || 0;
          break;
      }
    }

    // Update cache with fresh data (fire-and-forget, don't block response)
    updateSubscriptionCache({
      userId,
      tier,
      status,
      polarCustomerId: customer.id,
      polarSubscriptionId: activeSubscription?.id ?? null,
      minutesUsed,
      emailDraftsUsed,
      storageUsedBytes,
    }).catch((err) => console.error("[Polar Usage] Cache update failed:", err));

    return {
      tier,
      minutesUsed,
      emailDraftsUsed,
      storageUsedBytes,
      activeSubscriptions: (subscriptions.result.items || []).map((sub) => ({
        id: sub.id,
        productId: sub.productId,
        status: sub.status,
      })),
    };
  } catch (error) {
    console.error("[Polar Usage] Failed to get customer state from Polar:", error);

    // Record sync error for debugging
    recordCacheSyncError(
      userId,
      error instanceof Error ? error.message : "Unknown error"
    ).catch(() => {});

    // Fall back to cache
    const cached = await getSubscriptionFromCache(userId);
    if (cached) {
      if (isCacheTooOld(cached)) {
        console.warn("[Polar Usage] Cache too old, cannot use as fallback");
        return null;
      }

      console.log("[Polar Usage] Using cached subscription data as fallback");
      return {
        tier: cached.tier,
        minutesUsed: cached.usage.minutesUsed,
        emailDraftsUsed: cached.usage.emailDraftsUsed,
        storageUsedBytes: cached.usage.storageUsedBytes,
        activeSubscriptions: [],
      };
    }

    return null;
  }
}

/**
 * Check if a user can start/join a meeting based on their subscription limits
 *
 * Fail behavior:
 * - Polar NOT configured (dev/local): Allow with free tier limits
 * - Polar configured but errors: Fail closed (deny) to prevent unbilled usage
 *
 * @param userId - The user's ID
 * @returns Meeting limit check result
 */
export async function canUserStartMeeting(userId: string): Promise<MeetingLimitCheck> {
  // When Polar is not configured (dev/local), allow with free tier limits
  // This enables local development without billing integration
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured, allowing meeting with free tier limits");
    return {
      allowed: true,
      tier: "free",
      remainingMinutes: TIER_LIMITS.free.minutesPerMonth,
      minutesUsed: 0,
      minutesLimit: TIER_LIMITS.free.minutesPerMonth,
      reason: "Polar not configured (dev mode)",
    };
  }

  try {
    const customerState = await getCustomerState(userId);

    // If no customer state found, treat as free tier
    if (!customerState) {
      return {
        allowed: true, // Allow by default, but with free tier limits
        tier: "free",
        remainingMinutes: TIER_LIMITS.free.minutesPerMonth,
        minutesUsed: 0,
        minutesLimit: TIER_LIMITS.free.minutesPerMonth,
      };
    }

    const { tier, minutesUsed } = customerState;
    const limits = TIER_LIMITS[tier];
    const minutesLimit = limits.minutesPerMonth;

    // Check if tier has unlimited minutes
    if (isUnlimitedMinutes(minutesLimit)) {
      return {
        allowed: true,
        tier,
        remainingMinutes: -1, // -1 indicates unlimited (avoid Number.MAX_SAFE_INTEGER)
        minutesUsed,
        minutesLimit,
      };
    }

    const remainingMinutes = Math.max(0, minutesLimit - minutesUsed);
    const allowed = remainingMinutes > 0;

    return {
      allowed,
      tier,
      remainingMinutes,
      minutesUsed,
      minutesLimit,
      reason: allowed ? undefined : "Monthly minutes limit reached",
    };
  } catch (error) {
    console.error("[Polar Usage] Failed to check meeting limits:", error);
    // Fail closed: deny access when billing service is unavailable
    // This prevents unbilled usage during outages
    return {
      allowed: false,
      tier: "free",
      remainingMinutes: 0,
      minutesUsed: 0,
      minutesLimit: 0,
      reason: "Unable to verify usage limits. Please try again.",
    };
  }
}

/**
 * Check if a user can create an email draft based on their subscription limits
 *
 * Fail behavior (consistent with canUserStartMeeting):
 * - Polar NOT configured (dev/local): Allow with limited drafts for testing
 * - Polar configured but errors: Fail closed (deny)
 *
 * @param userId - The user's ID
 * @returns Whether the user can create an email draft
 */
export async function canUserCreateEmailDraft(userId: string): Promise<{
  allowed: boolean;
  tier: SubscriptionTier;
  remainingDrafts: number;
  reason?: string;
}> {
  // When Polar is not configured (dev/local), use free tier limits
  // This is consistent with canUserStartMeeting behavior
  if (!polarClient) {
    const freeTierDrafts = TIER_LIMITS.free.emailDraftsPerMonth;
    console.warn("[Polar Usage] Polar client not configured, using free tier limits for email drafts");
    return {
      allowed: freeTierDrafts > 0,
      tier: "free",
      remainingDrafts: freeTierDrafts,
      reason: "Polar not configured (dev mode)",
    };
  }

  try {
    const customerState = await getCustomerState(userId);

    if (!customerState) {
      return {
        allowed: false,
        tier: "free",
        remainingDrafts: 0,
        reason: "Free tier does not include email drafts",
      };
    }

    const { tier, emailDraftsUsed } = customerState;
    const limits = TIER_LIMITS[tier];

    // Free tier has no email drafts
    if (limits.emailDraftsPerMonth === 0) {
      return {
        allowed: false,
        tier,
        remainingDrafts: 0,
        reason: "Email drafts not included in current plan",
      };
    }

    // Check unlimited (enterprise)
    if (isUnlimited(limits.emailDraftsPerMonth)) {
      return {
        allowed: true,
        tier,
        remainingDrafts: -1, // -1 indicates unlimited (avoid Number.MAX_SAFE_INTEGER)
      };
    }

    const remainingDrafts = Math.max(0, limits.emailDraftsPerMonth - emailDraftsUsed);
    const allowed = remainingDrafts > 0;

    return {
      allowed,
      tier,
      remainingDrafts,
      reason: allowed ? undefined : "Monthly email draft limit reached",
    };
  } catch (error) {
    console.error("[Polar Usage] Failed to check email draft limits:", error);
    // Fail closed: deny when billing service is unavailable
    return {
      allowed: false,
      tier: "free",
      remainingDrafts: 0,
      reason: "Unable to verify limits. Please try again.",
    };
  }
}
