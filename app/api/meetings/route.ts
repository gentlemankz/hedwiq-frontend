import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createMeeting, listMeetingsForUser } from "@/lib/db/meeting";
import { createAgenda } from "@/lib/db/agenda";
import { isFolderOwner } from "@/lib/db/folder";
import { validateCreateMeetingRequest } from "@/lib/validation/meeting";
import { validateAgendaItems } from "@/lib/validation/agenda";
import { parseFolderIdParam } from "@/lib/validation/folder";
import { syncMeetingToCalendar } from "@/lib/calendar-sync";
import type { MeetingType, MeetingSettings } from "@/types/meeting";
import type { AgendaItemInput } from "@/types/agenda";

/**
 * GET /api/meetings
 *
 * List meetings visible to the authenticated user (hosted, invited, or team-invited).
 * Query params:
 * - status: "upcoming" | "past" | "all" (default: "all")
 * - folderId: string (optional, filter by folder)
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const folderIdParam = searchParams.get("folderId");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  // Validate status
  const validStatuses = ["upcoming", "past", "all"] as const;
  type ValidStatus = (typeof validStatuses)[number];

  let status: ValidStatus | null = null;
  if (statusParam) {
    if (!validStatuses.includes(statusParam as ValidStatus)) {
      return NextResponse.json(
        { error: "status must be 'upcoming', 'past', or 'all'" },
        { status: 400 }
      );
    }
    status = statusParam as ValidStatus;
  }

  // Parse folderId (can be a string or "null" for unassigned meetings)
  const folderId = parseFolderIdParam(folderIdParam);

  // Parse and validate limit
  let limit = 50;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json(
        { error: "limit must be a number between 1 and 100" },
        { status: 400 }
      );
    }
    limit = parsed;
  }

  // Parse and validate offset
  let offset = 0;
  if (offsetParam) {
    const parsed = parseInt(offsetParam, 10);
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: "offset must be a non-negative number" },
        { status: 400 }
      );
    }
    offset = parsed;
  }

  try {
    const meetings = await listMeetingsForUser(
      { userId: session.user.id, userEmail: session.user.email },
      {
        status: status || "all",
        folderId,
        limit,
        offset,
      }
    );

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error("List meetings error:", error);
    return NextResponse.json(
      { error: "Failed to list meetings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings
 *
 * Create a new meeting.
 * Body:
 * - title: string (required)
 * - description: string (optional)
 * - type: "instant" | "scheduled" (required)
 * - scheduledAt: ISO date string (required for scheduled meetings)
 * - durationMinutes: number (optional, default: 60)
 * - timezone: string (optional, default: "UTC")
 * - settings: MeetingSettings (optional)
 * - addToCalendar: boolean (optional, default: false)
 * - folderId: string (optional, for organization)
 * - roomId: string (optional, for instant meetings - use this room ID instead of generating a new one)
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    title?: string;
    description?: string;
    type?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    timezone?: string;
    settings?: MeetingSettings;
    addToCalendar?: boolean;
    agendaItems?: AgendaItemInput[];
    folderId?: string;
    roomId?: string; // Optional: use this room ID instead of generating a new one
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateCreateMeetingRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Validate folder ownership if folderId is provided
  if (body.folderId) {
    const ownsFolder = await isFolderOwner(body.folderId, session.user.id);
    if (!ownsFolder) {
      return NextResponse.json(
        { error: "Invalid folder ID" },
        { status: 400 }
      );
    }
  }

  try {
    const meeting = await createMeeting({
      hostId: session.user.id,
      title: body.title as string,
      description: body.description,
      type: body.type as MeetingType,
      scheduledAt: validation.parsedDate,
      durationMinutes: body.durationMinutes,
      timezone: body.timezone,
      settings: body.settings,
      folderId: body.folderId,
      roomId: body.roomId, // Optional: use provided room ID for instant meetings
    });

    // Create agenda if items were provided
    let agenda = null;
    if (body.agendaItems && body.agendaItems.length > 0) {
      // Validate agenda items before creation
      const agendaValidation = validateAgendaItems(body.agendaItems);
      if (!agendaValidation.isValid) {
        // Return error if agenda items are invalid
        // Note: Meeting was already created, but agenda creation failed
        // We could consider wrapping both in a transaction for atomicity
        return NextResponse.json(
          {
            meeting,
            agenda: null,
            agendaError: agendaValidation.error,
          },
          { status: 201 }
        );
      }

      try {
        agenda = await createAgenda(
          meeting.roomId,
          session.user.id,
          body.agendaItems,
          {
            meetingId: meeting.id,
            meetingName: meeting.title,
            scheduledAt: meeting.scheduledAt ?? undefined,
          }
        );
      } catch (agendaError) {
        console.error("Agenda creation failed:", agendaError);
        // Don't fail the meeting creation, just log the warning
      }
    }

    // Sync to Google Calendar if requested
    // NOTE: Calendar sync is only supported for scheduled meetings, not instant meetings
    // (instant meetings don't have a scheduled time to add to the calendar)
    let calendarSync: { success: boolean; eventLink?: string | null; error?: string } | null = null;
    if (body.addToCalendar && body.type === "scheduled") {
      calendarSync = await syncMeetingToCalendar(meeting, session.user.id);
      if (!calendarSync.success) {
        console.warn("Calendar sync failed:", calendarSync.error);
        // Don't fail the meeting creation, just log the warning
      }
    }

    return NextResponse.json(
      {
        meeting,
        agenda,
        calendarSync: calendarSync
          ? {
              synced: calendarSync.success,
              eventLink: calendarSync.eventLink,
              error: calendarSync.error,
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create meeting error:", error);
    return NextResponse.json(
      { error: "Failed to create meeting" },
      { status: 500 }
    );
  }
}
