/**
 * Polar Usage Ingestion Functions
 *
 * Functions for reporting usage to Polar:
 * - Meeting minutes
 * - Email drafts
 * - Storage changes
 */

import { polarClient } from "@/lib/auth";
import { USAGE_EVENTS } from "./constants";
import { generateMinutesIdempotencyKey, generateDraftIdempotencyKey } from "./idempotency";
import { scheduleUsageSync } from "./sync";
import type { UsageReport } from "./types";

// ============================================================================
// Usage Ingestion Functions
// ============================================================================

/**
 * Report meeting minutes usage
 *
 * Strategy (updated for free tier support):
 * 1. ALWAYS track locally first (ensures free users are tracked)
 * 2. Try to report to Polar for paid users (async, non-blocking)
 * 3. Local tracking is the source of truth for free tier limits
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
    idempotencyKey?: string; // Optional pre-generated idempotency key
  }
): Promise<UsageReport> {
  const source = metadata?.source || "unknown";

  if (minutes <= 0) {
    return { success: true }; // Nothing to report
  }

  // Import cache functions dynamically to avoid circular dependencies
  const { incrementLocalMinutesUsage } = await import("@/lib/polar/subscription-cache");

  // Generate idempotency key if not provided
  // This prevents duplicate counting on retries within the same 5-minute interval
  const idempotencyKey = metadata?.idempotencyKey ||
    generateMinutesIdempotencyKey(metadata?.sessionId, metadata?.roomId);

  // Step 1: ALWAYS track locally first - this is CRITICAL for free tier limits
  // This ensures free users' usage is tracked even without Polar
  const localResult = await incrementLocalMinutesUsage(userId, minutes, idempotencyKey);

  // Check for deduplication
  if (localResult.deduplicated) {
    console.debug(
      `[Polar Usage] DEDUP: Local increment skipped (same idempotency key), total=${localResult.minutesUsed} (source=${source})`
    );
    return { success: true }; // Deduplicated - don't report to Polar either
  }

  if (!localResult.success) {
    console.error(
      `[Polar Usage] CRITICAL: Failed to track local usage for ${userId}: ${localResult.error}`
    );
    // Continue to try Polar, but local tracking failed
  } else {
    console.debug(
      `[Polar Usage] Local tracking: +${minutes} mins, total=${localResult.minutesUsed} (source=${source})`
    );
  }

  // Step 2: Try to report to Polar for paid users (best effort)
  // This is async and won't block the response
  if (polarClient) {
    try {
      // Check if user has a Polar customer record (paid user) using CACHED status
      // This avoids an extra API call on every usage report
      const { hasPolarCustomer } = await import("@/lib/polar/subscription-cache");
      const isPaidUser = await hasPolarCustomer(userId);

      if (isPaidUser) {
        // User has Polar customer - report to Polar
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
          `[Polar Usage] Polar report: ${minutes} minutes for paid user (source=${source})`
        );

        // Schedule cache sync after delay
        scheduleUsageSync(userId, 5000);
      } else {
        // Free user - no Polar customer, local tracking is sufficient
        console.debug(
          `[Polar Usage] Free user ${userId}, skipping Polar report (local tracking active)`
        );
      }
    } catch (error) {
      // Log but don't fail - local tracking is the primary mechanism for free users
      console.warn(
        "[Polar Usage] Polar report failed (local tracking succeeded):",
        error instanceof Error ? error.message : "Unknown"
      );
    }
  } else {
    console.debug("[Polar Usage] Polar not configured, using local tracking only");
  }

  // Return success if local tracking succeeded
  return {
    success: localResult.success,
    error: localResult.success ? undefined : localResult.error,
  };
}

/**
 * Report email draft usage
 *
 * Strategy (updated for free tier support):
 * 1. ALWAYS track locally first (ensures free users are tracked)
 * 2. Try to report to Polar for paid users (async, non-blocking)
 * 3. Local tracking is the source of truth for free tier limits
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
    actionId?: string; // Unique action ID for idempotency
    idempotencyKey?: string; // Optional pre-generated idempotency key
  }
): Promise<UsageReport> {
  if (count <= 0) {
    return { success: true }; // Nothing to report
  }

  // Import cache functions dynamically to avoid circular dependencies
  const { incrementLocalEmailDraftsUsage } = await import("@/lib/polar/subscription-cache");

  // Generate idempotency key if not provided
  // This prevents duplicate counting on retries
  const idempotencyKey = metadata?.idempotencyKey ||
    generateDraftIdempotencyKey(metadata?.meetingId, metadata?.actionId);

  // Step 1: ALWAYS track locally first - this is CRITICAL for free tier limits
  const localResult = await incrementLocalEmailDraftsUsage(userId, count, idempotencyKey);

  // Check for deduplication
  if (localResult.deduplicated) {
    console.debug(
      `[Polar Usage] DEDUP: Email draft increment skipped (same idempotency key), total=${localResult.emailDraftsUsed}`
    );
    return { success: true }; // Deduplicated - don't report to Polar either
  }

  if (!localResult.success) {
    console.error(
      `[Polar Usage] CRITICAL: Failed to track local email draft usage for ${userId}: ${localResult.error}`
    );
  } else {
    console.debug(
      `[Polar Usage] Local tracking: +${count} email draft(s), total=${localResult.emailDraftsUsed}`
    );
  }

  // Step 2: Try to report to Polar for paid users (best effort)
  if (polarClient) {
    try {
      // Check if user has a Polar customer record (paid user) using CACHED status
      // This avoids an extra API call on every usage report
      const { hasPolarCustomer } = await import("@/lib/polar/subscription-cache");
      const isPaidUser = await hasPolarCustomer(userId);

      if (isPaidUser) {
        // User has Polar customer - report to Polar
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

        console.debug(`[Polar Usage] Polar report: ${count} email draft(s) for paid user`);

        // Schedule cache sync
        scheduleUsageSync(userId, 2000);
      } else {
        // Free user - no Polar customer, local tracking is sufficient
        console.debug(
          `[Polar Usage] Free user ${userId}, skipping Polar email draft report (local tracking active)`
        );
      }
    } catch (error) {
      // Log but don't fail - local tracking is the primary mechanism for free users
      console.warn(
        "[Polar Usage] Polar email draft report failed (local tracking succeeded):",
        error instanceof Error ? error.message : "Unknown"
      );
    }
  } else {
    console.debug("[Polar Usage] Polar not configured, using local email draft tracking only");
  }

  // Return success if local tracking succeeded
  return {
    success: localResult.success,
    error: localResult.success ? undefined : localResult.error,
  };
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
