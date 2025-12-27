/**
 * Transcript Note Types for Luframe Frontend
 *
 * These types support the feature that connects transcription entries
 * with user-created notes, allowing users to reference specific speech
 * segments in their meeting notes.
 */

/**
 * Represents the original transcription entry that a note references.
 */
export interface TranscriptReference {
  /** Transcript segment ID (from LiveKit) */
  transcriptId: string;
  /** Speaker's identity */
  participantIdentity: string;
  /** Speaker's display name */
  participantName: string;
  /** The speech text that inspired the note */
  transcriptText: string;
  /** Unix timestamp when the speech occurred */
  transcriptTimestamp: number;
}

/**
 * A note created by the user that references a specific transcription entry.
 */
export interface TranscriptNote {
  /** Unique identifier for this note */
  id: string;
  /** User's note content */
  content: string;
  /** Reference to the original transcription */
  reference: TranscriptReference;
  /** Unix timestamp when the note was created */
  createdAt: number;
  /** Unix timestamp when the note was last updated */
  updatedAt: number;
}

/**
 * Input type for creating a new transcript note.
 */
export interface CreateTranscriptNoteInput {
  /** User's note content */
  content: string;
  /** Reference to the original transcription */
  reference: TranscriptReference;
}

/**
 * Input type for updating an existing transcript note.
 */
export interface UpdateTranscriptNoteInput {
  /** Note ID to update */
  id: string;
  /** Updated note content */
  content: string;
}

// ============================================================================
// Block-based Notes System
// ============================================================================

/**
 * A text block containing user-written content.
 */
export interface TextBlock {
  type: "text";
  /** Unique identifier for this block */
  id: string;
  /** Text content */
  content: string;
  /** Unix timestamp when created */
  createdAt: number;
  /** Unix timestamp when last updated */
  updatedAt: number;
}

/**
 * A transcript reference block that links to a TranscriptNote.
 */
export interface TranscriptBlock {
  type: "transcript";
  /** Unique identifier for this block */
  id: string;
  /** ID of the TranscriptNote this block references */
  transcriptNoteId: string;
  /** Unix timestamp when created (same as the TranscriptNote) */
  createdAt: number;
}

/**
 * A note block can be either text or a transcript reference.
 */
export type NoteBlock = TextBlock | TranscriptBlock;

/**
 * Storage format for the block-based notes system.
 */
export interface NotesStorage {
  /** Ordered array of note blocks */
  blocks: NoteBlock[];
  /** Map of transcript notes by ID */
  transcriptNotes: Record<string, TranscriptNote>;
  /** Storage version for migrations */
  version: number;
}

/** Current storage version for migrations */
export const NOTES_STORAGE_VERSION = 2;

// ============================================================================
// Legacy Types (for migration)
// ============================================================================

/**
 * Legacy storage format for transcript notes (version 1).
 * @deprecated Use NotesStorage instead
 */
export interface LegacyTranscriptNotesStorage {
  /** Array of transcript notes */
  notes: TranscriptNote[];
  /** Version number for migration support */
  version: number;
}

/** Legacy storage version */
export const TRANSCRIPT_NOTES_STORAGE_VERSION = 1;

// ============================================================================
// Prop Groupings (for cleaner component interfaces)
// ============================================================================

/**
 * Grouped props for block-based notes functionality.
 * Use this to reduce prop drilling when passing notes state/handlers.
 */
export interface BlockNotesProps {
  /** Ordered array of note blocks */
  blocks: NoteBlock[];
  /** Map of transcript notes by ID */
  transcriptNotes: Record<string, TranscriptNote>;
  /** Add a new text block */
  onAddTextBlock?: (content: string, afterBlockId?: string) => void;
  /** Update a text block */
  onUpdateTextBlock?: (id: string, content: string) => void;
  /** Delete a block */
  onDeleteBlock?: (id: string) => void;
  /** Move a block to a new position */
  onMoveBlock?: (blockId: string, newIndex: number) => void;
  /** Update a transcript note */
  onUpdateTranscriptNote?: (id: string, content: string) => void;
  /** Delete a transcript note */
  onDeleteTranscriptNote?: (id: string) => void;
}
