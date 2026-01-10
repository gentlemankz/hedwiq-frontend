/**
 * Meeting History Functions
 *
 * Functions for retrieving full meeting history with all related data.
 */

import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  meeting,
  meetingSession,
  transcriptionSegment,
  meetingInsight,
  meetingNote,
  user,
} from "../schema";
import { getMeetingTranscription } from "./transcription";
import { getMeetingInsights } from "./insights";
import { getMeetingDocumentReferences } from "./document-references";
import { getAllMeetingNotes } from "./notes";
import type { MeetingHistoryData } from "./types";

// ============================================================================
// Meeting History Functions
// ============================================================================

/**
 * Get full meeting history with all related data
 */
export async function getMeetingHistory(
  meetingId: string
): Promise<MeetingHistoryData | null> {
  // Get meeting with host info
  const meetings = await db
    .select({
      id: meeting.id,
      roomId: meeting.roomId,
      title: meeting.title,
      description: meeting.description,
      type: meeting.type,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      durationMinutes: meeting.durationMinutes,
      createdAt: meeting.createdAt,
      hostId: user.id,
      hostName: user.name,
      hostEmail: user.email,
      hostImage: user.image,
    })
    .from(meeting)
    .innerJoin(user, eq(meeting.hostId, user.id))
    .where(eq(meeting.id, meetingId))
    .limit(1);

  if (meetings.length === 0) return null;

  const m = meetings[0];

  // Get all sessions with user info
  const sessions = await db
    .select({
      id: meetingSession.id,
      odId: meetingSession.userId, // Note: Using odId to avoid naming conflict with function parameter
      userName: user.name,
      joinedAt: meetingSession.joinedAt,
      leftAt: meetingSession.leftAt,
      durationSeconds: meetingSession.durationSeconds,
      isHost: meetingSession.isHost,
    })
    .from(meetingSession)
    .innerJoin(user, eq(meetingSession.userId, user.id))
    .where(eq(meetingSession.meetingId, meetingId))
    .orderBy(asc(meetingSession.joinedAt));

  // Get transcription
  const transcription = await getMeetingTranscription(meetingId);

  // Get insights
  const insights = await getMeetingInsights(meetingId);

  // Get document references
  const documentRefs = await getMeetingDocumentReferences(meetingId);

  // Get notes
  const notes = await getAllMeetingNotes(meetingId);

  // Calculate stats
  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0
  );
  const uniqueParticipants = new Set(sessions.map((s) => s.odId)).size;

  return {
    meeting: {
      id: m.id,
      roomId: m.roomId,
      title: m.title,
      description: m.description,
      type: m.type,
      status: m.status,
      scheduledAt: m.scheduledAt,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      durationMinutes: m.durationMinutes,
      createdAt: m.createdAt,
    },
    host: {
      id: m.hostId,
      name: m.hostName,
      email: m.hostEmail,
      image: m.hostImage,
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      userId: s.odId,
      userName: s.userName,
      joinedAt: s.joinedAt,
      leftAt: s.leftAt,
      durationSeconds: s.durationSeconds,
      isHost: s.isHost,
    })),
    transcription,
    insights,
    documentReferences: documentRefs,
    notes,
    stats: {
      totalDurationMinutes: Math.round(totalDuration / 60),
      participantCount: uniqueParticipants,
      transcriptionSegmentCount: transcription.length,
      insightCount: insights.length,
      documentReferenceCount: documentRefs.length,
      noteCount: notes.length,
    },
  };
}

/**
 * Get meeting history list for a user (past meetings with basic stats)
 * OPTIMIZED: Uses grouped COUNT queries instead of N+1 individual queries
 * Previous version ran ~4 queries per meeting (~200 queries for 50 meetings)
 * New version runs 5 queries total regardless of meeting count
 *
 * Shows meetings where user is EITHER:
 * - The meeting host (meeting.hostId = userId), OR
 * - A participant with a session (meetingSession.userId = userId)
 * This ensures consistency with folder meeting counts.
 */
export async function getUserMeetingHistory(
  userId: string,
  limit = 20,
  offset = 0,
  folderId?: string | null
): Promise<Array<{
  id: string;
  roomId: string;
  title: string;
  status: string;
  endedAt: Date | null;
  durationMinutes: number | null;
  folderId: string | null;
  participantCount: number;
  transcriptionCount: number;
  insightCount: number;
  noteCount: number;
}>> {
  // Build folder filter condition
  const folderCondition = folderId !== undefined
    ? folderId === null
      ? isNull(meeting.folderId)
      : eq(meeting.folderId, folderId)
    : undefined;

  // Get ended meetings where user is host OR participated (has session)
  // Using LEFT JOIN + OR condition to capture both cases
  const meetings = await db
    .selectDistinct({
      id: meeting.id,
      roomId: meeting.roomId,
      title: meeting.title,
      status: meeting.status,
      endedAt: meeting.endedAt,
      durationMinutes: meeting.durationMinutes,
      folderId: meeting.folderId,
    })
    .from(meeting)
    .leftJoin(meetingSession, eq(meeting.id, meetingSession.meetingId))
    .where(
      folderCondition
        ? and(
            sql`(${meeting.hostId} = ${userId} OR ${meetingSession.userId} = ${userId})`,
            eq(meeting.status, "ended"),
            folderCondition
          )
        : and(
            sql`(${meeting.hostId} = ${userId} OR ${meetingSession.userId} = ${userId})`,
            eq(meeting.status, "ended")
          )
    )
    .orderBy(desc(meeting.endedAt))
    .limit(limit)
    .offset(offset);

  if (meetings.length === 0) return [];

  // Collect meeting IDs for batched count queries
  const meetingIds = meetings.map((m) => m.id);

  // OPTIMIZED: Fetch all counts in 4 grouped queries instead of N*4 queries
  const [sessionCounts, transcriptCounts, insightCounts, noteCounts] = await Promise.all([
    // Session counts grouped by meeting
    db
      .select({
        meetingId: meetingSession.meetingId,
        count: sql<number>`COUNT(DISTINCT ${meetingSession.userId})::int`,
      })
      .from(meetingSession)
      .where(sql`${meetingSession.meetingId} IN ${meetingIds}`)
      .groupBy(meetingSession.meetingId),

    // Transcription counts grouped by meeting
    db
      .select({
        meetingId: transcriptionSegment.meetingId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transcriptionSegment)
      .where(sql`${transcriptionSegment.meetingId} IN ${meetingIds}`)
      .groupBy(transcriptionSegment.meetingId),

    // Insight counts grouped by meeting
    db
      .select({
        meetingId: meetingInsight.meetingId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(meetingInsight)
      .where(sql`${meetingInsight.meetingId} IN ${meetingIds}`)
      .groupBy(meetingInsight.meetingId),

    // Note counts grouped by meeting
    db
      .select({
        meetingId: meetingNote.meetingId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(meetingNote)
      .where(sql`${meetingNote.meetingId} IN ${meetingIds}`)
      .groupBy(meetingNote.meetingId),
  ]);

  // Build lookup maps for O(1) access
  const sessionMap = new Map(sessionCounts.map((s) => [s.meetingId, s.count]));
  const transcriptMap = new Map(transcriptCounts.map((t) => [t.meetingId, t.count]));
  const insightMap = new Map(insightCounts.map((i) => [i.meetingId, i.count]));
  const noteMap = new Map(noteCounts.map((n) => [n.meetingId, n.count]));

  // Merge counts with meetings
  return meetings.map((m) => ({
    ...m,
    participantCount: sessionMap.get(m.id) ?? 0,
    transcriptionCount: transcriptMap.get(m.id) ?? 0,
    insightCount: insightMap.get(m.id) ?? 0,
    noteCount: noteMap.get(m.id) ?? 0,
  }));
}

/**
 * Get meeting ID by room ID
 */
export async function getMeetingByRoomId(
  roomId: string
): Promise<{ id: string; hostId: string } | null> {
  const meetings = await db
    .select({ id: meeting.id, hostId: meeting.hostId })
    .from(meeting)
    .where(eq(meeting.roomId, roomId))
    .limit(1);

  return meetings[0] ?? null;
}
