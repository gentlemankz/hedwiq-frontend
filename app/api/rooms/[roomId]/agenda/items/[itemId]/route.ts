import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import { validateAgendaItemUpdate } from "@/lib/validation/agenda";
import {
  getAgendaItemById,
  getAgendaByRoomId,
  updateAgendaItem,
  deleteAgendaItem,
} from "@/lib/db/agenda";

type RouteParams = { params: Promise<{ roomId: string; itemId: string }> };

/**
 * PATCH /api/rooms/[roomId]/agenda/items/[itemId]
 *
 * Updates a single agenda item.
 * Only allowed when agenda is in draft status.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId, itemId } = await params;

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

  // Verify item belongs to this room's agenda
  const agenda = await getAgendaByRoomId(roomId);
  if (!agenda) {
    return NextResponse.json(
      { error: "No agenda found for this room" },
      { status: 404 }
    );
  }

  const existingItem = await getAgendaItemById(itemId);
  if (!existingItem || existingItem.agendaId !== agenda.id) {
    return NextResponse.json(
      { error: "Agenda item not found" },
      { status: 404 }
    );
  }

  // Parse request body
  // NOTE: orderIndex is intentionally NOT accepted here.
  // Use the /reorder endpoint to change item ordering.
  let body: {
    title?: string;
    description?: string;
    estimatedDuration?: number;
    presenter?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate updates using shared validation
  const validation = validateAgendaItemUpdate(body);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  try {
    const item = await updateAgendaItem(itemId, body);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Update agenda item error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not draft") || error.message.includes("published")) {
        return NextResponse.json(
          { error: "Cannot modify items in a published agenda" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update agenda item" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rooms/[roomId]/agenda/items/[itemId]
 *
 * Deletes a single agenda item.
 * Only allowed when agenda is in draft status.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId, itemId } = await params;

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

  // Verify item belongs to this room's agenda
  const agenda = await getAgendaByRoomId(roomId);
  if (!agenda) {
    return NextResponse.json(
      { error: "No agenda found for this room" },
      { status: 404 }
    );
  }

  const existingItem = await getAgendaItemById(itemId);
  if (!existingItem || existingItem.agendaId !== agenda.id) {
    return NextResponse.json(
      { error: "Agenda item not found" },
      { status: 404 }
    );
  }

  try {
    await deleteAgendaItem(itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete agenda item error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not draft") || error.message.includes("published")) {
        return NextResponse.json(
          { error: "Cannot delete items from a published agenda" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete agenda item" },
      { status: 500 }
    );
  }
}

