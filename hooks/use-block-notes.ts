"use client";

import * as React from "react";
import type {
  NoteBlock,
  TextBlock,
  TranscriptBlock,
  TranscriptNote,
  TranscriptReference,
  NotesStorage,
} from "@/types/transcript-note";
import { NOTES_STORAGE_VERSION } from "@/types/transcript-note";

// ============================================================================
// Types
// ============================================================================

export interface UseBlockNotesOptions {
  /** Unique key for localStorage persistence (e.g., roomId) */
  storageKey: string;
  /** Debounce delay for autosave in milliseconds */
  debounceMs?: number;
  /** Callback when notes are saved */
  onSave?: (storage: NotesStorage) => void;
}

export interface UseBlockNotesReturn {
  /** Ordered array of note blocks */
  blocks: NoteBlock[];
  /** Map of transcript notes by ID */
  transcriptNotes: Record<string, TranscriptNote>;
  /** Add a text block */
  addTextBlock: (content: string, afterBlockId?: string) => TextBlock;
  /** Update a text block's content */
  updateTextBlock: (id: string, content: string) => void;
  /** Delete a block by ID */
  deleteBlock: (id: string) => void;
  /** Add a transcript note (creates both TranscriptNote and TranscriptBlock) */
  addTranscriptNote: (reference: TranscriptReference, content: string) => TranscriptNote;
  /** Update a transcript note's content */
  updateTranscriptNote: (id: string, content: string) => void;
  /** Delete a transcript note (and its block) */
  deleteTranscriptNote: (id: string) => void;
  /** Get a transcript note by ID */
  getTranscriptNote: (id: string) => TranscriptNote | undefined;
  /** Check if a transcript has notes */
  hasNotesForTranscript: (transcriptId: string) => boolean;
  /** Move a block to a new position */
  moveBlock: (blockId: string, newIndex: number) => void;
  /** Clear all notes */
  clearAll: () => void;
  /** Force save to localStorage immediately */
  forceSave: () => void;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Total block count */
  blockCount: number;
  /** Transcript note count */
  transcriptNoteCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_PREFIX = "hedwiq-block-notes-";
const DEFAULT_DEBOUNCE_MS = 500;

// ============================================================================
// Utilities
// ============================================================================

/** Generate a unique ID using crypto for better randomness */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomPart = typeof crypto !== "undefined" && crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(36).padStart(2, "0"))
        .join("")
        .slice(0, 8)
    : Math.random().toString(36).substring(2, 10);
  return `${prefix}-${timestamp}-${randomPart}`;
}

/** Parse storage data with migration support */
function parseStorage(data: string): NotesStorage | null {
  try {
    const parsed = JSON.parse(data);

    // Handle version 2 format (current)
    if (parsed && parsed.version === 2) {
      return parsed as NotesStorage;
    }

    // Handle version 1 format (legacy transcript notes)
    if (parsed && parsed.version === 1 && Array.isArray(parsed.notes)) {
      // Migrate from legacy format
      const transcriptNotes: Record<string, TranscriptNote> = {};
      const blocks: NoteBlock[] = [];

      for (const note of parsed.notes) {
        transcriptNotes[note.id] = note;
        blocks.push({
          type: "transcript",
          id: generateId("block"),
          transcriptNoteId: note.id,
          createdAt: note.createdAt,
        });
      }

      // Sort blocks by creation time
      blocks.sort((a, b) => a.createdAt - b.createdAt);

      return {
        blocks,
        transcriptNotes,
        version: NOTES_STORAGE_VERSION,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/** Migrate legacy notes (from useNotesPanel) into a text block */
function migrateLegacyNotes(legacyKey: string): TextBlock | null {
  try {
    const stored = localStorage.getItem(legacyKey);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed.notes === "string" && parsed.notes.trim()) {
      return {
        type: "text",
        id: generateId("text"),
        content: parsed.notes,
        createdAt: Date.now() - 1000, // Slightly older so it appears first
        updatedAt: Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Custom hook for managing block-based notes with localStorage persistence.
 *
 * Features:
 * - Block-based architecture (text blocks + transcript reference blocks)
 * - Automatic localStorage persistence with debouncing
 * - Migration from legacy formats
 * - Hydration-safe (SSR compatible)
 *
 * @example
 * ```tsx
 * const {
 *   blocks,
 *   transcriptNotes,
 *   addTextBlock,
 *   addTranscriptNote,
 * } = useBlockNotes({ storageKey: roomId });
 * ```
 */
export function useBlockNotes({
  storageKey,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onSave,
}: UseBlockNotesOptions): UseBlockNotesReturn {
  // Storage keys
  const fullStorageKey = `${STORAGE_PREFIX}${storageKey}`;
  const legacyTranscriptKey = `hedwiq-transcript-notes-${storageKey}`;
  const legacyNotesKey = `hedwiq-meeting-notes-${storageKey}`;

  // Hydration state
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Notes state
  const [blocks, setBlocks] = React.useState<NoteBlock[]>([]);
  const [transcriptNotes, setTranscriptNotes] = React.useState<Record<string, TranscriptNote>>({});
  const [savedState, setSavedState] = React.useState<string>("");

  // Refs for stable access to current state in callbacks
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingTimersRef = React.useRef<Set<NodeJS.Timeout>>(new Set());
  const isMountedRef = React.useRef(true);
  const onSaveRef = React.useRef(onSave);
  const blocksRef = React.useRef(blocks);
  const transcriptNotesRef = React.useRef(transcriptNotes);

  // Keep refs in sync with state
  React.useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  React.useEffect(() => {
    transcriptNotesRef.current = transcriptNotes;
  }, [transcriptNotes]);

  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Track mounted state to prevent state updates after unmount
  React.useEffect(() => {
    isMountedRef.current = true;
    // Capture ref value for cleanup
    const pendingTimers = pendingTimersRef.current;
    return () => {
      isMountedRef.current = false;
      // Clear all pending timers on unmount
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
    };
  }, []);

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    setIsHydrated(true);

    try {
      // Try to load from new storage format first
      const stored = localStorage.getItem(fullStorageKey);
      if (stored) {
        const parsed = parseStorage(stored);
        if (parsed) {
          setBlocks(parsed.blocks);
          setTranscriptNotes(parsed.transcriptNotes);
          setSavedState(JSON.stringify(parsed));
          return;
        }
      }

      // Try to migrate from legacy transcript notes storage
      const legacyTranscript = localStorage.getItem(legacyTranscriptKey);
      if (legacyTranscript) {
        const parsed = parseStorage(legacyTranscript);
        if (parsed) {
          // Also try to migrate legacy text notes
          const legacyTextBlock = migrateLegacyNotes(legacyNotesKey);
          if (legacyTextBlock) {
            parsed.blocks.unshift(legacyTextBlock);
          }

          setBlocks(parsed.blocks);
          setTranscriptNotes(parsed.transcriptNotes);
          setSavedState(JSON.stringify(parsed));

          // Save to new format
          localStorage.setItem(fullStorageKey, JSON.stringify(parsed));
          return;
        }
      }

      // Try to migrate legacy text notes only
      const legacyTextBlock = migrateLegacyNotes(legacyNotesKey);
      if (legacyTextBlock) {
        const newStorage: NotesStorage = {
          blocks: [legacyTextBlock],
          transcriptNotes: {},
          version: NOTES_STORAGE_VERSION,
        };
        setBlocks(newStorage.blocks);
        setTranscriptNotes(newStorage.transcriptNotes);
        setSavedState(JSON.stringify(newStorage));

        // Save to new format
        localStorage.setItem(fullStorageKey, JSON.stringify(newStorage));
      }
    } catch (error) {
      console.warn("[useBlockNotes] Failed to load from localStorage:", error);
    }
  }, [fullStorageKey, legacyTranscriptKey, legacyNotesKey]);

  // Save to localStorage
  const saveToStorage = React.useCallback(
    (blocksToSave: NoteBlock[], notesToSave: Record<string, TranscriptNote>) => {
      if (!isHydrated) return;

      try {
        const storage: NotesStorage = {
          blocks: blocksToSave,
          transcriptNotes: notesToSave,
          version: NOTES_STORAGE_VERSION,
        };
        const serialized = JSON.stringify(storage);
        localStorage.setItem(fullStorageKey, serialized);
        setSavedState(serialized);
        onSaveRef.current?.(storage);
      } catch (error) {
        console.warn("[useBlockNotes] Failed to save to localStorage:", error);
      }
    },
    [fullStorageKey, isHydrated]
  );

  // Debounced save - uses refs to get current state to avoid stale closures
  const debouncedSave = React.useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      // Use refs to get current state values
      saveToStorage(blocksRef.current, transcriptNotesRef.current);
      debounceTimerRef.current = null;
    }, debounceMs);
  }, [debounceMs, saveToStorage]);

  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Add a text block
  const addTextBlock = React.useCallback(
    (content: string, afterBlockId?: string): TextBlock => {
      const now = Date.now();
      const newBlock: TextBlock = {
        type: "text",
        id: generateId("text"),
        content,
        createdAt: now,
        updatedAt: now,
      };

      setBlocks((prev) => {
        let updated: NoteBlock[];
        if (afterBlockId) {
          const index = prev.findIndex((b) => b.id === afterBlockId);
          if (index !== -1) {
            updated = [...prev.slice(0, index + 1), newBlock, ...prev.slice(index + 1)];
          } else {
            updated = [...prev, newBlock];
          }
        } else {
          updated = [...prev, newBlock];
        }
        return updated;
      });

      // Schedule save after state update
      debouncedSave();

      return newBlock;
    },
    [debouncedSave]
  );

  // Update a text block
  const updateTextBlock = React.useCallback(
    (id: string, content: string) => {
      setBlocks((prev) => {
        const updated = prev.map((block) =>
          block.type === "text" && block.id === id
            ? { ...block, content, updatedAt: Date.now() }
            : block
        );
        return updated;
      });
      debouncedSave();
    },
    [debouncedSave]
  );

  // Delete a block
  const deleteBlock = React.useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const block = prev.find((b) => b.id === id);

        // If it's a transcript block, also delete the transcript note
        if (block?.type === "transcript") {
          setTranscriptNotes((prevNotes) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [block.transcriptNoteId]: _removed, ...rest } = prevNotes;
            return rest;
          });
        }

        return prev.filter((b) => b.id !== id);
      });
      debouncedSave();
    },
    [debouncedSave]
  );

  // Track pending additions to prevent duplicates in StrictMode
  const pendingAdditionsRef = React.useRef<Set<string>>(new Set());

  // Add a transcript note
  const addTranscriptNote = React.useCallback(
    (reference: TranscriptReference, content: string): TranscriptNote => {
      // Create a unique key for this specific addition
      const additionKey = `${reference.transcriptId}-${reference.transcriptTimestamp}-${content}`;

      // Check if we're already adding this exact note (StrictMode guard)
      if (pendingAdditionsRef.current.has(additionKey)) {
        // Return a stub - the actual note will be created by the first call
        return {
          id: generateId("tnote"),
          content,
          reference,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      // Mark this addition as pending
      pendingAdditionsRef.current.add(additionKey);

      // Clear the pending flag after the state updates complete - with proper cleanup
      const timer = setTimeout(() => {
        pendingAdditionsRef.current.delete(additionKey);
        pendingTimersRef.current.delete(timer);
      }, 50);
      pendingTimersRef.current.add(timer);

      const now = Date.now();
      const noteId = generateId("tnote");
      const blockId = generateId("block");

      const newNote: TranscriptNote = {
        id: noteId,
        content,
        reference,
        createdAt: now,
        updatedAt: now,
      };

      const newBlock: TranscriptBlock = {
        type: "transcript",
        id: blockId,
        transcriptNoteId: noteId,
        createdAt: now,
      };

      // Update states (React will batch these)
      setTranscriptNotes((prev) => ({ ...prev, [noteId]: newNote }));
      setBlocks((prevBlocks) => [...prevBlocks, newBlock]);

      // Schedule save - debouncedSave reads from refs so no need for complex patterns
      debouncedSave();

      return newNote;
    },
    [debouncedSave]
  );

  // Update a transcript note
  const updateTranscriptNote = React.useCallback(
    (id: string, content: string) => {
      setTranscriptNotes((prev) => {
        if (!prev[id]) return prev;
        return {
          ...prev,
          [id]: { ...prev[id], content, updatedAt: Date.now() },
        };
      });
      debouncedSave();
    },
    [debouncedSave]
  );

  // Delete a transcript note
  const deleteTranscriptNote = React.useCallback(
    (id: string) => {
      setTranscriptNotes((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      setBlocks((prevBlocks) =>
        prevBlocks.filter(
          (b) => !(b.type === "transcript" && b.transcriptNoteId === id)
        )
      );
      debouncedSave();
    },
    [debouncedSave]
  );

  // Get a transcript note by ID
  const getTranscriptNote = React.useCallback(
    (id: string): TranscriptNote | undefined => {
      return transcriptNotes[id];
    },
    [transcriptNotes]
  );

  // Check if a transcript has notes
  const hasNotesForTranscript = React.useCallback(
    (transcriptId: string): boolean => {
      return Object.values(transcriptNotes).some(
        (note) => note.reference.transcriptId === transcriptId
      );
    },
    [transcriptNotes]
  );

  // Move a block to a new position
  const moveBlock = React.useCallback(
    (blockId: string, newIndex: number) => {
      setBlocks((prev) => {
        const currentIndex = prev.findIndex((b) => b.id === blockId);
        // Validate: block exists, index changed, and new index is in bounds
        if (
          currentIndex === -1 ||
          currentIndex === newIndex ||
          newIndex < 0 ||
          newIndex >= prev.length
        ) {
          return prev;
        }

        const updated = [...prev];
        const [removed] = updated.splice(currentIndex, 1);
        updated.splice(newIndex, 0, removed);
        return updated;
      });
      debouncedSave();
    },
    [debouncedSave]
  );

  // Clear all notes
  const clearAll = React.useCallback(() => {
    setBlocks([]);
    setTranscriptNotes({});
    setSavedState("");
    try {
      localStorage.removeItem(fullStorageKey);
    } catch (error) {
      console.warn("[useBlockNotes] Failed to clear localStorage:", error);
    }
  }, [fullStorageKey]);

  // Force immediate save
  const forceSave = React.useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Use refs for current state
    saveToStorage(blocksRef.current, transcriptNotesRef.current);
  }, [saveToStorage]);

  // Compute dirty state - memoized to avoid JSON.stringify on every render
  const isDirty = React.useMemo(() => {
    const currentState = JSON.stringify({ blocks, transcriptNotes, version: NOTES_STORAGE_VERSION });
    return currentState !== savedState;
  }, [blocks, transcriptNotes, savedState]);

  return {
    blocks,
    transcriptNotes,
    addTextBlock,
    updateTextBlock,
    deleteBlock,
    addTranscriptNote,
    updateTranscriptNote,
    deleteTranscriptNote,
    getTranscriptNote,
    hasNotesForTranscript,
    moveBlock,
    clearAll,
    forceSave,
    isDirty,
    blockCount: blocks.length,
    transcriptNoteCount: Object.keys(transcriptNotes).length,
  };
}
