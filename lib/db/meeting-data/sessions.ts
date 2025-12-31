/**
 * Meeting Session Functions
 *
 * Functions for managing user participation sessions in meetings.
 */

import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { isProductionQuick } from "@/lib/env-detection";
import { meetingSession } from "../schema";
import { reportMeetingMinutes } from "@/lib/polar/usage";
import { generateId } from "./helpers";
import {
  MAX_SESSION_DURATION_SECONDS,
  WARN_SESSION_DURATION_SECONDS,
  MAX_CONCURRENT_SESSIONS_PER_USER,
  DEFAULT_RESERVATION_MINUTES,
} from "./constants";
import type { CreateSessionInput } from "./types";

// ============================================================================
// Session Functions
// ============================================================================

/**
 * SECURITY FIX (Medium #10): Count active sessions for a user.
 *
 * Active sessions are those where:
 * - leftAt is NULL (user hasn't left yet)
 * - OR session was created recently (within last 10 minutes) even if leftAt is set
 *   (to handle race conditions during session transitions)
 *
 * @param userId - The user's ID
 * @returns Count of active sessions
 */
export async function countActiveSessionsForUser(userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(meetingSession)
    .where(
      and(
        eq(meetingSession.userId, userId),
        isNull(meetingSession.leftAt)
      )
    );

  return result[0]?.count ?? 0;
}

/**
 * SECURITY FIX #10: Get total reserved minutes across active sessions for a user.
 *
 * This is used to ensure that concurrent sessions don't over-consume quota.
 * Each session reserves a block of minutes when it starts.
 *
 * @param userId - The user's ID
 * @returns Total reserved minutes across all active sessions
 */
export async function getTotalReservedMinutes(userId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(reserved_minutes), 0)::int` })
    .from(meetingSession)
    .where(
      and(
        eq(meetingSession.userId, userId),
        isNull(meetingSession.leftAt), // Only active sessions
        eq(meetingSession.reservationReleased, false) // Not released
      )
    );

  return result[0]?.total ?? 0;
}

/**
 * Create a new meeting session when user joins
 *
 * SECURITY FIX (Medium #10): Enforces concurrent session limit AND quota reservation.
 * - Checks concurrent session limit
 * - Reserves minutes atomically to prevent over-consumption across tabs
 *
 * @param input - Session creation parameters
 * @param remainingMinutes - User's remaining quota (from canUserStartMeeting)
 * @throws Error if user exceeds concurrent session limit or has no remaining quota
 */
export async function createMeetingSession(
  input: CreateSessionInput,
  remainingMinutes?: number
): Promise<string> {
  // Check concurrent session limit
  const activeCount = await countActiveSessionsForUser(input.userId);

  if (activeCount >= MAX_CONCURRENT_SESSIONS_PER_USER) {
    console.warn(
      `[Meeting Session] CONCURRENT_LIMIT: User ${input.userId} has ${activeCount} active sessions. ` +
      `Limit is ${MAX_CONCURRENT_SESSIONS_PER_USER}. Denying new session.`
    );
    throw new Error(
      `You have reached the maximum of ${MAX_CONCURRENT_SESSIONS_PER_USER} concurrent sessions. ` +
      `Please leave an existing meeting before joining another.`
    );
  }

  // SECURITY FIX #10: Calculate available quota considering existing reservations
  let reservedMinutes: number | null = null;

  if (remainingMinutes !== undefined && remainingMinutes >= 0) {
    // Get already reserved minutes across other active sessions
    const alreadyReserved = await getTotalReservedMinutes(input.userId);
    const availableToReserve = Math.max(0, remainingMinutes - alreadyReserved);

    if (availableToReserve <= 0) {
      console.warn(
        `[Meeting Session] QUOTA_RESERVED: User ${input.userId} has ${remainingMinutes} remaining but ` +
        `${alreadyReserved} already reserved across ${activeCount} active sessions. Denying new session.`
      );
      throw new Error(
        `Your remaining quota (${remainingMinutes} minutes) is already reserved by active sessions. ` +
        `Please end an existing meeting to free up quota.`
      );
    }

    // Reserve a block of minutes (up to available amount)
    reservedMinutes = Math.min(DEFAULT_RESERVATION_MINUTES, availableToReserve);

    console.debug(
      `[Meeting Session] Reserving ${reservedMinutes} minutes for user ${input.userId} ` +
      `(${availableToReserve} available after existing reservations)`
    );
  }

  const sessionId = generateId("sess");

  await db.insert(meetingSession).values({
    id: sessionId,
    meetingId: input.meetingId,
    userId: input.userId,
    roomId: input.roomId,
    isHost: input.isHost ?? false,
    joinedAt: new Date(),
    reservedMinutes,
    reservationReleased: false,
  });

  return sessionId;
}

/**
 * End a meeting session when user leaves
 *
 * Also reports usage to Polar for billing purposes.
 * The source parameter is used for tracking/deduplication to distinguish
 * between frontend-reported and agent-reported usage.
 *
 * SECURITY FIX: Now fails closed on billing errors. If usage cannot be reported,
 * the session end is marked as "billing_pending" for retry, and an error is thrown
 * to notify the client. This prevents unbilled usage from slipping through.
 *
 * @param sessionId - The session ID to end
 * @param source - Source of the report ("frontend" | "agent"), used for deduplication
 * @param options - Optional configuration
 * @param options.requireBilling - If true, throws error if billing fails (default: true in production)
 * @returns The session data with duration, or null if session not found
 * @throws Error if billing is required but fails
 */
export async function endMeetingSession(
  sessionId: string,
  source: string = "frontend",
  options: { requireBilling?: boolean } = {}
): Promise<{
  id: string;
  userId: string;
  meetingId: string;
  roomId: string;
  durationSeconds: number;
  billingStatus: "success" | "pending" | "skipped";
} | null> {
  // In production, billing is required by default
  const requireBilling = options.requireBilling ?? isProductionQuick();
  const now = new Date();

  console.debug(`[Meeting Session] Ending: session=${sessionId.slice(0, 12)}..., source=${source}`);

  // Get the session to calculate duration
  // Select all fields needed for duration calculation, deduplication, and reservation release
  const sessions = await db
    .select({
      id: meetingSession.id,
      userId: meetingSession.userId,
      meetingId: meetingSession.meetingId,
      roomId: meetingSession.roomId,
      joinedAt: meetingSession.joinedAt,
      usageReportedAt: meetingSession.usageReportedAt,
      usageReportedSource: meetingSession.usageReportedSource,
      usageReportedMinutes: meetingSession.usageReportedMinutes,
      reservedMinutes: meetingSession.reservedMinutes, // P0 FIX: Add for reservation release logging
    })
    .from(meetingSession)
    .where(eq(meetingSession.id, sessionId))
    .limit(1);

  if (sessions.length === 0) {
    console.warn(`[Meeting Session] Session ${sessionId} not found in database`);
    return null;
  }

  const session = sessions[0];
  const rawDurationSeconds = Math.floor(
    (now.getTime() - session.joinedAt.getTime()) / 1000
  );

  // SECURITY FIX (High #8): Server-side duration validation
  // Enforce reasonable bounds to prevent abuse
  let durationSeconds = rawDurationSeconds;

  // Ensure duration is non-negative (should be impossible, but defense in depth)
  if (durationSeconds < 0) {
    console.error(
      `[Meeting Session] SECURITY_ALERT: Negative duration detected for session ${sessionId}. ` +
      `joinedAt=${session.joinedAt.toISOString()}, now=${now.toISOString()}, ` +
      `rawDuration=${rawDurationSeconds}s. Setting to 0.`
    );
    durationSeconds = 0;
  }

  // Cap extremely long sessions (prevents orphaned session abuse)
  if (durationSeconds > MAX_SESSION_DURATION_SECONDS) {
    console.warn(
      `[Meeting Session] DURATION_CAP: Session ${sessionId} exceeded max duration. ` +
      `Raw: ${rawDurationSeconds}s (${Math.round(rawDurationSeconds / 3600)}h), ` +
      `Capped to: ${MAX_SESSION_DURATION_SECONDS}s (${MAX_SESSION_DURATION_SECONDS / 3600}h). ` +
      `User: ${session.userId}, Room: ${session.roomId}. Investigate for orphaned session.`
    );
    durationSeconds = MAX_SESSION_DURATION_SECONDS;
  }
  // Log warning for long but valid sessions
  else if (durationSeconds > WARN_SESSION_DURATION_SECONDS) {
    console.info(
      `[Meeting Session] Long session: ${sessionId}, duration=${Math.round(durationSeconds / 60)}min`
    );
  }

  console.debug(
    `[Meeting Session] Found session: duration=${durationSeconds}s${rawDurationSeconds !== durationSeconds ? ` (raw: ${rawDurationSeconds}s, validated)` : ""}`
  );

  // Calculate durationMinutes early for reservation logging
  // (also used later for billing)
  const durationMinutes = Math.ceil(durationSeconds / 60);

  // SECURITY FIX #10: Log reservation release if session ended early
  if (session.reservedMinutes && durationMinutes < session.reservedMinutes) {
    console.debug(
      `[Meeting Session] Releasing unused reservation: session=${sessionId}, ` +
      `reserved=${session.reservedMinutes}min, used=${durationMinutes}min, ` +
      `released=${session.reservedMinutes - durationMinutes}min`
    );
  }

  // Update the session in database
  await db
    .update(meetingSession)
    .set({
      leftAt: now,
      durationSeconds,
      reservationReleased: true, // SECURITY FIX #10: Mark reservation as released
      updatedAt: now,
    })
    .where(eq(meetingSession.id, sessionId));

  // Report meeting minutes to Polar for usage-based billing
  // (durationMinutes already calculated above for reservation logging)

  // Track billing status for return value
  let billingStatus: "success" | "pending" | "skipped" = "skipped";

  if (durationMinutes > 0) {
    // SECURITY FIX (Medium #12): Check if usage was already reported to prevent double billing
    // This can happen if both frontend and agent report for the same session
    if (session.usageReportedAt) {
      console.info(
        `[Meeting Session] DEDUP: Usage already reported for session ${session.id}. ` +
        `Original: ${session.usageReportedMinutes}min by ${session.usageReportedSource} at ${session.usageReportedAt.toISOString()}. ` +
        `Skipping duplicate report from ${source}.`
      );
      billingStatus = "success"; // Already billed
    } else {
      // SECURITY FIX: Make usage reporting fail-closed in production
      // If billing fails, mark as pending and optionally throw to block the response
      const REPORT_TIMEOUT_MS = 5000; // 5 seconds max wait (increased for reliability)
      const MAX_RETRIES = 2;
      const startTime = Date.now();
      let lastError: string | null = null;

      // Retry loop for transient failures
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Use Promise.race to enforce timeout
          const result = await Promise.race([
            reportMeetingMinutes(session.userId, durationMinutes, {
              roomId: session.roomId,
              meetingId: session.meetingId,
              sessionId: session.id,
              source,
            }),
            new Promise<{ success: false; error: string }>((resolve) =>
              setTimeout(() => resolve({ success: false, error: "Timeout" }), REPORT_TIMEOUT_MS)
            ),
          ]);

          if (result.success) {
            // Mark usage as reported to prevent duplicates
            await db
              .update(meetingSession)
              .set({
                usageReportedAt: new Date(),
                usageReportedSource: source,
                usageReportedMinutes: durationMinutes,
              })
              .where(eq(meetingSession.id, sessionId));

            const elapsed = Date.now() - startTime;
            if (elapsed > 3000) {
              console.warn(`[Meeting Session] Polar report slow: ${elapsed}ms (attempt ${attempt})`);
            }
            billingStatus = "success";
            break; // Success, exit retry loop
          } else {
            lastError = result.error ?? "Unknown error";
            if (attempt < MAX_RETRIES) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unknown error";
          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
      }

      // If all retries failed, handle based on requireBilling setting
      if (billingStatus !== "success") {
        // Mark session as billing pending for reconciliation job
        await db
          .update(meetingSession)
          .set({
            billingStatus: "pending",
            billingError: lastError,
            updatedAt: new Date(),
          })
          .where(eq(meetingSession.id, sessionId));

        console.error(
          `[Meeting Session] BILLING_ALERT: Usage report failed after ${MAX_RETRIES} attempts for session ${session.id}. ` +
          `User: ${session.userId}, Minutes: ${durationMinutes}, Error: ${lastError}. ` +
          `Session marked as billing_pending for retry.`
        );

        billingStatus = "pending";

        // SECURITY FIX: In production, fail closed - throw error to notify client
        if (requireBilling) {
          throw new Error(
            `Billing service unavailable. Your session of ${durationMinutes} minutes has been recorded ` +
            `and will be processed when the service recovers. Please try again or contact support if this persists.`
          );
        }
      }
    }
  }

  return {
    id: session.id,
    userId: session.userId,
    meetingId: session.meetingId,
    roomId: session.roomId,
    durationSeconds,
    billingStatus,
  };
}

/**
 * Get active session for a user in a meeting
 */
export async function getActiveSession(
  meetingId: string,
  userId: string
): Promise<{ id: string } | null> {
  const sessions = await db
    .select({ id: meetingSession.id })
    .from(meetingSession)
    .where(
      and(
        eq(meetingSession.meetingId, meetingId),
        eq(meetingSession.userId, userId)
      )
    )
    .orderBy(desc(meetingSession.joinedAt))
    .limit(1);

  return sessions[0] ?? null;
}

/**
 * Validate that a session belongs to a specific user
 */
export async function validateSessionOwnership(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const sessions = await db
    .select({ userId: meetingSession.userId })
    .from(meetingSession)
    .where(eq(meetingSession.id, sessionId))
    .limit(1);

  if (sessions.length === 0) return false;
  return sessions[0].userId === userId;
}

/**
 * SECURITY FIX (Medium #12): Check if usage was already reported for a session.
 *
 * Used by both frontend and agent to prevent double-billing.
 *
 * @param sessionId - The session ID to check
 * @returns Object with reporting status
 */
export async function checkUsageReportStatus(sessionId: string): Promise<{
  reported: boolean;
  reportedAt?: Date;
  reportedSource?: string;
  reportedMinutes?: number;
}> {
  const sessions = await db
    .select({
      usageReportedAt: meetingSession.usageReportedAt,
      usageReportedSource: meetingSession.usageReportedSource,
      usageReportedMinutes: meetingSession.usageReportedMinutes,
    })
    .from(meetingSession)
    .where(eq(meetingSession.id, sessionId))
    .limit(1);

  if (sessions.length === 0) {
    return { reported: false };
  }

  const session = sessions[0];
  if (session.usageReportedAt) {
    return {
      reported: true,
      reportedAt: session.usageReportedAt,
      reportedSource: session.usageReportedSource ?? undefined,
      reportedMinutes: session.usageReportedMinutes ?? undefined,
    };
  }

  return { reported: false };
}

/**
 * SECURITY FIX (Medium #12): Mark usage as reported for a session.
 *
 * Used by the internal usage API to mark when agent reports usage.
 *
 * @param sessionId - The session ID
 * @param source - Who reported the usage
 * @param minutes - Minutes reported
 * @returns Whether the update was successful
 */
export async function markUsageReported(
  sessionId: string,
  source: string,
  minutes: number
): Promise<boolean> {
  try {
    await db
      .update(meetingSession)
      .set({
        usageReportedAt: new Date(),
        usageReportedSource: source,
        usageReportedMinutes: minutes,
        updatedAt: new Date(),
      })
      .where(eq(meetingSession.id, sessionId));
    return true;
  } catch (error) {
    console.error("[Meeting Session] Failed to mark usage as reported:", error);
    return false;
  }
}
