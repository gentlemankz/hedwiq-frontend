import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import {
  getAgendaWithItems,
  upsertAgenda,
} from "@/lib/db/agenda";
import { AGENDA_LIMITS, type AgendaItemInput } from "@/types/agenda";

/**
 * GET /api/rooms/[roomId]/agenda
 *
 * Get the agenda for a room (includes all items).
 * Returns null if no agenda exists.
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

  // Validate room access
  const accessError = await validateRoomAccess(session.user.id, roomId);
  if (accessError) {
    return NextResponse.json({ error: accessError }, { status: 403 });
  }

  try {
    const agenda = await getAgendaWithItems(roomId);
    return NextResponse.json({ agenda });
  } catch (error) {
    console.error("Get agenda error:", error);
    return NextResponse.json(
      { error: "Failed to get agenda" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/rooms/[roomId]/agenda
 *
 * Create or update an agenda (upsert draft).
 * - If no agenda exists: creates as 'draft'
 * - If agenda exists and status='draft': updates items, increments version
 * - If agenda exists and status='active': returns 409 Conflict
 */
export async function PUT(
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

  // Parse and validate request body
  let body: { items: AgendaItemInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate items array
  if (!Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "items must be an array" },
      { status: 400 }
    );
  }

  // Validate item count
  if (body.items.length > AGENDA_LIMITS.MAX_ITEMS) {
    return NextResponse.json(
      { error: `Maximum ${AGENDA_LIMITS.MAX_ITEMS} items allowed` },
      { status: 400 }
    );
  }

  // Validate each item
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    const validation = validateAgendaItem(item, i);
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }
  }

  try {
    const agenda = await upsertAgenda(roomId, session.user.id, body.items);
    return NextResponse.json({ agenda });
  } catch (error) {
    console.error("Upsert agenda error:", error);

    // Check for conflict (agenda already active)
    if (error instanceof Error && error.message.includes("locked")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to save agenda" },
      { status: 500 }
    );
  }
}

/**
 * Validates an agenda item input.
 * Returns error message or null if valid.
 */
function validateAgendaItem(
  item: AgendaItemInput,
  index: number
): string | null {
  // Title validation
  if (!item.title || typeof item.title !== "string") {
    return `Item ${index + 1}: title is required`;
  }

  const title = item.title.trim();
  if (title.length < AGENDA_LIMITS.MIN_TITLE_LENGTH) {
    return `Item ${index + 1}: title is required`;
  }
  if (title.length > AGENDA_LIMITS.MAX_TITLE_LENGTH) {
    return `Item ${index + 1}: title must be ${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters or less`;
  }

  // Description validation (optional)
  if (item.description !== undefined && item.description !== null) {
    if (typeof item.description !== "string") {
      return `Item ${index + 1}: description must be a string`;
    }
    if (item.description.length > AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH) {
      return `Item ${index + 1}: description must be ${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
    }
  }

  // Estimated duration validation (optional)
  if (item.estimatedDuration !== undefined && item.estimatedDuration !== null) {
    if (typeof item.estimatedDuration !== "number") {
      return `Item ${index + 1}: estimatedDuration must be a number`;
    }
    if (
      item.estimatedDuration < AGENDA_LIMITS.MIN_DURATION_MINUTES ||
      item.estimatedDuration > AGENDA_LIMITS.MAX_DURATION_MINUTES
    ) {
      return `Item ${index + 1}: estimatedDuration must be between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES} minutes`;
    }
  }

  // Presenter validation (optional)
  if (item.presenter !== undefined && item.presenter !== null) {
    if (typeof item.presenter !== "string") {
      return `Item ${index + 1}: presenter must be a string`;
    }
    if (item.presenter.length > AGENDA_LIMITS.MAX_PRESENTER_LENGTH) {
      return `Item ${index + 1}: presenter must be ${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters or less`;
    }
  }

  return null;
}
