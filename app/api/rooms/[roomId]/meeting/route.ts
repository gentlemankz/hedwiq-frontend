import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomId } from "@/lib/validation";
import { getMeetingByRoomId } from "@/lib/db/meeting";
import { getAgendaByMeetingId, getAgendaWithItems } from "@/lib/db/agenda";

/**
 * GET /api/rooms/[roomId]/meeting
 *
 * Get meeting details and agenda for a room.
 * Used by the pre-join screen to load existing meeting data.
 *
 * Returns:
 * - meeting: Meeting object if a scheduled meeting exists for this room
 * - agenda: AgendaWithItems if an agenda exists (either linked via meetingId or roomId)
 *
 * Note: This endpoint does NOT require prior room access because users
 * need to see meeting details before deciding to join. The actual room
 * access is recorded when they proceed to join.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await params;

  // Validate room ID format
  const roomValidation = validateRoomId(roomId);
  if (!roomValidation.isValid) {
    return NextResponse.json(
      { error: roomValidation.error },
      { status: 400 }
    );
  }

  try {
    // Get meeting by roomId (may be null for instant meetings without persistence)
    const meeting = await getMeetingByRoomId(roomId);

    // Try to get agenda in order of precedence:
    // 1. If meeting exists, try to get agenda by meetingId (scheduled meeting flow)
    // 2. Fall back to getting agenda by roomId (instant meeting flow)
    let agenda = null;
    if (meeting?.id) {
      agenda = await getAgendaByMeetingId(meeting.id);
    }
    if (!agenda) {
      agenda = await getAgendaWithItems(roomId);
    }

    return NextResponse.json({
      meeting,
      agenda,
    });
  } catch (error) {
    console.error("Get meeting error:", error);
    return NextResponse.json(
      { error: "Failed to get meeting details" },
      { status: 500 }
    );
  }
}
