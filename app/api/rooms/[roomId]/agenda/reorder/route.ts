import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import { getAgendaByRoomId, reorderAgendaItems } from "@/lib/db/agenda";

/**
 * POST /api/rooms/[roomId]/agenda/reorder
 *
 * Reorders agenda items.
 * Only allowed when agenda is in draft status.
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

  // Parse request body
  let body: { itemIds: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate itemIds
  if (!Array.isArray(body.itemIds)) {
    return NextResponse.json(
      { error: "itemIds must be an array" },
      { status: 400 }
    );
  }

  if (body.itemIds.length === 0) {
    return NextResponse.json(
      { error: "itemIds cannot be empty" },
      { status: 400 }
    );
  }

  for (const id of body.itemIds) {
    if (typeof id !== "string") {
      return NextResponse.json(
        { error: "itemIds must be an array of strings" },
        { status: 400 }
      );
    }
  }

  try {
    // Get agenda for this room
    const agenda = await getAgendaByRoomId(roomId);

    if (!agenda) {
      return NextResponse.json(
        { error: "No agenda found for this room" },
        { status: 404 }
      );
    }

    const items = await reorderAgendaItems(agenda.id, body.itemIds);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Reorder agenda items error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not draft") || error.message.includes("published")) {
        return NextResponse.json(
          { error: "Cannot reorder items in a published agenda" },
          { status: 409 }
        );
      }
      if (error.message.includes("mismatch") || error.message.includes("does not belong")) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to reorder agenda items" },
      { status: 500 }
    );
  }
}
