/**
 * Meeting Data Persistence Functions
 *
 * Provides functions for storing and retrieving meeting data:
 * - Sessions (user participation tracking)
 * - Transcriptions (speech to text)
 * - Insights (AI-detected patterns)
 * - Document References (document mentions)
 * - Notes (user-created notes)
 */

import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import {
  meetingSession,
  transcriptionSegment,
  meetingInsight,
  documentReference,
  meetingNote,
  meeting,
  user,
  document,
} from "./schema";
import { reportMeetingMinutes } from "@/lib/polar/usage";

// ============================================================================
// Types
// ============================================================================

export interface CreateSessionInput {
  meetingId: string;
  userId: string;
  roomId: string;
  isHost?: boolean;
}

export interface TranscriptionInput {
  id: string;
  meetingId: string;
  roomId: string;
  speakerIdentity: string;
  speakerName: string;
  text: string;
  timestamp: Date;
  orderIndex: number;
  isFinal?: boolean;
}

export interface InsightInput {
  id: string;
  meetingId: string;
  roomId: string;
  type: string;
  content: string;
  speakerIdentity?: string;
  speakerName?: string;
  confidence: number;
  transcriptRef?: string;
  timestamp: Date;
}

export interface DocumentReferenceInput {
  id: string;
  meetingId: string;
  roomId: string;
  documentId: string;
  sectionId: string;
  pageNumber: number;
  sectionTitle?: string;
  matchedText?: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  context: string;
  confidence: number;
  transcriptRef?: string;
  timestamp: Date;
}

export interface NotesInput {
  meetingId: string;
  roomId: string;
  userId: string;
  blocks: Array<
    | {
        type: "text";
        id: string;
        content: string;
        createdAt: number;
        updatedAt: number;
      }
    | {
        type: "transcript";
        id: string;
        transcriptNoteId: string;
        createdAt: number;
      }
  >;
  transcriptNotes: Record<
    string,
    {
      id: string;
      content: string;
      reference: {
        transcriptId: string;
        participantIdentity: string;
        participantName: string;
        transcriptText: string;
        transcriptTimestamp: number;
      };
      createdAt: number;
      updatedAt: number;
    }
  >;
}

export interface MeetingHistoryData {
  meeting: {
    id: string;
    roomId: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    scheduledAt: Date | null;
    startedAt: Date | null;
    endedAt: Date | null;
    durationMinutes: number | null;
    createdAt: Date;
  };
  host: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  sessions: Array<{
    id: string;
    userId: string;
    userName: string;
    joinedAt: Date;
    leftAt: Date | null;
    durationSeconds: number | null;
    isHost: boolean;
  }>;
  transcription: Array<{
    id: string;
    speakerIdentity: string;
    speakerName: string;
    text: string;
    timestamp: Date;
  }>;
  insights: Array<{
    id: string;
    type: string;
    content: string;
    speakerName: string | null;
    confidence: number;
    transcriptRef: string | null;
    timestamp: Date;
  }>;
  documentReferences: Array<{
    id: string;
    documentId: string;
    documentTitle: string;
    sectionTitle: string | null;
    pageNumber: number;
    context: string;
    matchedText: string | null;
    transcriptRef: string | null;
    timestamp: Date;
  }>;
  notes: Array<{
    userId: string;
    userName: string;
    blocks: NotesInput["blocks"];
    transcriptNotes: NotesInput["transcriptNotes"];
    updatedAt: Date;
  }>;
  stats: {
    totalDurationMinutes: number;
    participantCount: number;
    transcriptionSegmentCount: number;
    insightCount: number;
    documentReferenceCount: number;
    noteCount: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum rows per batch insert to avoid PostgreSQL parameter limits.
 * PostgreSQL has a limit of ~65535 parameters per query.
 * With ~10-15 columns per row, 100 rows keeps us well under the limit.
 */
const BATCH_INSERT_CHUNK_SIZE = 100;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Split an array into chunks of specified size
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================================================
// Session Functions
// ============================================================================

/**
 * Create a new meeting session when user joins
 */
export async function createMeetingSession(
  input: CreateSessionInput
): Promise<string> {
  const sessionId = generateId("sess");

  await db.insert(meetingSession).values({
    id: sessionId,
    meetingId: input.meetingId,
    userId: input.userId,
    roomId: input.roomId,
    isHost: input.isHost ?? false,
    joinedAt: new Date(),
  });

  return sessionId;
}

/**
 * End a meeting session when user leaves
 *
 * Also reports usage to Polar for billing purposes.
 *
 * @param sessionId - The session ID to end
 * @returns The session data with duration, or null if session not found
 */
export async function endMeetingSession(sessionId: string): Promise<{
  id: string;
  userId: string;
  meetingId: string;
  roomId: string;
  durationSeconds: number;
} | null> {
  const now = new Date();

  // Get the session to calculate duration
  const sessions = await db
    .select()
    .from(meetingSession)
    .where(eq(meetingSession.id, sessionId))
    .limit(1);

  if (sessions.length === 0) {
    console.warn(`Session ${sessionId} not found`);
    return null;
  }

  const session = sessions[0];
  const durationSeconds = Math.floor(
    (now.getTime() - session.joinedAt.getTime()) / 1000
  );

  // Update the session in database
  await db
    .update(meetingSession)
    .set({
      leftAt: now,
      durationSeconds,
      updatedAt: now,
    })
    .where(eq(meetingSession.id, sessionId));

  // Report meeting minutes to Polar for usage-based billing
  // Convert seconds to minutes (rounding up to nearest minute)
  const durationMinutes = Math.ceil(durationSeconds / 60);

  if (durationMinutes > 0) {
    // Fire and forget - don't block session end on usage reporting
    reportMeetingMinutes(session.userId, durationMinutes, {
      roomId: session.roomId,
      meetingId: session.meetingId,
      sessionId: session.id,
    }).catch((error) => {
      console.error("[Meeting Session] Failed to report usage to Polar:", error);
    });
  }

  return {
    id: session.id,
    userId: session.userId,
    meetingId: session.meetingId,
    roomId: session.roomId,
    durationSeconds,
  };
}

/**
 * Get active session for a user in a meeting
 */
export async function getActiveSession(
  meetingId: string,
  userId: string
): Promise<{ id: string } | null> {
  const sessions = await db
    .select({ id: meetingSession.id })
    .from(meetingSession)
    .where(
      and(
        eq(meetingSession.meetingId, meetingId),
        eq(meetingSession.userId, userId)
      )
    )
    .orderBy(desc(meetingSession.joinedAt))
    .limit(1);

  return sessions[0] ?? null;
}

/**
 * Validate that a session belongs to a specific user
 */
export async function validateSessionOwnership(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const sessions = await db
    .select({ userId: meetingSession.userId })
    .from(meetingSession)
    .where(eq(meetingSession.id, sessionId))
    .limit(1);

  if (sessions.length === 0) return false;
  return sessions[0].userId === userId;
}

// ============================================================================
// Transcription Functions
// ============================================================================

/**
 * Save transcription segments (batch insert with upsert)
 *
 * Uses chunked batch inserts to avoid PostgreSQL parameter limits.
 * For very long meetings with thousands of segments, this prevents query failures.
 */
export async function saveTranscriptionSegments(
  segments: TranscriptionInput[]
): Promise<void> {
  if (segments.length === 0) return;

  // Prepare values for batch insert
  const values = segments.map((segment) => ({
    id: segment.id,
    meetingId: segment.meetingId,
    roomId: segment.roomId,
    speakerIdentity: segment.speakerIdentity,
    speakerName: segment.speakerName,
    text: segment.text,
    timestamp: segment.timestamp,
    orderIndex: segment.orderIndex,
    isFinal: segment.isFinal ?? true,
  }));

  // Chunk the values to avoid PostgreSQL parameter limits
  const chunks = chunk(values, BATCH_INSERT_CHUNK_SIZE);

  // Process chunks sequentially to maintain order and avoid overwhelming the DB
  for (const valueChunk of chunks) {
    // Batch insert with upsert - uses PostgreSQL ON CONFLICT DO UPDATE
    // The sql`excluded.column` syntax references the values that would have been inserted
    await db
      .insert(transcriptionSegment)
      .values(valueChunk)
      .onConflictDoUpdate({
        target: transcriptionSegment.id,
        set: {
          text: sql`excluded.text`,
          isFinal: sql`excluded.is_final`,
        },
      });
  }
}

/**
 * Get transcription for a meeting
 */
export async function getMeetingTranscription(
  meetingId: string
): Promise<Array<{
  id: string;
  speakerIdentity: string;
  speakerName: string;
  text: string;
  timestamp: Date;
}>> {
  return db
    .select({
      id: transcriptionSegment.id,
      speakerIdentity: transcriptionSegment.speakerIdentity,
      speakerName: transcriptionSegment.speakerName,
      text: transcriptionSegment.text,
      timestamp: transcriptionSegment.timestamp,
    })
    .from(transcriptionSegment)
    .where(
      and(
        eq(transcriptionSegment.meetingId, meetingId),
        eq(transcriptionSegment.isFinal, true)
      )
    )
    .orderBy(asc(transcriptionSegment.orderIndex));
}

// ============================================================================
// Insight Functions
// ============================================================================

/**
 * Save insights (batch insert)
 *
 * Uses chunked batch inserts to avoid PostgreSQL parameter limits.
 */
export async function saveInsights(insights: InsightInput[]): Promise<void> {
  if (insights.length === 0) return;

  // Prepare values for batch insert
  const values = insights.map((insight) => ({
    id: insight.id,
    meetingId: insight.meetingId,
    roomId: insight.roomId,
    type: insight.type,
    content: insight.content,
    speakerIdentity: insight.speakerIdentity,
    speakerName: insight.speakerName,
    confidence: Math.round(insight.confidence * 100),
    transcriptRef: insight.transcriptRef,
    timestamp: insight.timestamp,
  }));

  // Chunk the values to avoid PostgreSQL parameter limits
  const chunks = chunk(values, BATCH_INSERT_CHUNK_SIZE);

  for (const valueChunk of chunks) {
    // Batch insert, skip duplicates
    await db.insert(meetingInsight).values(valueChunk).onConflictDoNothing();
  }
}

/**
 * Get insights for a meeting
 */
export async function getMeetingInsights(
  meetingId: string
): Promise<Array<{
  id: string;
  type: string;
  content: string;
  speakerName: string | null;
  confidence: number;
  transcriptRef: string | null;
  timestamp: Date;
}>> {
  return db
    .select({
      id: meetingInsight.id,
      type: meetingInsight.type,
      content: meetingInsight.content,
      speakerName: meetingInsight.speakerName,
      confidence: meetingInsight.confidence,
      transcriptRef: meetingInsight.transcriptRef,
      timestamp: meetingInsight.timestamp,
    })
    .from(meetingInsight)
    .where(eq(meetingInsight.meetingId, meetingId))
    .orderBy(asc(meetingInsight.timestamp));
}

// ============================================================================
// Document Reference Functions
// ============================================================================

/**
 * Save document references (batch insert)
 *
 * Uses chunked batch inserts to avoid PostgreSQL parameter limits.
 */
export async function saveDocumentReferences(
  references: DocumentReferenceInput[]
): Promise<void> {
  if (references.length === 0) return;

  // Prepare values for batch insert
  const values = references.map((ref) => ({
    id: ref.id,
    meetingId: ref.meetingId,
    roomId: ref.roomId,
    documentId: ref.documentId,
    sectionId: ref.sectionId,
    pageNumber: ref.pageNumber,
    sectionTitle: ref.sectionTitle,
    matchedText: ref.matchedText,
    bbox: ref.bbox,
    context: ref.context,
    confidence: Math.round(ref.confidence * 100),
    transcriptRef: ref.transcriptRef,
    timestamp: ref.timestamp,
  }));

  // Chunk the values to avoid PostgreSQL parameter limits
  const chunks = chunk(values, BATCH_INSERT_CHUNK_SIZE);

  for (const valueChunk of chunks) {
    // Batch insert, skip duplicates
    await db.insert(documentReference).values(valueChunk).onConflictDoNothing();
  }
}

/**
 * Get document references for a meeting
 */
export async function getMeetingDocumentReferences(
  meetingId: string
): Promise<Array<{
  id: string;
  documentId: string;
  documentTitle: string;
  sectionTitle: string | null;
  pageNumber: number;
  context: string;
  matchedText: string | null;
  transcriptRef: string | null;
  timestamp: Date;
}>> {
  const refs = await db
    .select({
      id: documentReference.id,
      documentId: documentReference.documentId,
      documentTitle: document.title,
      sectionTitle: documentReference.sectionTitle,
      pageNumber: documentReference.pageNumber,
      context: documentReference.context,
      matchedText: documentReference.matchedText,
      transcriptRef: documentReference.transcriptRef,
      timestamp: documentReference.timestamp,
    })
    .from(documentReference)
    .innerJoin(document, eq(documentReference.documentId, document.id))
    .where(eq(documentReference.meetingId, meetingId))
    .orderBy(asc(documentReference.timestamp));

  return refs;
}

// ============================================================================
// Notes Functions
// ============================================================================

/**
 * Save or update meeting notes for a user
 */
export async function saveMeetingNotes(input: NotesInput): Promise<void> {
  const noteId = generateId("note");

  await db
    .insert(meetingNote)
    .values({
      id: noteId,
      meetingId: input.meetingId,
      roomId: input.roomId,
      userId: input.userId,
      blocks: input.blocks,
      transcriptNotes: input.transcriptNotes,
      version: 2,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [meetingNote.meetingId, meetingNote.userId],
      set: {
        blocks: input.blocks,
        transcriptNotes: input.transcriptNotes,
        updatedAt: new Date(),
      },
    });
}

/**
 * Get meeting notes for a user
 */
export async function getMeetingNotes(
  meetingId: string,
  userId: string
): Promise<NotesInput | null> {
  const notes = await db
    .select({
      blocks: meetingNote.blocks,
      transcriptNotes: meetingNote.transcriptNotes,
    })
    .from(meetingNote)
    .where(
      and(eq(meetingNote.meetingId, meetingId), eq(meetingNote.userId, userId))
    )
    .limit(1);

  if (notes.length === 0) return null;

  return {
    meetingId,
    roomId: "", // Not needed for retrieval
    userId,
    blocks: notes[0].blocks,
    transcriptNotes: notes[0].transcriptNotes,
  };
}

/**
 * Get all notes for a meeting (all users)
 */
export async function getAllMeetingNotes(
  meetingId: string
): Promise<Array<{
  userId: string;
  userName: string;
  blocks: NotesInput["blocks"];
  transcriptNotes: NotesInput["transcriptNotes"];
  updatedAt: Date;
}>> {
  const notes = await db
    .select({
      userId: meetingNote.userId,
      userName: user.name,
      blocks: meetingNote.blocks,
      transcriptNotes: meetingNote.transcriptNotes,
      updatedAt: meetingNote.updatedAt,
    })
    .from(meetingNote)
    .innerJoin(user, eq(meetingNote.userId, user.id))
    .where(eq(meetingNote.meetingId, meetingId))
    .orderBy(asc(meetingNote.createdAt));

  return notes;
}

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

  // Get ended meetings where user participated
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
    .innerJoin(meetingSession, eq(meeting.id, meetingSession.meetingId))
    .where(
      folderCondition
        ? and(
            eq(meetingSession.userId, userId),
            eq(meeting.status, "ended"),
            folderCondition
          )
        : and(
            eq(meetingSession.userId, userId),
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
