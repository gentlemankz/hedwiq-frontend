/**
 * Document Reference Functions
 *
 * Functions for saving and retrieving document references detected in meetings.
 */

import { eq, asc } from "drizzle-orm";
import { db } from "../index";
import { documentReference, document } from "../schema";
import { chunk } from "./helpers";
import { BATCH_INSERT_CHUNK_SIZE } from "./constants";
import type { DocumentReferenceInput } from "./types";

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
