/**
 * Calendar Sync Service
 *
 * Handles synchronization between Hedwiq meetings and Google Calendar.
 * Provides high-level operations for creating, updating, and deleting
 * calendar events when meetings are modified.
 */

import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  canSyncToCalendar,
} from "@/lib/google-calendar";
import type { CalendarAgendaItem } from "@/lib/google-calendar";
import {
  createCalendarEvent,
  getCalendarEventByMeetingId,
  markCalendarEventSynced,
  markCalendarEventFailed,
  markCalendarEventDeleted,
  deleteCalendarEvent,
} from "@/lib/db/calendar-event";
import { getAgendaByMeetingId } from "@/lib/db/agenda";
import type { Meeting } from "@/types/meeting";

// ============================================================================
// Types
// ============================================================================

export interface CalendarSyncResult {
  success: boolean;
  eventLink?: string | null;
  error?: string;
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Creates a Google Calendar event for a meeting.
 * Called when a new meeting is scheduled with "Add to Calendar" enabled.
 *
 * @param meeting - The meeting to create an event for
 * @param userId - The user ID (meeting host)
 * @returns Sync result with event link if successful
 */
export async function syncMeetingToCalendar(
  meeting: Meeting,
  userId: string
): Promise<CalendarSyncResult> {
  // Check if user can sync to calendar
  const canSync = await canSyncToCalendar(userId);
  if (!canSync) {
    return {
      success: false,
      error: "Calendar not connected. Please connect your Google Calendar.",
    };
  }

  // Check if meeting already has a calendar event
  const existingEvent = await getCalendarEventByMeetingId(meeting.id);
  if (existingEvent && existingEvent.syncStatus !== "deleted") {
    // Already synced - update instead
    return updateMeetingCalendarEvent(meeting, userId);
  }

  // Calculate end time
  const startTime = meeting.scheduledAt
    ? new Date(meeting.scheduledAt)
    : new Date();
  const endTime = new Date(
    startTime.getTime() + (meeting.durationMinutes || 60) * 60 * 1000
  );

  // Build meeting link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const meetingLink = `${appUrl}/meetings/${meeting.roomId}`;

  // Fetch agenda items if meeting has an agenda
  let agendaItems: CalendarAgendaItem[] | undefined;
  try {
    const agenda = await getAgendaByMeetingId(meeting.id);
    if (agenda && agenda.items && agenda.items.length > 0) {
      agendaItems = agenda.items.map((item) => ({
        title: item.title,
        estimatedDuration: item.estimatedDuration,
      }));
    }
  } catch (agendaError) {
    // Log but don't fail calendar sync if agenda fetch fails
    console.warn("Failed to fetch agenda for calendar sync:", agendaError);
  }

  try {
    // Create Google Calendar event
    const result = await createGoogleCalendarEvent(userId, {
      summary: meeting.title,
      description: meeting.description || undefined,
      startTime,
      endTime,
      timezone: meeting.timezone || "UTC",
      meetingLink,
      roomId: meeting.roomId,
      agendaItems,
    });

    if (!result) {
      return {
        success: false,
        error: "Failed to create calendar event. Please try again.",
      };
    }

    // Store the calendar event mapping
    await createCalendarEvent({
      meetingId: meeting.id,
      integrationId: result.integrationId,
      providerEventId: result.event.id,
      providerEventLink: result.event.htmlLink,
    });

    return {
      success: true,
      eventLink: result.event.htmlLink,
    };
  } catch (error) {
    console.error("Calendar sync error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to sync with calendar.",
    };
  }
}

/**
 * Updates a Google Calendar event when a meeting is modified.
 *
 * @param meeting - The updated meeting
 * @param userId - The user ID (meeting host)
 * @returns Sync result
 */
export async function updateMeetingCalendarEvent(
  meeting: Meeting,
  userId: string
): Promise<CalendarSyncResult> {
  // Get the existing calendar event
  const calendarEvent = await getCalendarEventByMeetingId(meeting.id);
  if (!calendarEvent) {
    // No calendar event exists - create one if meeting is scheduled
    if (meeting.type === "scheduled" && meeting.scheduledAt) {
      return syncMeetingToCalendar(meeting, userId);
    }
    return { success: true }; // No event to update
  }

  // Check if event was already deleted
  if (calendarEvent.syncStatus === "deleted") {
    return { success: true }; // Nothing to update
  }

  // Calculate new times
  const startTime = meeting.scheduledAt
    ? new Date(meeting.scheduledAt)
    : undefined;
  const endTime = startTime
    ? new Date(
        startTime.getTime() + (meeting.durationMinutes || 60) * 60 * 1000
      )
    : undefined;

  try {
    // Update Google Calendar event
    const result = await updateGoogleCalendarEvent(
      userId,
      calendarEvent.providerEventId,
      {
        summary: meeting.title,
        description: meeting.description || undefined,
        startTime,
        endTime,
        timezone: meeting.timezone || "UTC",
      }
    );

    if (!result) {
      await markCalendarEventFailed(
        calendarEvent.id,
        "Failed to update calendar event"
      );
      return {
        success: false,
        error: "Failed to update calendar event.",
      };
    }

    await markCalendarEventSynced(calendarEvent.id);

    return {
      success: true,
      eventLink: calendarEvent.providerEventLink,
    };
  } catch (error) {
    console.error("Calendar update error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update calendar.";

    await markCalendarEventFailed(calendarEvent.id, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Deletes a Google Calendar event when a meeting is cancelled or deleted.
 *
 * @param meetingId - The meeting ID
 * @param userId - The user ID (meeting host)
 * @returns Sync result
 */
export async function deleteMeetingCalendarEvent(
  meetingId: string,
  userId: string
): Promise<CalendarSyncResult> {
  // Get the existing calendar event
  const calendarEvent = await getCalendarEventByMeetingId(meetingId);
  if (!calendarEvent) {
    return { success: true }; // No event to delete
  }

  // Already deleted
  if (calendarEvent.syncStatus === "deleted") {
    return { success: true };
  }

  try {
    // Delete from Google Calendar
    const deleted = await deleteGoogleCalendarEvent(
      userId,
      calendarEvent.providerEventId
    );

    if (!deleted) {
      await markCalendarEventFailed(
        calendarEvent.id,
        "Failed to delete calendar event"
      );
      return {
        success: false,
        error: "Failed to delete calendar event.",
      };
    }

    // Mark as deleted (or remove entirely)
    await markCalendarEventDeleted(calendarEvent.id);

    return { success: true };
  } catch (error) {
    console.error("Calendar delete error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete from calendar.";

    await markCalendarEventFailed(calendarEvent.id, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Removes a calendar event completely (used when meeting is hard-deleted).
 *
 * @param meetingId - The meeting ID
 * @param userId - The user ID (meeting host)
 * @returns true if successful
 */
export async function removeCalendarEventForDeletedMeeting(
  meetingId: string,
  userId: string
): Promise<boolean> {
  const calendarEvent = await getCalendarEventByMeetingId(meetingId);
  if (!calendarEvent) {
    return true; // No event to remove
  }

  // Try to delete from Google Calendar first
  try {
    await deleteGoogleCalendarEvent(userId, calendarEvent.providerEventId);
  } catch (error) {
    // Log but continue - the meeting is being deleted anyway
    console.error("Failed to delete Google Calendar event:", error);
  }

  // Delete the database record
  await deleteCalendarEvent(calendarEvent.id);

  return true;
}

/**
 * Checks if a meeting has a synced calendar event.
 *
 * @param meetingId - The meeting ID
 * @returns Calendar event info or null
 */
export async function getMeetingCalendarStatus(meetingId: string): Promise<{
  synced: boolean;
  eventLink: string | null;
  syncStatus: string | null;
  syncError: string | null;
} | null> {
  const calendarEvent = await getCalendarEventByMeetingId(meetingId);

  if (!calendarEvent) {
    return null;
  }

  return {
    synced: calendarEvent.syncStatus === "synced",
    eventLink: calendarEvent.providerEventLink,
    syncStatus: calendarEvent.syncStatus,
    syncError: calendarEvent.syncError,
  };
}
