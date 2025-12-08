import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { recordRoomParticipation } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";

/**
 * POST /api/rooms/[roomId]/access
 *
 * Records room participation when a user accesses a room page.
 * This is called when navigating to the meeting room, enabling
 * pre-join document uploads while preventing privilege escalation
 * from arbitrary room IDs in upload requests.
 *
 * The user must have the room URL to access this endpoint, which
 * serves as implicit authorization (they were given/know the link).
 */
export async function POST(
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
    // Record that this user has accessed this room
    // Having the room URL serves as implicit authorization
    await recordRoomParticipation(session.user.id, roomId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Room access recording error:", error);
    return NextResponse.json(
      { error: "Failed to record room access" },
      { status: 500 }
    );
  }
}
