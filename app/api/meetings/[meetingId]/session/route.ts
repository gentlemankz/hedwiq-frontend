import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isMeetingHost, getMeetingById } from "@/lib/db/meeting";
import {
  createMeetingSession,
  endMeetingSession,
  getActiveSession,
  validateSessionOwnership,
} from "@/lib/db/meeting-data";
import { canUserStartMeeting } from "@/lib/polar/usage";

/**
 * POST /api/meetings/[meetingId]/session
 *
 * Create a new session when user joins a meeting.
 * Returns the session ID to be used when leaving.
 *
 * Performs usage limit check before allowing user to join.
 *
 * Body:
 * - roomId: string (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  // Parse request body
  let body: { roomId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.roomId) {
    return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  }

  try {
    // Verify meeting exists
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Check if user is host
    const isHost = await isMeetingHost(meetingId, session.user.id);

    // Always perform server-side limit check
    // Never trust client-side flags - they can be bypassed
    const limitCheck = await canUserStartMeeting(session.user.id);

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
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

    // Create meeting session
    const sessionId = await createMeetingSession({
      meetingId,
      userId: session.user.id,
      roomId: body.roomId,
      isHost,
    });

    return NextResponse.json({
      sessionId,
      isHost,
      usage: {
        tier: limitCheck.tier,
        minutesUsed: limitCheck.minutesUsed,
        minutesLimit: limitCheck.minutesLimit,
        remainingMinutes: limitCheck.remainingMinutes,
      },
    });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

/** Valid source values for session end tracking */
const VALID_SOURCES = ["frontend", "agent"] as const;
type SessionSource = (typeof VALID_SOURCES)[number];

/**
 * PATCH /api/meetings/[meetingId]/session
 *
 * End a session when user leaves a meeting.
 * Also reports usage to Polar for billing (with source tracking for deduplication).
 *
 * Body:
 * - sessionId: string (required)
 * - source: string (optional, for deduplication tracking: "frontend" | "agent")
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  // Parse request body
  let body: { sessionId?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  // Validate and sanitize source parameter
  // Only allow known values to prevent analytics pollution
  const rawSource = body.source || "frontend";
  const source: SessionSource = VALID_SOURCES.includes(rawSource as SessionSource)
    ? (rawSource as SessionSource)
    : "frontend";

  try {
    // Verify the session belongs to the current user
    const isOwner = await validateSessionOwnership(body.sessionId, session.user.id);
    if (!isOwner) {
      console.warn("[Session API] Ownership validation failed");
      return NextResponse.json(
        { error: "You can only end your own sessions" },
        { status: 403 }
      );
    }

    const result = await endMeetingSession(body.sessionId, source);

    // Reduced logging - only log duration, not PII
    if (result) {
      console.debug(`[Session API] Session ended: duration=${result.durationSeconds}s`);
    }

    return NextResponse.json({ success: true, durationSeconds: result?.durationSeconds });
  } catch (error) {
    console.error("[Session API] End session error:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meetings/[meetingId]/session
 *
 * Get the current active session for the user in this meeting.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  try {
    const activeSession = await getActiveSession(meetingId, session.user.id);

    return NextResponse.json({ session: activeSession });
  } catch (error) {
    console.error("Get session error:", error);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}
