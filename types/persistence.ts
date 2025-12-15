/**
 * Persistence Types for Hedwiq Frontend
 *
 * Shared types for meeting data persistence (transcription, insights, etc.)
 */

/**
 * A transcription entry to be persisted.
 * Used for passing transcription data from components to persistence layer.
 */
export interface TranscriptionEntry {
  /** Unique identifier (from LiveKit) */
  id: string;
  /** Speaker's identity */
  speakerIdentity: string;
  /** Speaker's display name */
  speakerName: string;
  /** Transcribed text content */
  text: string;
  /** Unix timestamp when this speech occurred */
  timestamp: number;
  /** Whether this is the final version (vs interim) */
  isFinal: boolean;
}
