import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import { publishAgenda } from "@/lib/db/agenda";

/**
 * POST /api/rooms/[roomId]/agenda/publish
 *
 * Publishes an agenda, transitioning it from draft to active.
 * This locks the agenda definition for meeting tracking.
 *
 * IMPORTANT: This must be called BEFORE requesting a LiveKit token
 * to ensure the agent can fetch the agenda when it joins.
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

  // Validate room access
  const accessError = await validateRoomAccess(session.user.id, roomId);
  if (accessError) {
    return NextResponse.json({ error: accessError }, { status: 403 });
  }

  try {
    const agenda = await publishAgenda(roomId);
    return NextResponse.json({ agenda });
  } catch (error) {
    console.error("Publish agenda error:", error);

    if (error instanceof Error) {
      // Handle specific errors
      if (error.message.includes("No agenda found")) {
        return NextResponse.json(
          { error: "No agenda found for this room" },
          { status: 404 }
        );
      }
      if (error.message.includes("already")) {
        return NextResponse.json(
          { error: error.message },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to publish agenda" },
      { status: 500 }
    );
  }
}
