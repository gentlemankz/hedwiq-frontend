import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingHistory } from "@/lib/db/meeting-data";

/**
 * GET /api/meetings/[meetingId]/history
 *
 * Get full meeting history with all data:
 * - Meeting info + host
 * - All participant sessions
 * - Full transcription
 * - All insights
 * - All document references
 * - All user notes
 * - Computed stats
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
    const history = await getMeetingHistory(meetingId);

    if (!history) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Check if user was a participant or is the host
    const isParticipant = history.sessions.some(
      (s) => s.userId === session.user.id
    );
    const isHost = history.host.id === session.user.id;

    if (!isParticipant && !isHost) {
      return NextResponse.json(
        { error: "You don't have access to this meeting's history" },
        { status: 403 }
      );
    }

    // For non-hosts, only return their own notes
    if (!isHost) {
      history.notes = history.notes.filter(
        (n) => n.userId === session.user.id
      );
    }

    return NextResponse.json(history);
  } catch (error) {
    console.error("Get meeting history error:", error);
    return NextResponse.json(
      { error: "Failed to get meeting history" },
      { status: 500 }
    );
  }
}
