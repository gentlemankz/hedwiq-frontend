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
// Usage Sync Helpers
// ============================================================================

/**
 * Pending sync timeouts per user
 * Used to debounce multiple sync requests in long-lived runtimes
 */
const pendingSyncs = new Map<string, NodeJS.Timeout>();

/**
 * Detect if running in a serverless environment where setTimeout won't survive request completion.
 * In serverless (Vercel, AWS Lambda, etc.), the process is torn down after request completion,
 * so setTimeout callbacks scheduled during a request may never execute.
 *
 * @returns true if running in serverless environment
 */
function isServerlessRuntime(): boolean {
  // Vercel serverless functions
  if (process.env.VERCEL === "1") return true;

  // AWS Lambda
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;

  // Netlify Functions
  if (process.env.NETLIFY === "true") return true;

  // Generic serverless indicator
  if (process.env.SERVERLESS === "true") return true;

  return false;
}

/**
 * Ensure a Polar customer exists for the given user ID.
 * This is important because events sent to non-existent customers may be dropped.
 *
 * NOTE: This function is now primarily used by getOrCreatePolarCustomer,
 * not as a preflight check before event ingestion (which was removed for performance).
 *
 * @param userId - The user's ID (external customer ID in Polar)
 * @returns Whether the customer exists or was verified
 */
export async function ensureCustomerExists(userId: string): Promise<{
  exists: boolean;
  customerId?: string;
  error?: string;
}> {
  if (!polarClient) {
    return { exists: false, error: "Polar not configured" };
  }

  try {
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });
    return { exists: true, customerId: customer.id };
  } catch {
    // Customer doesn't exist - this is expected for new users
    return { exists: false, error: "Customer not found" };
  }
}

/**
 * Schedule a usage sync for a user after a delay.
 * Multiple calls within the delay period are debounced to a single sync.
 *
 * ## Serverless Environment Behavior
 *
 * In serverless environments (Vercel, Lambda, Netlify), this function returns `false`
 * and does NOT schedule a sync. setTimeout callbacks may not execute because the
 * process is torn down after the response is sent.
 *
 * **Cache staleness implications:**
 * - After usage events are ingested, the cache may not reflect the new values
 * - Consumers relying on cached usage (UI displays, limit checks that fall back
 *   to cache on API errors) will see stale data until the next explicit
 *   `getCustomerState()` call succeeds
 * - For limit checks, this is generally acceptable because:
 *   1. Fresh data is fetched from Polar API when available
 *   2. Cache is only used as fallback when API fails
 *   3. Stale cache errs on the side of allowing access (better UX than blocking)
 *
 * **Recommendations for callers:**
 * - Check the return value; if `false`, consider calling `syncUsageFromPolar()`
 *   explicitly if fresh cache data is critical
 * - For accurate UI display, call `syncUsageFromPolar()` or `getCustomerState()`
 *   explicitly after operations that change usage
 * - For limit checks before operations, rely on `canUserStartMeeting()` which
 *   always tries to fetch fresh data from Polar
 *
 * @param userId - The user's ID
 * @param delayMs - Delay before syncing (default 5000ms to let Polar process and aggregate)
 * @returns `true` if sync was scheduled, `false` if skipped (serverless environment)
 */
export function scheduleUsageSync(userId: string, delayMs: number = 5000): boolean {
  // In serverless, setTimeout won't survive - skip scheduling
  // Return false so callers can react if needed (e.g., call syncUsageFromPolar explicitly)
  if (isServerlessRuntime()) {
    return false;
  }

  // Clear any existing pending sync for this user
  const existingTimeout = pendingSyncs.get(userId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Schedule new sync (only in long-lived Node.js runtimes)
  const timeout = setTimeout(async () => {
    pendingSyncs.delete(userId);

    try {
      // Fetch fresh state from Polar and update cache
      await syncUsageFromPolar(userId);
      console.debug("[Polar Usage] Scheduled sync completed");
    } catch (error) {
      console.error("[Polar Usage] Scheduled sync failed:", error instanceof Error ? error.message : "Unknown");
    }
  }, delayMs);

  pendingSyncs.set(userId, timeout);
  return true;
}

/**
 * Immediately sync usage from Polar to the database cache.
 *
 * Use this when you need to ensure the cache reflects current usage,
 * especially in serverless environments where `scheduleUsageSync` is a no-op.
 *
 * **When to call this:**
 * - After operations that change usage and you need to display updated values
 * - When the UI needs to show fresh usage data
 * - NOT needed for limit checks (they fetch fresh data automatically)
 *
 * @param userId - The user's ID
 * @returns The updated customer state, or null if sync failed
 */
export async function syncUsageFromPolar(userId: string): Promise<CustomerState | null> {
  // getCustomerState already updates the cache on success
  const state = await getCustomerState(userId);

  if (state) {
    console.debug(
      `[Polar Usage] Sync complete: minutes=${state.minutesUsed}, emails=${state.emailDraftsUsed}`
    );
  }

  return state;
}

/**
 * Force refresh usage for a user, bypassing any caching.
 * This is useful when you need to ensure the latest data from Polar.
 *
 * @param userId - The user's ID
 * @returns Fresh customer state from Polar
 */
export async function forceRefreshUsage(userId: string): Promise<CustomerState | null> {
  return syncUsageFromPolar(userId);
}

// ============================================================================
// Usage Ingestion Functions
// ============================================================================

/**
 * Report meeting minutes usage to Polar
 *
 * @param userId - The user's ID (maps to externalCustomerId in Polar)
 * @param minutes - Number of minutes to track
 * @param metadata - Optional additional metadata (roomId, meetingId, sessionId, source)
 */
export async function reportMeetingMinutes(
  userId: string,
  minutes: number,
  metadata?: {
    roomId?: string;
    meetingId?: string;
    sessionId?: string;
    source?: string; // "frontend" | "agent" for deduplication tracking
  }
): Promise<UsageReport> {
  const source = metadata?.source || "unknown";

  if (!polarClient) {
    console.debug("[Polar Usage] Polar not configured, skipping minutes report");
    return { success: false, error: "Polar not configured" };
  }

  if (minutes <= 0) {
    return { success: true }; // Nothing to report
  }

  try {
    // Ingest event directly - Polar handles customer lookup via externalCustomerId
    // OPTIMIZATION: Removed ensureCustomerExists preflight to avoid double API calls
    // If customer doesn't exist, Polar will return an error we can handle
    await polarClient.events.ingest({
      events: [
        {
          name: USAGE_EVENTS.MEETING_MINUTES,
          externalCustomerId: userId,
          metadata: {
            // Send both keys for backward compatibility during meter migration
            duration: minutes, // New key - meter aggregates on "duration" field
            minutes: minutes,  // Legacy key - for backwards compatibility
            ...metadata,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.debug(
      `[Polar Usage] Reported ${minutes} minutes (source=${source})`
    );

    // Schedule cache sync after delay to allow Polar to process and aggregate
    // Using 5s delay to ensure meter aggregation completes
    // NOTE: In serverless, this may not execute - see scheduleUsageSync docs
    scheduleUsageSync(userId, 5000);

    return { success: true };
  } catch (error) {
    // Log error with minimal PII
    console.error("[Polar Usage] Meeting minutes report failed:", error instanceof Error ? error.message : "Unknown");

    // Check if error is due to missing customer (could add retry with customer creation here if needed)
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
    console.debug("[Polar Usage] Polar not configured, skipping email draft report");
    return { success: false, error: "Polar not configured" };
  }

  if (count <= 0) {
    return { success: true };
  }

  try {
    // Ingest event directly - removed preflight check to avoid double API calls
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

    console.debug(`[Polar Usage] Reported ${count} email draft(s)`);

    // Schedule cache sync
    // NOTE: In serverless, this may not execute - see scheduleUsageSync docs
    scheduleUsageSync(userId, 2000);

    return { success: true };
  } catch (error) {
    console.error("[Polar Usage] Email draft report failed:", error instanceof Error ? error.message : "Unknown");
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
    console.debug("[Polar Usage] Polar not configured, skipping storage report");
    return { success: false, error: "Polar not configured" };
  }

  if (bytes === 0) {
    return { success: true };
  }

  try {
    // Ingest event directly - removed preflight check to avoid double API calls
    await polarClient.events.ingest({
      events: [
        {
          name: USAGE_EVENTS.STORAGE_BYTES,
          externalCustomerId: userId,
          metadata: {
            // Send both keys for backward compatibility during meter migration
            size: bytes,  // New key - meter aggregates on "size" field
            bytes: bytes, // Legacy key - for backwards compatibility
            ...metadata,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.debug(`[Polar Usage] Reported ${bytes} bytes storage change`);

    // Schedule cache sync
    // NOTE: In serverless, this may not execute - see scheduleUsageSync docs
    scheduleUsageSync(userId, 2000);

    return { success: true };
  } catch (error) {
    console.error("[Polar Usage] Storage report failed:", error instanceof Error ? error.message : "Unknown");
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
