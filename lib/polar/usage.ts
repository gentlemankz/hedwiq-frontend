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
 * Get customer state from Polar
 *
 * @param userId - The user's ID (external customer ID)
 */
export async function getCustomerState(userId: string): Promise<CustomerState | null> {
  if (!polarClient) {
    console.warn("[Polar Usage] Polar client not configured");
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
    const activeSubscription = subscriptions.result.items?.[0];
    const tier = activeSubscription
      ? getTierFromProductId(activeSubscription.productId)
      : "free";

    // Extract usage from meters
    let minutesUsed = 0;
    let emailDraftsUsed = 0;
    let storageUsedBytes = 0;

    for (const meter of meters.result.items || []) {
      // The meter name corresponds to our event names
      const meterName = meter.meter?.name?.toLowerCase();
      if (meterName?.includes("meeting") || meterName?.includes("minutes")) {
        minutesUsed = meter.consumedUnits || 0;
      } else if (meterName?.includes("email") || meterName?.includes("draft")) {
        emailDraftsUsed = meter.consumedUnits || 0;
      } else if (meterName?.includes("storage") || meterName?.includes("bytes")) {
        storageUsedBytes = meter.consumedUnits || 0;
      }
    }

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
    console.error("[Polar Usage] Failed to get customer state:", error);
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
        remainingMinutes: Number.MAX_SAFE_INTEGER,
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
        remainingDrafts: Number.MAX_SAFE_INTEGER,
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
