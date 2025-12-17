import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  isMeetingHost,
} from "@/lib/db/meeting";
import {
  getAgendaByMeetingId,
  createAgenda,
  upsertAgenda,
} from "@/lib/db/agenda";
import { isFolderOwner } from "@/lib/db/folder";
import { validateUpdateMeetingRequest } from "@/lib/validation/meeting";
import { validateAgendaItems } from "@/lib/validation/agenda";
import {
  updateMeetingCalendarEvent,
  deleteMeetingCalendarEvent,
  removeCalendarEventForDeletedMeeting,
} from "@/lib/calendar-sync";
import type { MeetingStatus, MeetingSettings } from "@/types/meeting";
import type { AgendaItemInput } from "@/types/agenda";

/**
 * GET /api/meetings/[meetingId]
 *
 * Get a single meeting by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  try {
    const meeting = await getMeetingById(meetingId);

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Only host can view meeting details (for now)
    if (meeting.hostId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch agenda if exists (for editing purposes)
    const agenda = await getAgendaByMeetingId(meetingId);

    return NextResponse.json({ meeting, agenda });
  } catch (error) {
    console.error("Get meeting error:", error);
    return NextResponse.json(
      { error: "Failed to get meeting" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/meetings/[meetingId]
 *
 * Update a meeting.
 * Body (all optional):
 * - title: string
 * - description: string
 * - scheduledAt: ISO date string
 * - durationMinutes: number
 * - timezone: string
 * - status: MeetingStatus
 * - settings: MeetingSettings
 * - folderId: string | null (for organization)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  // Check if user is host
  const isHost = await isMeetingHost(meetingId, session.user.id);
  if (!isHost) {
    return NextResponse.json(
      { error: "Meeting not found or not authorized" },
      { status: 404 }
    );
  }

  // Parse request body
  let body: {
    title?: string;
    description?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    timezone?: string;
    status?: string;
    settings?: MeetingSettings;
    agendaItems?: AgendaItemInput[];
    folderId?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateUpdateMeetingRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Validate folder ownership if folderId is provided (and not null/clearing)
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
    // Build update object with automatic timestamp handling for status changes
    const updates: Parameters<typeof updateMeeting>[2] = {
      title: body.title,
      description: body.description,
      scheduledAt: validation.parsedDate,
      durationMinutes: body.durationMinutes,
      timezone: body.timezone,
      status: body.status as MeetingStatus | undefined,
      settings: body.settings,
      folderId: body.folderId,
    };

    // Automatically set timestamps when status changes
    if (body.status === "live") {
      updates.startedAt = new Date();
    } else if (body.status === "ended") {
      updates.endedAt = new Date();
    }

    const meeting = await updateMeeting(meetingId, session.user.id, updates);

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Handle agenda items if provided
    let agenda = null;
    let agendaError: string | undefined;
    if (body.agendaItems !== undefined) {
      // Validate agenda items
      if (body.agendaItems.length > 0) {
        const agendaValidation = validateAgendaItems(body.agendaItems);
        if (!agendaValidation.isValid) {
          agendaError = agendaValidation.error;
        }
      }

      if (!agendaError) {
        try {
          // Check if agenda exists for this meeting
          const existingAgenda = await getAgendaByMeetingId(meetingId);

          if (existingAgenda) {
            // Update existing agenda using upsertAgenda (which uses roomId)
            agenda = await upsertAgenda(
              meeting.roomId,
              session.user.id,
              body.agendaItems,
              {
                meetingId: meetingId,
                meetingName: meeting.title,
                scheduledAt: meeting.scheduledAt ?? undefined,
              }
            );
          } else if (body.agendaItems.length > 0) {
            // Create new agenda for this meeting
            agenda = await createAgenda(
              meeting.roomId,
              session.user.id,
              body.agendaItems,
              {
                meetingId: meetingId,
                meetingName: meeting.title,
                scheduledAt: meeting.scheduledAt ?? undefined,
              }
            );
          }
        } catch (err) {
          console.error("Agenda update failed:", err);
          agendaError = err instanceof Error ? err.message : "Failed to update agenda";
        }
      }
    }

    // Sync changes to Google Calendar
    let calendarSync: { success: boolean; eventLink?: string | null; error?: string } | null = null;

    // If meeting was cancelled, delete the calendar event
    if (body.status === "cancelled") {
      calendarSync = await deleteMeetingCalendarEvent(meetingId, session.user.id);
    } else {
      // Otherwise, update the calendar event (if one exists)
      calendarSync = await updateMeetingCalendarEvent(meeting, session.user.id);
    }

    if (calendarSync && !calendarSync.success) {
      console.warn("Calendar sync failed:", calendarSync.error);
    }

    return NextResponse.json({
      meeting,
      agenda,
      agendaError,
      calendarSync: calendarSync
        ? {
            synced: calendarSync.success,
            eventLink: calendarSync.eventLink,
            error: calendarSync.error,
          }
        : null,
    });
  } catch (error) {
    console.error("Update meeting error:", error);
    return NextResponse.json(
      { error: "Failed to update meeting" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[meetingId]
 *
 * Delete a meeting.
 * Also removes any associated Google Calendar events.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  try {
    // First, try to delete the calendar event (before meeting is deleted)
    // This needs the meeting to exist to get its info
    await removeCalendarEventForDeletedMeeting(meetingId, session.user.id);

    // Now delete the meeting
    const deleted = await deleteMeeting(meetingId, session.user.id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Meeting not found or not authorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete meeting error:", error);
    return NextResponse.json(
      { error: "Failed to delete meeting" },
      { status: 500 }
    );
  }
}
