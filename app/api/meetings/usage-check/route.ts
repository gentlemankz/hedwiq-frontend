/**
 * Meeting Usage Check API
 *
 * Check if a user can start/join a meeting based on their subscription limits.
 * This endpoint is called before generating LiveKit tokens.
 *
 * GET /api/meetings/usage-check
 * - Returns the user's current usage status and whether they can join
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { canUserStartMeeting } from "@/lib/polar/usage";

/**
 * GET /api/meetings/usage-check
 *
 * Check if the authenticated user can start or join a meeting.
 * Does not create a session - just checks limits.
 */
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limitCheck = await canUserStartMeeting(session.user.id);

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          allowed: false,
          error: "LIMIT_EXCEEDED",
          message: limitCheck.reason || "Monthly meeting minutes limit reached",
          tier: limitCheck.tier,
          minutesUsed: limitCheck.minutesUsed,
          minutesLimit: limitCheck.minutesLimit,
          remainingMinutes: limitCheck.remainingMinutes,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      allowed: true,
      tier: limitCheck.tier,
      minutesUsed: limitCheck.minutesUsed,
      minutesLimit: limitCheck.minutesLimit,
      remainingMinutes: limitCheck.remainingMinutes,
    });
  } catch (error) {
    console.error("[Usage Check API] Error:", error);

    // Fail closed: deny access when billing service is unavailable
    // This prevents unbilled usage during outages
    // Users will see an error message and can retry
    return NextResponse.json(
      {
        allowed: false,
        error: "SERVICE_UNAVAILABLE",
        message:
          "Unable to verify usage limits. Please try again in a moment.",
        // Include tier info for UI display
        tier: "unknown",
        minutesUsed: 0,
        minutesLimit: 0,
        remainingMinutes: 0,
      },
      { status: 503 }
    );
  }
}
