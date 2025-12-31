/**
 * Insight Functions
 *
 * Functions for saving and retrieving AI-detected meeting insights.
 */

import { eq, asc } from "drizzle-orm";
import { db } from "../index";
import { meetingInsight } from "../schema";
import { chunk } from "./helpers";
import { BATCH_INSERT_CHUNK_SIZE } from "./constants";
import type { InsightInput } from "./types";

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
