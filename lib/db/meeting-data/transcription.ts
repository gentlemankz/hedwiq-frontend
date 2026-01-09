/**
 * Transcription Functions
 *
 * Functions for saving and retrieving meeting transcription segments.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "../index";
import { transcriptionSegment } from "../schema";
import { chunk } from "./helpers";
import { BATCH_INSERT_CHUNK_SIZE } from "./constants";
import type { TranscriptionInput } from "./types";

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

/**
 * Get transcription for a meeting with DB-level limits
 * Used by agents to prevent loading large transcripts into memory
 */
export async function getMeetingTranscriptionLimited(
  meetingId: string,
  maxSegments: number = 500
): Promise<{
  segments: Array<{
    id: string;
    speakerIdentity: string;
    speakerName: string;
    text: string;
    timestamp: Date;
  }>;
  totalCount: number;
  truncated: boolean;
}> {
  // First get total count to know if we're truncating
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transcriptionSegment)
    .where(
      and(
        eq(transcriptionSegment.meetingId, meetingId),
        eq(transcriptionSegment.isFinal, true)
      )
    );

  const totalCount = countResult?.count ?? 0;

  // Fetch only up to maxSegments
  const segments = await db
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
    .orderBy(asc(transcriptionSegment.orderIndex))
    .limit(maxSegments);

  return {
    segments,
    totalCount,
    truncated: totalCount > maxSegments,
  };
}
