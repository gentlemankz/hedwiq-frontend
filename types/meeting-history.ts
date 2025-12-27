/**
 * Meeting History Types for Luframe Frontend
 *
 * Types for displaying historical meeting data including
 * transcriptions, insights, document references, and notes.
 */

import type { InsightType } from "./insight";

// ============================================================================
// Session Types
// ============================================================================

/**
 * A participant session within a meeting.
 */
export interface MeetingSessionRecord {
  id: string;
  userId: string;
  userName: string;
  joinedAt: string;
  leftAt: string | null;
  durationSeconds: number | null;
  isHost: boolean;
}

// ============================================================================
// Transcription Types
// ============================================================================

/**
 * A transcription segment from a meeting.
 */
export interface TranscriptionSegmentRecord {
  id: string;
  speakerIdentity: string;
  speakerName: string;
  text: string;
  timestamp: string;
}

// ============================================================================
// Insight Types
// ============================================================================

/**
 * An insight extracted from meeting conversation.
 */
export interface InsightRecord {
  id: string;
  type: InsightType;
  content: string;
  speakerName: string | null;
  confidence: number;
  transcriptRef: string | null;
  timestamp: string;
}

// ============================================================================
// Document Reference Types
// ============================================================================

/**
 * A document reference detected during meeting.
 */
export interface DocumentReferenceRecord {
  id: string;
  documentId: string;
  documentTitle: string;
  sectionTitle: string | null;
  pageNumber: number;
  context: string;
  matchedText: string | null;
  transcriptRef: string | null;
  timestamp: string;
}

// ============================================================================
// Notes Types
// ============================================================================

/**
 * Notes created by a user during a meeting.
 */
export interface MeetingNotesRecord {
  userId: string;
  userName: string;
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
  updatedAt: string;
}

// ============================================================================
// Meeting History Types
// ============================================================================

/**
 * Statistics about a meeting.
 */
export interface MeetingStats {
  totalDurationMinutes: number;
  participantCount: number;
  transcriptionSegmentCount: number;
  insightCount: number;
  documentReferenceCount: number;
  noteCount: number;
}

/**
 * Host user information.
 */
export interface MeetingHost {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/**
 * Basic meeting info for history.
 */
export interface MeetingHistoryInfo {
  id: string;
  roomId: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  createdAt: string;
}

/**
 * Full meeting history with all related data.
 */
export interface MeetingHistoryFull {
  meeting: MeetingHistoryInfo;
  host: MeetingHost;
  sessions: MeetingSessionRecord[];
  transcription: TranscriptionSegmentRecord[];
  insights: InsightRecord[];
  documentReferences: DocumentReferenceRecord[];
  notes: MeetingNotesRecord[];
  stats: MeetingStats;
}

/**
 * Summary of a past meeting for list view.
 */
export interface MeetingHistorySummary {
  id: string;
  roomId: string;
  title: string;
  status: string;
  endedAt: string | null;
  durationMinutes: number | null;
  folderId: string | null;
  participantCount: number;
  transcriptionCount: number;
  insightCount: number;
  noteCount: number;
}

/**
 * API response for meeting history list.
 */
export interface MeetingHistoryListResponse {
  meetings: MeetingHistorySummary[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Filter options for insights in history view.
 */
export type InsightFilter = InsightType | "all";

/**
 * Filter options for transcription search.
 */
export interface TranscriptionFilter {
  speaker?: string;
  searchText?: string;
}
