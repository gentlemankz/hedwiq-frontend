import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { calendarEvent, meeting } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { toPublicCalendarEvent } from "@/lib/db/calendar-event";
import type { CalendarEventSyncStatus } from "@/types/calendar";

/**
 * GET /api/calendar/events
 *
 * Get calendar events for the authenticated user's meetings.
 * Query params:
 * - meetingIds: comma-separated list of meeting IDs (optional)
 *
 * Returns a map of meeting ID to calendar event info.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const meetingIdsParam = searchParams.get("meetingIds");

  try {
    // Build query based on whether specific meeting IDs were requested
    // SECURITY: Always filter by user ID in the SQL query to prevent information disclosure
    let rows;

    if (meetingIdsParam) {
      const meetingIds = meetingIdsParam.split(",").filter(Boolean);
      if (meetingIds.length === 0) {
        return NextResponse.json({ events: {} });
      }

      // Get calendar events for specified meetings that the user owns
      // IMPORTANT: Filter by hostId in SQL to prevent unauthorized access
      rows = await db
        .select({
          calendarEvent: calendarEvent,
        })
        .from(calendarEvent)
        .innerJoin(meeting, eq(calendarEvent.meetingId, meeting.id))
        .where(
          and(
            inArray(calendarEvent.meetingId, meetingIds),
            eq(meeting.hostId, session.user.id)
          )
        );
    } else {
      // Get all calendar events for user's meetings
      rows = await db
        .select({
          calendarEvent: calendarEvent,
        })
        .from(calendarEvent)
        .innerJoin(meeting, eq(calendarEvent.meetingId, meeting.id))
        .where(eq(meeting.hostId, session.user.id));
    }

    // Build map of meeting ID to calendar event
    const eventsMap: Record<
      string,
      {
        providerEventLink: string | null;
        syncStatus: CalendarEventSyncStatus;
        syncError: string | null;
      }
    > = {};

    for (const row of rows) {
      eventsMap[row.calendarEvent.meetingId] = toPublicCalendarEvent({
        id: row.calendarEvent.id,
        meetingId: row.calendarEvent.meetingId,
        integrationId: row.calendarEvent.integrationId,
        providerEventId: row.calendarEvent.providerEventId,
        providerEventLink: row.calendarEvent.providerEventLink,
        syncStatus: row.calendarEvent.syncStatus as CalendarEventSyncStatus,
        lastSyncedAt: row.calendarEvent.lastSyncedAt?.toISOString() ?? null,
        syncError: row.calendarEvent.syncError,
        createdAt: row.calendarEvent.createdAt.toISOString(),
        updatedAt: row.calendarEvent.updatedAt.toISOString(),
      });
    }

    return NextResponse.json({ events: eventsMap });
  } catch (error) {
    console.error("Get calendar events error:", error);
    return NextResponse.json(
      { error: "Failed to get calendar events" },
      { status: 500 }
    );
  }
}
