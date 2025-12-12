import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import {
  getAgendaItemById,
  getAgendaByRoomId,
  updateAgendaItem,
  deleteAgendaItem,
} from "@/lib/db/agenda";
import { AGENDA_LIMITS } from "@/types/agenda";

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
  let body: {
    title?: string;
    description?: string;
    estimatedDuration?: number;
    presenter?: string;
    orderIndex?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate updates
  const validation = validateItemUpdate(body);
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

/**
 * Validates item update fields.
 */
function validateItemUpdate(body: {
  title?: string;
  description?: string;
  estimatedDuration?: number;
  presenter?: string;
  orderIndex?: number;
}): string | null {
  // Title validation (if provided)
  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return "title must be a string";
    }
    const title = body.title.trim();
    if (title.length < AGENDA_LIMITS.MIN_TITLE_LENGTH) {
      return "title is required";
    }
    if (title.length > AGENDA_LIMITS.MAX_TITLE_LENGTH) {
      return `title must be ${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters or less`;
    }
  }

  // Description validation (if provided)
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return "description must be a string";
    }
    if (body.description.length > AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH) {
      return `description must be ${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
    }
  }

  // Estimated duration validation (if provided)
  if (body.estimatedDuration !== undefined && body.estimatedDuration !== null) {
    if (typeof body.estimatedDuration !== "number") {
      return "estimatedDuration must be a number";
    }
    if (
      body.estimatedDuration < AGENDA_LIMITS.MIN_DURATION_MINUTES ||
      body.estimatedDuration > AGENDA_LIMITS.MAX_DURATION_MINUTES
    ) {
      return `estimatedDuration must be between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES} minutes`;
    }
  }

  // Presenter validation (if provided)
  if (body.presenter !== undefined && body.presenter !== null) {
    if (typeof body.presenter !== "string") {
      return "presenter must be a string";
    }
    if (body.presenter.length > AGENDA_LIMITS.MAX_PRESENTER_LENGTH) {
      return `presenter must be ${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters or less`;
    }
  }

  // Order index validation (if provided)
  if (body.orderIndex !== undefined) {
    if (typeof body.orderIndex !== "number" || body.orderIndex < 0) {
      return "orderIndex must be a non-negative number";
    }
  }

  return null;
}
