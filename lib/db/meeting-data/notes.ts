/**
 * Notes Functions
 *
 * Functions for saving and retrieving user notes created during meetings.
 */

import { eq, and, asc } from "drizzle-orm";
import { db } from "../index";
import { meetingNote, user } from "../schema";
import { generateId } from "./helpers";
import type { NotesInput } from "./types";

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
