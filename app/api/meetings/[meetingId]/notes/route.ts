import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingById } from "@/lib/db/meeting";
import {
  saveMeetingNotes,
  getMeetingNotes,
  getAllMeetingNotes,
  type NotesInput,
} from "@/lib/db/meeting-data";

/**
 * POST /api/meetings/[meetingId]/notes
 *
 * Save or update notes for the current user in this meeting.
 *
 * Body:
 * - roomId: string (required)
 * - blocks: Array of note blocks
 * - transcriptNotes: Record of transcript notes by ID
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  // Parse request body
  let body: {
    roomId?: string;
    blocks?: NotesInput["blocks"];
    transcriptNotes?: NotesInput["transcriptNotes"];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.roomId) {
    return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  }

  try {
    // Verify meeting exists
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    await saveMeetingNotes({
      meetingId,
      roomId: body.roomId,
      userId: session.user.id,
      blocks: body.blocks ?? [],
      transcriptNotes: body.transcriptNotes ?? {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save notes error:", error);
    return NextResponse.json(
      { error: "Failed to save notes" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meetings/[meetingId]/notes
 *
 * Get notes for the current user or all users (with query param).
 *
 * Query params:
 * - all: boolean - If true, returns notes from all users (for meeting history)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "true";

  try {
    // Verify meeting exists
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (all) {
      // Get all notes for the meeting (requires host access)
      if (meeting.hostId !== session.user.id) {
        return NextResponse.json(
          { error: "Only the host can view all notes" },
          { status: 403 }
        );
      }

      const allNotes = await getAllMeetingNotes(meetingId);
      return NextResponse.json({ notes: allNotes });
    } else {
      // Get notes for current user only
      const notes = await getMeetingNotes(meetingId, session.user.id);
      return NextResponse.json({
        notes: notes
          ? {
              blocks: notes.blocks,
              transcriptNotes: notes.transcriptNotes,
            }
          : null,
      });
    }
  } catch (error) {
    console.error("Get notes error:", error);
    return NextResponse.json(
      { error: "Failed to get notes" },
      { status: 500 }
    );
  }
}
