import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { validateRoomAccess } from "@/lib/db/room-access";
import { validateRoomId } from "@/lib/validation";
import {
  getAgendaItemById,
  getAgendaByRoomId,
  updateAgendaItemStatus,
} from "@/lib/db/agenda";
import type { AgendaItemStatus } from "@/types/agenda";

type RouteParams = { params: Promise<{ roomId: string; itemId: string }> };

const ALLOWED_STATUSES: AgendaItemStatus[] = ["in_progress", "completed", "skipped"];

/**
 * POST /api/rooms/[roomId]/agenda/items/[itemId]/status
 *
 * Manual status override for an agenda item.
 * Used as a fallback when the agent is unavailable.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  // Only allow status changes on active agendas
  if (agenda.status !== "active") {
    return NextResponse.json(
      { error: "Status changes only allowed on active agendas" },
      { status: 409 }
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
  let body: { status: AgendaItemStatus };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate status
  if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const item = await updateAgendaItemStatus(itemId, body.status);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Update agenda item status error:", error);
    return NextResponse.json(
      { error: "Failed to update agenda item status" },
      { status: 500 }
    );
  }
}
