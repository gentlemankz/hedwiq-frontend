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

import { eq, and, desc, asc } from "drizzle-orm";
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
 */
export async function endMeetingSession(sessionId: string): Promise<void> {
  const now = new Date();

  // Get the session to calculate duration
  const sessions = await db
    .select()
    .from(meetingSession)
    .where(eq(meetingSession.id, sessionId))
    .limit(1);

  if (sessions.length === 0) {
    console.warn(`Session ${sessionId} not found`);
    return;
  }

  const session = sessions[0];
  const durationSeconds = Math.floor(
    (now.getTime() - session.joinedAt.getTime()) / 1000
  );

  await db
    .update(meetingSession)
    .set({
      leftAt: now,
      durationSeconds,
      updatedAt: now,
    })
    .where(eq(meetingSession.id, sessionId));
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
 */
export async function saveTranscriptionSegments(
  segments: TranscriptionInput[]
): Promise<void> {
  if (segments.length === 0) return;

  // Use upsert to handle duplicates (same segment ID)
  for (const segment of segments) {
    await db
      .insert(transcriptionSegment)
      .values({
        id: segment.id,
        meetingId: segment.meetingId,
        roomId: segment.roomId,
        speakerIdentity: segment.speakerIdentity,
        speakerName: segment.speakerName,
        text: segment.text,
        timestamp: segment.timestamp,
        orderIndex: segment.orderIndex,
        isFinal: segment.isFinal ?? true,
      })
      .onConflictDoUpdate({
        target: transcriptionSegment.id,
        set: {
          text: segment.text,
          isFinal: segment.isFinal ?? true,
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
 * Save insights (batch insert with upsert)
 */
export async function saveInsights(insights: InsightInput[]): Promise<void> {
  if (insights.length === 0) return;

  for (const insight of insights) {
    await db
      .insert(meetingInsight)
      .values({
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
      })
      .onConflictDoNothing();
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
 * Save document references (batch insert with upsert)
 */
export async function saveDocumentReferences(
  references: DocumentReferenceInput[]
): Promise<void> {
  if (references.length === 0) return;

  for (const ref of references) {
    await db
      .insert(documentReference)
      .values({
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
      })
      .onConflictDoNothing();
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
 * Optimized to minimize N+1 queries by using batch fetching with Promise.all
 */
export async function getUserMeetingHistory(
  userId: string,
  limit = 20,
  offset = 0
): Promise<Array<{
  id: string;
  roomId: string;
  title: string;
  status: string;
  endedAt: Date | null;
  durationMinutes: number | null;
  participantCount: number;
  transcriptionCount: number;
  insightCount: number;
  noteCount: number;
}>> {
  // Get ended meetings where user participated
  const meetings = await db
    .selectDistinct({
      id: meeting.id,
      roomId: meeting.roomId,
      title: meeting.title,
      status: meeting.status,
      endedAt: meeting.endedAt,
      durationMinutes: meeting.durationMinutes,
    })
    .from(meeting)
    .innerJoin(meetingSession, eq(meeting.id, meetingSession.meetingId))
    .where(
      and(
        eq(meetingSession.userId, userId),
        eq(meeting.status, "ended")
      )
    )
    .orderBy(desc(meeting.endedAt))
    .limit(limit)
    .offset(offset);

  if (meetings.length === 0) return [];

  // Fetch counts for all meetings in parallel (batched by meeting, but parallel across meetings)
  const countsPromises = meetings.map(async (m) => {
    const [sessions, transcripts, insights, notes] = await Promise.all([
      db.select({ id: meetingSession.id }).from(meetingSession).where(eq(meetingSession.meetingId, m.id)),
      db.select({ id: transcriptionSegment.id }).from(transcriptionSegment).where(eq(transcriptionSegment.meetingId, m.id)),
      db.select({ id: meetingInsight.id }).from(meetingInsight).where(eq(meetingInsight.meetingId, m.id)),
      db.select({ id: meetingNote.id }).from(meetingNote).where(eq(meetingNote.meetingId, m.id)),
    ]);
    return {
      ...m,
      participantCount: sessions.length,
      transcriptionCount: transcripts.length,
      insightCount: insights.length,
      noteCount: notes.length,
    };
  });

  return Promise.all(countsPromises);
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
