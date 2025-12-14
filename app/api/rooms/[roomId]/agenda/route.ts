import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import { validateAgendaItems, validateMeetingInfo } from "@/lib/validation/agenda";
import {
  getAgendaWithItems,
  upsertAgenda,
} from "@/lib/db/agenda";
import { type AgendaItemInput } from "@/types/agenda";

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
  let body: { items: AgendaItemInput[]; meetingName?: string; scheduledAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate items array using shared validation
  const validation = validateAgendaItems(body.items);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Validate meeting info (name and scheduled time)
  const meetingInfoValidation = validateMeetingInfo({
    meetingName: body.meetingName,
    scheduledAt: body.scheduledAt,
  });
  if (!meetingInfoValidation.isValid) {
    return NextResponse.json({ error: meetingInfoValidation.error }, { status: 400 });
  }

  try {
    const agenda = await upsertAgenda(roomId, session.user.id, body.items, {
      meetingName: meetingInfoValidation.sanitizedName,
      scheduledAt: meetingInfoValidation.parsedDate,
    });
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

