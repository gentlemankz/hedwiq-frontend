/**
 * Meeting Database Operations
 *
 * CRUD operations for the meeting table.
 */

import { db } from "@/lib/db";
import { meeting, user } from "@/lib/db/schema";
import { eq, and, gte, desc, or, lte } from "drizzle-orm";
import type {
  Meeting,
  MeetingType,
  MeetingStatus,
  MeetingSettings,
  MeetingWithHost,
} from "@/types/meeting";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a cryptographically secure random string.
 * Uses crypto.getRandomValues for security.
 */
function secureRandomString(length: number, charset: string): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (num) => charset[num % charset.length]).join("");
}

/**
 * Generates a unique meeting ID using crypto-secure randomness.
 */
export function generateMeetingId(): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `mtg-${timestamp}-${random}`;
}

/**
 * Generates a random room ID in the format "abc-defg-hij".
 * Uses cryptographically secure random values.
 */
export function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const segments = [3, 4, 3];
  return segments
    .map((len) => secureRandomString(len, chars))
    .join("-");
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to a Meeting object.
 */
function rowToMeeting(row: typeof meeting.$inferSelect): Meeting {
  return {
    id: row.id,
    roomId: row.roomId,
    hostId: row.hostId,
    title: row.title,
    description: row.description,
    type: row.type as MeetingType,
    status: row.status as MeetingStatus,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes ?? 60,
    timezone: row.timezone,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    settings: row.settings as MeetingSettings | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Creates a new meeting.
 */
export async function createMeeting(params: {
  hostId: string;
  title: string;
  description?: string;
  type: MeetingType;
  scheduledAt?: Date;
  durationMinutes?: number;
  timezone?: string;
  settings?: MeetingSettings;
}): Promise<Meeting> {
  const meetingId = generateMeetingId();
  const roomId = generateRoomId();

  const [row] = await db
    .insert(meeting)
    .values({
      id: meetingId,
      roomId,
      hostId: params.hostId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      type: params.type,
      status: params.type === "instant" ? "live" : "scheduled",
      scheduledAt: params.scheduledAt ?? null,
      durationMinutes: params.durationMinutes ?? 60,
      timezone: params.timezone ?? "UTC",
      startedAt: params.type === "instant" ? new Date() : null,
      settings: params.settings ?? {},
    })
    .returning();

  return rowToMeeting(row);
}

/**
 * Gets a meeting by ID.
 */
export async function getMeetingById(meetingId: string): Promise<Meeting | null> {
  const [row] = await db
    .select()
    .from(meeting)
    .where(eq(meeting.id, meetingId))
    .limit(1);

  return row ? rowToMeeting(row) : null;
}

/**
 * Gets a meeting by room ID.
 */
export async function getMeetingByRoomId(roomId: string): Promise<Meeting | null> {
  const [row] = await db
    .select()
    .from(meeting)
    .where(eq(meeting.roomId, roomId))
    .limit(1);

  return row ? rowToMeeting(row) : null;
}

/**
 * Gets a meeting with host information.
 */
export async function getMeetingWithHost(meetingId: string): Promise<MeetingWithHost | null> {
  const rows = await db
    .select({
      meeting: meeting,
      host: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    })
    .from(meeting)
    .innerJoin(user, eq(meeting.hostId, user.id))
    .where(eq(meeting.id, meetingId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    ...rowToMeeting(row.meeting),
    host: row.host,
  };
}

/**
 * Lists meetings for a user.
 */
export async function listMeetingsByHost(
  hostId: string,
  options: {
    status?: "upcoming" | "past" | "all";
    limit?: number;
    offset?: number;
  } = {}
): Promise<Meeting[]> {
  const { status = "all", limit = 50, offset = 0 } = options;
  const now = new Date();

  // Build the where clause based on status filter
  const buildWhereClause = () => {
    const hostFilter = eq(meeting.hostId, hostId);

    switch (status) {
      case "upcoming":
        // Upcoming: scheduled for the future OR currently live
        return and(
          hostFilter,
          or(
            and(gte(meeting.scheduledAt, now), eq(meeting.status, "scheduled")),
            eq(meeting.status, "live")
          )
        );

      case "past":
        // Past: ended or cancelled, or scheduled in the past
        return and(
          hostFilter,
          or(
            eq(meeting.status, "ended"),
            eq(meeting.status, "cancelled"),
            and(lte(meeting.scheduledAt, now), eq(meeting.status, "scheduled"))
          )
        );

      default:
        // All meetings for this host
        return hostFilter;
    }
  };

  // Build order by clause - upcoming sorts ascending, others descending
  const orderByClause =
    status === "upcoming"
      ? [meeting.scheduledAt, desc(meeting.createdAt)]
      : [desc(meeting.scheduledAt), desc(meeting.createdAt)];

  const rows = await db
    .select()
    .from(meeting)
    .where(buildWhereClause())
    .orderBy(...orderByClause)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToMeeting);
}

/**
 * Updates a meeting.
 */
export async function updateMeeting(
  meetingId: string,
  hostId: string,
  updates: {
    title?: string;
    description?: string;
    scheduledAt?: Date;
    durationMinutes?: number;
    timezone?: string;
    status?: MeetingStatus;
    startedAt?: Date;
    endedAt?: Date;
    settings?: MeetingSettings;
  }
): Promise<Meeting | null> {
  const updateData: Partial<typeof meeting.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.title !== undefined) {
    updateData.title = updates.title.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description.trim() || null;
  }
  if (updates.scheduledAt !== undefined) {
    updateData.scheduledAt = updates.scheduledAt;
  }
  if (updates.durationMinutes !== undefined) {
    updateData.durationMinutes = updates.durationMinutes;
  }
  if (updates.timezone !== undefined) {
    updateData.timezone = updates.timezone;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.startedAt !== undefined) {
    updateData.startedAt = updates.startedAt;
  }
  if (updates.endedAt !== undefined) {
    updateData.endedAt = updates.endedAt;
  }
  if (updates.settings !== undefined) {
    updateData.settings = updates.settings;
  }

  const [row] = await db
    .update(meeting)
    .set(updateData)
    .where(and(eq(meeting.id, meetingId), eq(meeting.hostId, hostId)))
    .returning();

  return row ? rowToMeeting(row) : null;
}

/**
 * Marks a meeting as started.
 */
export async function startMeeting(meetingId: string, hostId: string): Promise<Meeting | null> {
  return updateMeeting(meetingId, hostId, {
    status: "live",
    startedAt: new Date(),
  });
}

/**
 * Marks a meeting as ended.
 */
export async function endMeeting(meetingId: string, hostId: string): Promise<Meeting | null> {
  return updateMeeting(meetingId, hostId, {
    status: "ended",
    endedAt: new Date(),
  });
}

/**
 * Cancels a meeting.
 */
export async function cancelMeeting(meetingId: string, hostId: string): Promise<Meeting | null> {
  return updateMeeting(meetingId, hostId, {
    status: "cancelled",
  });
}

/**
 * Deletes a meeting.
 */
export async function deleteMeeting(meetingId: string, hostId: string): Promise<boolean> {
  const result = await db
    .delete(meeting)
    .where(and(eq(meeting.id, meetingId), eq(meeting.hostId, hostId)))
    .returning({ id: meeting.id });

  return result.length > 0;
}

/**
 * Checks if a user is the host of a meeting.
 */
export async function isMeetingHost(meetingId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: meeting.id })
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), eq(meeting.hostId, userId)))
    .limit(1);

  return !!row;
}
