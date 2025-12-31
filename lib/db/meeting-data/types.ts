/**
 * Meeting Data Types
 *
 * TypeScript interfaces for meeting data persistence.
 */

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
