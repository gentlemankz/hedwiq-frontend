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

// ============================================================================
// Types
// ============================================================================

export type {
  CreateSessionInput,
  TranscriptionInput,
  InsightInput,
  DocumentReferenceInput,
  NotesInput,
  MeetingHistoryData,
} from "./types";

// ============================================================================
// Session Functions
// ============================================================================

export {
  countActiveSessionsForUser,
  getTotalReservedMinutes,
  createMeetingSession,
  endMeetingSession,
  getActiveSession,
  validateSessionOwnership,
  checkUsageReportStatus,
  markUsageReported,
} from "./sessions";

// ============================================================================
// Transcription Functions
// ============================================================================

export {
  saveTranscriptionSegments,
  getMeetingTranscription,
  getMeetingTranscriptionLimited,
} from "./transcription";

// ============================================================================
// Insight Functions
// ============================================================================

export {
  saveInsights,
  getMeetingInsights,
} from "./insights";

// ============================================================================
// Document Reference Functions
// ============================================================================

export {
  saveDocumentReferences,
  getMeetingDocumentReferences,
} from "./document-references";

// ============================================================================
// Notes Functions
// ============================================================================

export {
  saveMeetingNotes,
  getMeetingNotes,
  getAllMeetingNotes,
} from "./notes";

// ============================================================================
// Meeting History Functions
// ============================================================================

export {
  getMeetingHistory,
  getUserMeetingHistory,
  getMeetingByRoomId,
} from "./history";
