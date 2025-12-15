/**
 * Meeting Invitee Database Operations
 *
 * CRUD operations for managing meeting invitations and RSVP tracking.
 */

import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { meetingInvitee, meeting } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type {
  MeetingInvitee,
  RSVPStatus,
  RSVPSummary,
  InviteeInput,
} from "@/types/invitee";

// ============================================================================
// Types
// ============================================================================

export interface CreateInviteeInput {
  meetingId: string;
  email: string;
  name?: string;
  invitedBy: string;
}

export interface InviteeWithMeeting extends MeetingInvitee {
  meeting: {
    id: string;
    title: string;
    roomId: string;
    scheduledAt: string | null;
    durationMinutes: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for an invitee.
 */
function generateInviteeId(): string {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a cryptographically secure RSVP token.
 * This token allows invitees to respond without authentication.
 * Uses crypto.randomBytes for security - tokens are unpredictable.
 */
function generateRsvpToken(): string {
  // 24 bytes = 32 characters in base64url encoding
  return randomBytes(24).toString("base64url");
}

/**
 * Convert database row to MeetingInvitee type.
 * @param row - Database row
 * @param includeToken - Whether to include the rsvpToken (default: false for security)
 */
function rowToInvitee(
  row: typeof meetingInvitee.$inferSelect,
  includeToken = false
): MeetingInvitee {
  return {
    id: row.id,
    meetingId: row.meetingId,
    email: row.email,
    name: row.name,
    status: row.status as RSVPStatus,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    invitedAt: row.invitedAt.toISOString(),
    invitedBy: row.invitedBy,
    emailSentAt: row.emailSentAt?.toISOString() ?? null,
    emailOpenedAt: row.emailOpenedAt?.toISOString() ?? null,
    // Only include rsvpToken when explicitly requested (e.g., for email sending)
    rsvpToken: includeToken ? row.rsvpToken : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a single meeting invitee.
 */
export async function createInvitee(
  input: CreateInviteeInput
): Promise<MeetingInvitee> {
  const id = generateInviteeId();
  const rsvpToken = generateRsvpToken();
  const now = new Date();

  const [row] = await db
    .insert(meetingInvitee)
    .values({
      id,
      meetingId: input.meetingId,
      email: input.email.toLowerCase().trim(),
      name: input.name?.trim() || null,
      status: "pending",
      invitedAt: now,
      invitedBy: input.invitedBy,
      rsvpToken,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Include token for newly created invitees (needed for email sending)
  return rowToInvitee(row, true);
}

/**
 * Create multiple invitees for a meeting.
 * Skips emails that are already invited.
 */
export async function createInvitees(
  meetingId: string,
  invitees: InviteeInput[],
  invitedBy: string
): Promise<{
  created: MeetingInvitee[];
  alreadyInvited: string[];
}> {
  // Get existing invitees for this meeting
  const existing = await db
    .select({ email: meetingInvitee.email })
    .from(meetingInvitee)
    .where(eq(meetingInvitee.meetingId, meetingId));

  const existingEmails = new Set(existing.map((e) => e.email.toLowerCase()));

  // Filter out already invited emails
  const toCreate: InviteeInput[] = [];
  const alreadyInvited: string[] = [];

  for (const invitee of invitees) {
    const normalizedEmail = invitee.email.toLowerCase().trim();
    if (existingEmails.has(normalizedEmail)) {
      alreadyInvited.push(normalizedEmail);
    } else {
      toCreate.push(invitee);
      existingEmails.add(normalizedEmail); // Prevent duplicates in input
    }
  }

  if (toCreate.length === 0) {
    return { created: [], alreadyInvited };
  }

  // Batch insert new invitees
  const now = new Date();
  const values = toCreate.map((invitee) => ({
    id: generateInviteeId(),
    meetingId,
    email: invitee.email.toLowerCase().trim(),
    name: invitee.name?.trim() || null,
    status: "pending" as const,
    invitedAt: now,
    invitedBy,
    rsvpToken: generateRsvpToken(),
    createdAt: now,
    updatedAt: now,
  }));

  const rows = await db.insert(meetingInvitee).values(values).returning();

  return {
    // Include tokens for newly created invitees (needed for email sending)
    created: rows.map((row) => rowToInvitee(row, true)),
    alreadyInvited,
  };
}

/**
 * Get an invitee by ID.
 */
export async function getInviteeById(
  inviteeId: string
): Promise<MeetingInvitee | null> {
  const [row] = await db
    .select()
    .from(meetingInvitee)
    .where(eq(meetingInvitee.id, inviteeId))
    .limit(1);

  return row ? rowToInvitee(row, false) : null;
}

/**
 * Get an invitee by RSVP token (for unauthenticated RSVP).
 */
export async function getInviteeByToken(
  token: string
): Promise<InviteeWithMeeting | null> {
  const [result] = await db
    .select({
      invitee: meetingInvitee,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        roomId: meeting.roomId,
        scheduledAt: meeting.scheduledAt,
        durationMinutes: meeting.durationMinutes,
      },
    })
    .from(meetingInvitee)
    .innerJoin(meeting, eq(meetingInvitee.meetingId, meeting.id))
    .where(eq(meetingInvitee.rsvpToken, token))
    .limit(1);

  if (!result) return null;

  return {
    ...rowToInvitee(result.invitee),
    meeting: {
      id: result.meeting.id,
      title: result.meeting.title,
      roomId: result.meeting.roomId,
      scheduledAt: result.meeting.scheduledAt?.toISOString() ?? null,
      durationMinutes: result.meeting.durationMinutes ?? 60,
    },
  };
}

/**
 * Get all invitees for a meeting.
 */
export async function getInviteesByMeetingId(
  meetingId: string
): Promise<MeetingInvitee[]> {
  const rows = await db
    .select()
    .from(meetingInvitee)
    .where(eq(meetingInvitee.meetingId, meetingId))
    .orderBy(meetingInvitee.invitedAt);

  // Don't include tokens when listing invitees (security)
  return rows.map((row) => rowToInvitee(row, false));
}

/**
 * Get RSVP summary for a meeting.
 */
export async function getRsvpSummary(meetingId: string): Promise<RSVPSummary> {
  const rows = await db
    .select({
      status: meetingInvitee.status,
      count: sql<number>`count(*)::int`,
    })
    .from(meetingInvitee)
    .where(eq(meetingInvitee.meetingId, meetingId))
    .groupBy(meetingInvitee.status);

  const summary: RSVPSummary = {
    total: 0,
    accepted: 0,
    declined: 0,
    tentative: 0,
    pending: 0,
  };

  for (const row of rows) {
    const status = row.status as RSVPStatus;
    const count = row.count;
    summary[status] = count;
    summary.total += count;
  }

  return summary;
}

/**
 * Update RSVP status for an invitee.
 */
export async function updateRsvpStatus(
  inviteeId: string,
  status: RSVPStatus
): Promise<MeetingInvitee | null> {
  const now = new Date();

  const [row] = await db
    .update(meetingInvitee)
    .set({
      status,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(meetingInvitee.id, inviteeId))
    .returning();

  return row ? rowToInvitee(row, false) : null;
}

/**
 * Update RSVP status using token (unauthenticated).
 */
export async function updateRsvpByToken(
  token: string,
  status: RSVPStatus
): Promise<MeetingInvitee | null> {
  const now = new Date();

  const [row] = await db
    .update(meetingInvitee)
    .set({
      status,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(meetingInvitee.rsvpToken, token))
    .returning();

  return row ? rowToInvitee(row, false) : null;
}

/**
 * Mark email as sent for an invitee.
 */
export async function markEmailSent(inviteeId: string): Promise<void> {
  await db
    .update(meetingInvitee)
    .set({
      emailSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(meetingInvitee.id, inviteeId));
}

/**
 * Mark email as sent for multiple invitees.
 */
export async function markEmailsSent(inviteeIds: string[]): Promise<void> {
  if (inviteeIds.length === 0) return;

  const now = new Date();
  await db
    .update(meetingInvitee)
    .set({
      emailSentAt: now,
      updatedAt: now,
    })
    .where(sql`${meetingInvitee.id} IN (${sql.join(inviteeIds.map(id => sql`${id}`), sql`, `)})`);
}

/**
 * Delete an invitee.
 */
export async function deleteInvitee(inviteeId: string): Promise<boolean> {
  const result = await db
    .delete(meetingInvitee)
    .where(eq(meetingInvitee.id, inviteeId))
    .returning({ id: meetingInvitee.id });

  return result.length > 0;
}

/**
 * Delete an invitee by meeting ID and email.
 */
export async function deleteInviteeByEmail(
  meetingId: string,
  email: string
): Promise<boolean> {
  const result = await db
    .delete(meetingInvitee)
    .where(
      and(
        eq(meetingInvitee.meetingId, meetingId),
        eq(meetingInvitee.email, email.toLowerCase().trim())
      )
    )
    .returning({ id: meetingInvitee.id });

  return result.length > 0;
}

/**
 * Check if a user is invited to a meeting.
 */
export async function isUserInvited(
  meetingId: string,
  email: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: meetingInvitee.id })
    .from(meetingInvitee)
    .where(
      and(
        eq(meetingInvitee.meetingId, meetingId),
        eq(meetingInvitee.email, email.toLowerCase().trim())
      )
    )
    .limit(1);

  return !!row;
}
