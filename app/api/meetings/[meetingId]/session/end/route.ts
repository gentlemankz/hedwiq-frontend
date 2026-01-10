/**
 * Session End API - POST compatible endpoint
 *
 * This endpoint exists specifically for browser compatibility with sendBeacon.
 * sendBeacon only supports POST requests, but ending a session is conceptually
 * a PATCH/DELETE operation. This POST endpoint provides a fallback for reliable
 * session end reporting during page unload.
 *
 * Use this endpoint when:
 * - Using navigator.sendBeacon()
 * - fetch with keepalive on PATCH is unreliable
 * - Browser compatibility is critical
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  endMeetingSession,
  validateSessionOwnership,
} from "@/lib/db/meeting-data";
import { getMeetingById } from "@/lib/db/meeting";
import { listTeamInvitesForMeeting } from "@/lib/db/team";
import { dispatchMeetingEndTrigger } from "@/lib/agents/trigger-dispatcher";

/** Valid source values for session end tracking */
const VALID_SOURCES = ["frontend", "agent"] as const;
type SessionSource = (typeof VALID_SOURCES)[number];

/**
 * POST /api/meetings/[meetingId]/session/end
 *
 * End a session when user leaves a meeting.
 * This endpoint is specifically designed for sendBeacon compatibility.
 *
 * Body:
 * - sessionId: string (required)
 * - source: string (optional, for deduplication tracking: "frontend" | "agent")
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
  // sendBeacon sends data as Blob/FormData, but we expect JSON
  let body: { sessionId?: string; source?: string };
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("text/plain")) {
      // sendBeacon might send as text/plain
      const text = await request.text();
      body = JSON.parse(text);
    } else {
      // Try to parse as JSON anyway
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  // Validate and sanitize source parameter
  const rawSource = body.source || "frontend";
  const source: SessionSource = VALID_SOURCES.includes(rawSource as SessionSource)
    ? (rawSource as SessionSource)
    : "frontend";

  try {
    // Verify the session belongs to the current user
    const isOwner = await validateSessionOwnership(body.sessionId, session.user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "You can only end your own sessions" },
        { status: 403 }
      );
    }

    const result = await endMeetingSession(body.sessionId, source);

    // Dispatch meeting end triggers in the background
    // Note: For serverless environments with short timeouts, consider using a job queue
    // (e.g., Inngest, QStash, or database-backed queue) for guaranteed delivery.
    if (result) {
      Promise.all([
        getMeetingById(result.meetingId),
        listTeamInvitesForMeeting(result.meetingId),
      ])
        .then(async ([meetingData, teamInvites]) => {
          if (!meetingData) return;

          const folderId = meetingData.folderId ?? undefined;
          const baseParams = {
            meetingId: result.meetingId,
            userId: result.userId,
            folderId,
          };

          // Dispatch for each team to catch team-scoped triggers
          // Also dispatch once without teamId to catch global/folder-only triggers
          // Dedupe teamIds in case multiple invites exist for the same team
          const teamIds = [...new Set(teamInvites.map((invite) => invite.team.id))];
          const dispatches = [
            // Global dispatch (no team scope) - catches triggers without team scope
            dispatchMeetingEndTrigger(baseParams),
            // Per-team dispatches - catches ONLY team-scoped triggers (exactTeamScope prevents duplicates)
            ...teamIds.map((teamId) =>
              dispatchMeetingEndTrigger({ ...baseParams, teamId, exactTeamScope: true })
            ),
          ];

          const results = await Promise.all(dispatches);
          const totalMatched = results.reduce((sum, r) => sum + r.triggersMatched, 0);
          const totalSucceeded = results.reduce((sum, r) => sum + r.executionsSucceeded, 0);
          const totalFailed = results.reduce((sum, r) => sum + r.executionsFailed, 0);

          if (totalMatched > 0) {
            console.log(
              `[Session End] Dispatched meeting_end triggers: ${totalMatched} matched, ` +
              `${totalSucceeded} succeeded, ${totalFailed} failed`
            );
          }
        })
        .catch((err) => {
          console.error("[Session End] Failed to dispatch meeting_end trigger:", err);
        });
    }

    return NextResponse.json({
      success: true,
      durationSeconds: result?.durationSeconds,
    });
  } catch (error) {
    console.error("[Session End API] Error:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}
