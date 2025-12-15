import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingById, isMeetingHost } from "@/lib/db/meeting";
import { isRoomParticipant } from "@/lib/db/room-access";
import {
  saveTranscriptionSegments,
  saveInsights,
  saveDocumentReferences,
  getMeetingTranscription,
  getMeetingInsights,
  getMeetingDocumentReferences,
  type TranscriptionInput,
  type InsightInput,
  type DocumentReferenceInput,
} from "@/lib/db/meeting-data";

/**
 * POST /api/meetings/[meetingId]/data
 *
 * Bulk save meeting data (transcription, insights, document references).
 * Called periodically during the meeting to persist data.
 *
 * Body:
 * - roomId: string (required)
 * - transcription?: Array of transcription segments
 * - insights?: Array of insights
 * - documentReferences?: Array of document references
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
    transcription?: Array<{
      id: string;
      speakerIdentity: string;
      speakerName: string;
      text: string;
      timestamp: number;
      orderIndex: number;
      isFinal?: boolean;
    }>;
    insights?: Array<{
      id: string;
      type: string;
      content: string;
      speakerIdentity?: string;
      speakerName?: string;
      confidence: number;
      transcriptRef?: string;
      timestamp: number;
    }>;
    documentReferences?: Array<{
      id: string;
      documentId: string;
      sectionId: string;
      pageNumber: number;
      sectionTitle?: string;
      matchedText?: string;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
      context: string;
      confidence: number;
      transcriptRef?: string;
      timestamp: number;
    }>;
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

    // Verify user has access (is host or participant)
    const isHost = await isMeetingHost(meetingId, session.user.id);
    const isParticipant = await isRoomParticipant(session.user.id, body.roomId);
    if (!isHost && !isParticipant) {
      return NextResponse.json(
        { error: "You don't have access to this meeting" },
        { status: 403 }
      );
    }

    const results = {
      transcriptionSaved: 0,
      insightsSaved: 0,
      documentReferencesSaved: 0,
    };

    // Save transcription segments
    if (body.transcription && body.transcription.length > 0) {
      const transcriptionInputs: TranscriptionInput[] = body.transcription.map(
        (t, index) => ({
          id: t.id,
          meetingId,
          roomId: body.roomId!,
          speakerIdentity: t.speakerIdentity,
          speakerName: t.speakerName,
          text: t.text,
          timestamp: new Date(t.timestamp),
          orderIndex: t.orderIndex ?? index,
          isFinal: t.isFinal ?? true,
        })
      );

      await saveTranscriptionSegments(transcriptionInputs);
      results.transcriptionSaved = transcriptionInputs.length;
    }

    // Save insights
    if (body.insights && body.insights.length > 0) {
      const insightInputs: InsightInput[] = body.insights.map((i) => ({
        id: i.id,
        meetingId,
        roomId: body.roomId!,
        type: i.type,
        content: i.content,
        speakerIdentity: i.speakerIdentity,
        speakerName: i.speakerName,
        confidence: i.confidence,
        transcriptRef: i.transcriptRef,
        timestamp: new Date(i.timestamp),
      }));

      await saveInsights(insightInputs);
      results.insightsSaved = insightInputs.length;
    }

    // Save document references
    if (body.documentReferences && body.documentReferences.length > 0) {
      const refInputs: DocumentReferenceInput[] = body.documentReferences.map(
        (r) => ({
          id: r.id,
          meetingId,
          roomId: body.roomId!,
          documentId: r.documentId,
          sectionId: r.sectionId,
          pageNumber: r.pageNumber,
          sectionTitle: r.sectionTitle,
          matchedText: r.matchedText,
          bbox: r.bbox,
          context: r.context,
          confidence: r.confidence,
          transcriptRef: r.transcriptRef,
          timestamp: new Date(r.timestamp),
        })
      );

      await saveDocumentReferences(refInputs);
      results.documentReferencesSaved = refInputs.length;
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Save meeting data error:", error);
    return NextResponse.json(
      { error: "Failed to save meeting data" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meetings/[meetingId]/data
 *
 * Get all meeting data (transcription, insights, document references).
 * Used for loading historical meeting data.
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

  try {
    // Verify meeting exists
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Get all meeting data in parallel
    const [transcription, insights, documentReferences] = await Promise.all([
      getMeetingTranscription(meetingId),
      getMeetingInsights(meetingId),
      getMeetingDocumentReferences(meetingId),
    ]);

    return NextResponse.json({
      transcription,
      insights,
      documentReferences,
    });
  } catch (error) {
    console.error("Get meeting data error:", error);
    return NextResponse.json(
      { error: "Failed to get meeting data" },
      { status: 500 }
    );
  }
}
