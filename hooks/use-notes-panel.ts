"use client";

import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export interface UseNotesPanelOptions {
  /** Unique key for localStorage persistence (e.g., roomId) */
  storageKey: string;
  /** Debounce delay for autosave in milliseconds */
  debounceMs?: number;
  /** Initial expanded state */
  initialExpanded?: boolean;
  /** Callback when notes are saved to localStorage */
  onSave?: (notes: string) => void;
}

export interface UseNotesPanelReturn {
  /** Current notes content */
  notes: string;
  /** Set notes content (debounced save to localStorage) */
  setNotes: (value: string) => void;
  /** Whether panel is expanded */
  isExpanded: boolean;
  /** Toggle or set expanded state */
  setExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  /** Toggle expanded state */
  toggleExpanded: () => void;
  /** Clear all notes and localStorage */
  clearNotes: () => void;
  /** Whether notes have been modified since last save */
  isDirty: boolean;
  /** Force save to localStorage immediately */
  forceSave: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_PREFIX = "hedwiq-meeting-notes-";
const DEFAULT_DEBOUNCE_MS = 1000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Custom hook for managing meeting notes with localStorage persistence.
 *
 * Features:
 * - Automatic localStorage persistence with debouncing
 * - Hydration-safe (SSR compatible)
 * - Dirty state tracking
 * - Stable callback references
 *
 * @example
 * ```tsx
 * const { notes, setNotes, isExpanded, setExpanded } = useNotesPanel({
 *   storageKey: roomId,
 * });
 * ```
 */
export function useNotesPanel({
  storageKey,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  initialExpanded = false,
  onSave,
}: UseNotesPanelOptions): UseNotesPanelReturn {
  // Full storage key with prefix
  const fullStorageKey = `${STORAGE_PREFIX}${storageKey}`;

  // Hydration state to prevent SSR mismatch
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Notes state
  const [notes, setNotesInternal] = React.useState("");
  const [savedNotes, setSavedNotes] = React.useState("");

  // Expanded state
  const [isExpanded, setIsExpanded] = React.useState(initialExpanded);

  // Refs for debouncing
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const onSaveRef = React.useRef(onSave);

  // Keep onSave ref up to date
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    setIsHydrated(true);

    try {
      const stored = localStorage.getItem(fullStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.notes === "string") {
          setNotesInternal(parsed.notes);
          setSavedNotes(parsed.notes);
        }
        if (typeof parsed.isExpanded === "boolean") {
          setIsExpanded(parsed.isExpanded);
        }
      }
    } catch (error) {
      console.warn("[useNotesPanel] Failed to load from localStorage:", error);
    }
  }, [fullStorageKey]);

  // Save to localStorage (debounced)
  const saveToStorage = React.useCallback(
    (notesToSave: string, expandedState: boolean) => {
      try {
        localStorage.setItem(
          fullStorageKey,
          JSON.stringify({ notes: notesToSave, isExpanded: expandedState })
        );
        setSavedNotes(notesToSave);
        onSaveRef.current?.(notesToSave);
      } catch (error) {
        console.warn("[useNotesPanel] Failed to save to localStorage:", error);
      }
    },
    [fullStorageKey]
  );

  // Debounced save
  const debouncedSave = React.useCallback(
    (notesToSave: string, expandedState: boolean) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        saveToStorage(notesToSave, expandedState);
        debounceTimerRef.current = null;
      }, debounceMs);
    },
    [debounceMs, saveToStorage]
  );

  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Set notes with debounced save
  const setNotes = React.useCallback(
    (value: string) => {
      setNotesInternal(value);
      if (isHydrated) {
        debouncedSave(value, isExpanded);
      }
    },
    [debouncedSave, isExpanded, isHydrated]
  );

  // Set expanded with immediate save
  const setExpanded = React.useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setIsExpanded((prev) => {
        const newValue = typeof value === "function" ? value(prev) : value;
        if (isHydrated) {
          // Save expanded state immediately (no debounce)
          saveToStorage(notes, newValue);
        }
        return newValue;
      });
    },
    [isHydrated, notes, saveToStorage]
  );

  // Toggle expanded
  const toggleExpanded = React.useCallback(() => {
    setExpanded((prev) => !prev);
  }, [setExpanded]);

  // Clear notes
  const clearNotes = React.useCallback(() => {
    setNotesInternal("");
    setSavedNotes("");
    setIsExpanded(false);
    try {
      localStorage.removeItem(fullStorageKey);
    } catch (error) {
      console.warn("[useNotesPanel] Failed to clear localStorage:", error);
    }
  }, [fullStorageKey]);

  // Force immediate save
  const forceSave = React.useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    saveToStorage(notes, isExpanded);
  }, [notes, isExpanded, saveToStorage]);

  // Compute dirty state
  const isDirty = notes !== savedNotes;

  return {
    notes,
    setNotes,
    isExpanded,
    setExpanded,
    toggleExpanded,
    clearNotes,
    isDirty,
    forceSave,
  };
}
