/**
 * Calendar Event Database Operations
 *
 * CRUD operations for the calendar_event table.
 * Handles mapping between Hedwiq meetings and external calendar events.
 */

import { db } from "@/lib/db";
import { calendarEvent, calendarIntegration } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generatePrefixedId } from "@/lib/utils";
import type {
  CalendarEvent,
  CalendarEventPublic,
  CalendarEventSyncStatus,
} from "@/types/calendar";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique calendar event ID.
 */
export function generateCalendarEventId(): string {
  return generatePrefixedId("cevt");
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to a CalendarEvent object.
 */
function rowToCalendarEvent(
  row: typeof calendarEvent.$inferSelect
): CalendarEvent {
  return {
    id: row.id,
    meetingId: row.meetingId,
    integrationId: row.integrationId,
    providerEventId: row.providerEventId,
    providerEventLink: row.providerEventLink,
    syncStatus: row.syncStatus as CalendarEventSyncStatus,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    syncError: row.syncError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Converts a CalendarEvent to a public-safe version.
 */
export function toPublicCalendarEvent(
  event: CalendarEvent
): CalendarEventPublic {
  return {
    providerEventLink: event.providerEventLink,
    syncStatus: event.syncStatus,
    syncError: event.syncError,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Creates a calendar event record.
 */
export async function createCalendarEvent(params: {
  meetingId: string;
  integrationId: string;
  providerEventId: string;
  providerEventLink?: string;
}): Promise<CalendarEvent> {
  const eventId = generateCalendarEventId();

  const [row] = await db
    .insert(calendarEvent)
    .values({
      id: eventId,
      meetingId: params.meetingId,
      integrationId: params.integrationId,
      providerEventId: params.providerEventId,
      providerEventLink: params.providerEventLink ?? null,
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    })
    .returning();

  return rowToCalendarEvent(row);
}

/**
 * Gets a calendar event by meeting ID.
 * Since there's one event per meeting per integration, this returns the first one.
 */
export async function getCalendarEventByMeetingId(
  meetingId: string
): Promise<CalendarEvent | null> {
  const [row] = await db
    .select()
    .from(calendarEvent)
    .where(eq(calendarEvent.meetingId, meetingId))
    .limit(1);

  return row ? rowToCalendarEvent(row) : null;
}

/**
 * Gets a calendar event by meeting ID and integration ID.
 */
export async function getCalendarEventByMeetingAndIntegration(
  meetingId: string,
  integrationId: string
): Promise<CalendarEvent | null> {
  const [row] = await db
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.meetingId, meetingId),
        eq(calendarEvent.integrationId, integrationId)
      )
    )
    .limit(1);

  return row ? rowToCalendarEvent(row) : null;
}

/**
 * Gets a calendar event by ID.
 */
export async function getCalendarEventById(
  eventId: string
): Promise<CalendarEvent | null> {
  const [row] = await db
    .select()
    .from(calendarEvent)
    .where(eq(calendarEvent.id, eventId))
    .limit(1);

  return row ? rowToCalendarEvent(row) : null;
}

/**
 * Updates a calendar event sync status.
 */
export async function updateCalendarEventSyncStatus(
  eventId: string,
  params: {
    syncStatus: CalendarEventSyncStatus;
    syncError?: string | null;
    lastSyncedAt?: Date;
  }
): Promise<CalendarEvent | null> {
  const [row] = await db
    .update(calendarEvent)
    .set({
      syncStatus: params.syncStatus,
      syncError: params.syncError ?? null,
      lastSyncedAt: params.lastSyncedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calendarEvent.id, eventId))
    .returning();

  return row ? rowToCalendarEvent(row) : null;
}

/**
 * Updates a calendar event's provider event link.
 */
export async function updateCalendarEventLink(
  eventId: string,
  providerEventLink: string
): Promise<CalendarEvent | null> {
  const [row] = await db
    .update(calendarEvent)
    .set({
      providerEventLink,
      updatedAt: new Date(),
    })
    .where(eq(calendarEvent.id, eventId))
    .returning();

  return row ? rowToCalendarEvent(row) : null;
}

/**
 * Marks a calendar event as synced successfully.
 */
export async function markCalendarEventSynced(
  eventId: string
): Promise<CalendarEvent | null> {
  return updateCalendarEventSyncStatus(eventId, {
    syncStatus: "synced",
    syncError: null,
    lastSyncedAt: new Date(),
  });
}

/**
 * Marks a calendar event as failed.
 */
export async function markCalendarEventFailed(
  eventId: string,
  errorMessage: string
): Promise<CalendarEvent | null> {
  return updateCalendarEventSyncStatus(eventId, {
    syncStatus: "failed",
    syncError: errorMessage,
  });
}

/**
 * Marks a calendar event as deleted.
 */
export async function markCalendarEventDeleted(
  eventId: string
): Promise<CalendarEvent | null> {
  return updateCalendarEventSyncStatus(eventId, {
    syncStatus: "deleted",
    syncError: null,
  });
}

/**
 * Deletes a calendar event record.
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const result = await db
    .delete(calendarEvent)
    .where(eq(calendarEvent.id, eventId))
    .returning({ id: calendarEvent.id });

  return result.length > 0;
}

/**
 * Deletes all calendar events for a meeting.
 */
export async function deleteCalendarEventsForMeeting(
  meetingId: string
): Promise<number> {
  const result = await db
    .delete(calendarEvent)
    .where(eq(calendarEvent.meetingId, meetingId))
    .returning({ id: calendarEvent.id });

  return result.length;
}

/**
 * Gets calendar event info for a meeting, joined with integration details.
 * Returns public-safe info for the frontend.
 */
export async function getMeetingCalendarEventInfo(
  meetingId: string
): Promise<{
  event: CalendarEventPublic;
  calendarEmail: string | null;
} | null> {
  const rows = await db
    .select({
      event: calendarEvent,
      calendarEmail: calendarIntegration.calendarEmail,
    })
    .from(calendarEvent)
    .innerJoin(
      calendarIntegration,
      eq(calendarEvent.integrationId, calendarIntegration.id)
    )
    .where(eq(calendarEvent.meetingId, meetingId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    event: toPublicCalendarEvent(rowToCalendarEvent(row.event)),
    calendarEmail: row.calendarEmail,
  };
}
