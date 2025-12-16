"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRoomContext } from "@livekit/components-react";
import type { Insight } from "@/types/insight";
import type { DocumentReference } from "@/types/document";
import type { NoteBlock, TranscriptNote } from "@/types/transcript-note";
import type { TranscriptionEntry } from "@/types/persistence";

// ============================================================================
// Types
// ============================================================================

interface MeetingPersistenceContextValue {
  /** Current session ID */
  sessionId: string | null;
  /** Whether persistence is enabled */
  isEnabled: boolean;
  /** Whether a save is in progress */
  isSaving: boolean;
  /** Last error message */
  error: string | null;
  /** Queue transcription entries for saving */
  queueTranscription: (entries: TranscriptionEntry[]) => void;
  /** Queue insights for saving */
  queueInsights: (insights: Insight[]) => void;
  /** Queue document references for saving */
  queueDocumentReferences: (references: DocumentReference[]) => void;
  /** Save notes to database */
  saveNotes: (
    blocks: NoteBlock[],
    transcriptNotes: Record<string, TranscriptNote>
  ) => void;
  /** Force save all queued data */
  forceSave: () => Promise<void>;
  /** Stats about saved data */
  stats: {
    transcriptionCount: number;
    insightCount: number;
    documentRefCount: number;
    notesSaved: boolean;
  };
}

const MeetingPersistenceContext =
  createContext<MeetingPersistenceContextValue | null>(null);

// ============================================================================
// Constants
// ============================================================================

const SAVE_INTERVAL = 30000; // 30 seconds
const NOTES_DEBOUNCE = 5000; // 5 seconds debounce for notes

// ============================================================================
// Provider
// ============================================================================

interface MeetingPersistenceProviderProps {
  children: React.ReactNode;
  /** Meeting ID (from database) */
  meetingId: string | null;
  /** Room ID */
  roomId: string;
  /** Whether to enable persistence */
  enabled?: boolean;
}

/**
 * Provider that manages persisting meeting data to the database.
 *
 * Handles:
 * - Session tracking (join/leave)
 * - Periodic batch saves of transcription, insights, document references
 * - Debounced note saves
 */
export function MeetingPersistenceProvider({
  children,
  meetingId,
  roomId,
  enabled = true,
}: MeetingPersistenceProviderProps) {
  const room = useRoomContext();

  // State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    transcriptionCount: 0,
    insightCount: 0,
    documentRefCount: 0,
    notesSaved: false,
  });

  // Queues (using refs to avoid re-renders)
  const transcriptionQueueRef = useRef<Map<string, TranscriptionEntry>>(
    new Map()
  );
  const insightQueueRef = useRef<Map<string, Insight>>(new Map());
  const documentRefQueueRef = useRef<Map<string, DocumentReference>>(new Map());

  // Track saved IDs to avoid duplicates
  const savedIdsRef = useRef({
    transcription: new Set<string>(),
    insights: new Set<string>(),
    documentRefs: new Set<string>(),
  });

  // Notes save state
  const pendingNotesRef = useRef<{
    blocks: NoteBlock[];
    transcriptNotes: Record<string, TranscriptNote>;
  } | null>(null);
  const notesDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mounted state
  const isMountedRef = useRef(true);

  // Refs for cleanup (avoid stale closures)
  const saveDataRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const saveNotesInternalRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const isEnabledRef = useRef(false);
  const meetingIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Determine if persistence should be active
  const isEnabled = enabled && !!meetingId && !!room;

  // Update refs when values change (for cleanup access)
  useEffect(() => {
    isEnabledRef.current = isEnabled;
    meetingIdRef.current = meetingId;
  }, [isEnabled, meetingId]);

  /**
   * Start session when component mounts (if enabled)
   */
  useEffect(() => {
    if (!isEnabled || !meetingId) return;

    let cancelled = false;

    const startSession = async () => {
      try {
        const response = await fetch(`/api/meetings/${meetingId}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to start session");
        }

        const data = await response.json();
        if (!cancelled && isMountedRef.current) {
          setSessionId(data.sessionId);
          console.log("[Persistence] Session started:", data.sessionId);
        }
      } catch (err) {
        console.error("[Persistence] Failed to start session:", err);
        if (!cancelled && isMountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to start session"
          );
        }
      }
    };

    startSession();

    return () => {
      cancelled = true;
    };
  }, [isEnabled, meetingId, roomId]);

  /**
   * End session on unmount
   */
  useEffect(() => {
    return () => {
      if (sessionId && meetingId) {
        // Fire and forget - don't block unmount
        fetch(`/api/meetings/${meetingId}/session`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }).catch((err) => {
          console.error("[Persistence] Failed to end session:", err);
        });
      }
    };
  }, [sessionId, meetingId]);

  /**
   * Internal save function
   */
  const saveData = useCallback(async () => {
    if (!isEnabled || !meetingId) return;

    // Get data from queues
    const transcription = Array.from(
      transcriptionQueueRef.current.values()
    ).filter((t) => !savedIdsRef.current.transcription.has(t.id));
    const insights = Array.from(insightQueueRef.current.values()).filter(
      (i) => !savedIdsRef.current.insights.has(i.id)
    );
    const documentRefs = Array.from(
      documentRefQueueRef.current.values()
    ).filter((r) => !savedIdsRef.current.documentRefs.has(r.id));

    // Skip if nothing to save
    if (
      transcription.length === 0 &&
      insights.length === 0 &&
      documentRefs.length === 0
    ) {
      return;
    }

    if (isMountedRef.current) {
      setIsSaving(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/meetings/${meetingId}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          transcription: transcription.map((t, index) => ({
            id: t.id,
            speakerIdentity: t.speakerIdentity,
            speakerName: t.speakerName,
            text: t.text,
            timestamp: t.timestamp,
            orderIndex: savedIdsRef.current.transcription.size + index,
            isFinal: t.isFinal,
          })),
          insights: insights.map((i) => ({
            id: i.id,
            type: i.type,
            content: i.content,
            speakerIdentity: i.speaker,
            speakerName: i.speakerName,
            confidence: i.confidence,
            transcriptRef: i.transcriptRef,
            timestamp: i.timestamp,
          })),
          documentReferences: documentRefs.map((r) => ({
            id: r.id,
            documentId: r.documentId,
            sectionId: r.sectionId,
            pageNumber: r.pageNumber,
            sectionTitle: r.sectionTitle,
            matchedText: r.matchedText,
            bbox: r.bbox,
            context: r.context,
            confidence: r.confidence,
            transcriptRef: r.transcriptRef,
            timestamp: r.timestamp,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save meeting data");
      }

      // Mark as saved
      for (const t of transcription) {
        savedIdsRef.current.transcription.add(t.id);
        transcriptionQueueRef.current.delete(t.id);
      }
      for (const i of insights) {
        savedIdsRef.current.insights.add(i.id);
        insightQueueRef.current.delete(i.id);
      }
      for (const r of documentRefs) {
        savedIdsRef.current.documentRefs.add(r.id);
        documentRefQueueRef.current.delete(r.id);
      }

      // Update stats
      if (isMountedRef.current) {
        setStats((prev) => ({
          ...prev,
          transcriptionCount: savedIdsRef.current.transcription.size,
          insightCount: savedIdsRef.current.insights.size,
          documentRefCount: savedIdsRef.current.documentRefs.size,
        }));
      }

      console.log(
        `[Persistence] Saved: ${transcription.length} transcripts, ${insights.length} insights, ${documentRefs.length} refs`
      );
    } catch (err) {
      console.error("[Persistence] Save failed:", err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [isEnabled, meetingId, roomId]);

  // Keep ref updated for cleanup access
  useEffect(() => {
    saveDataRef.current = saveData;
  }, [saveData]);

  /**
   * Internal notes save function
   */
  const saveNotesInternal = useCallback(async () => {
    if (!isEnabled || !meetingId || !pendingNotesRef.current) return;

    const { blocks, transcriptNotes } = pendingNotesRef.current;
    pendingNotesRef.current = null;

    try {
      const response = await fetch(`/api/meetings/${meetingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          blocks,
          transcriptNotes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save notes");
      }

      if (isMountedRef.current) {
        setStats((prev) => ({ ...prev, notesSaved: true }));
      }

      console.log("[Persistence] Notes saved");
    } catch (err) {
      console.error("[Persistence] Notes save failed:", err);
    }
  }, [isEnabled, meetingId, roomId]);

  // Keep ref updated for cleanup access
  useEffect(() => {
    saveNotesInternalRef.current = saveNotesInternal;
  }, [saveNotesInternal]);

  /**
   * Queue transcription entries
   */
  const queueTranscription = useCallback(
    (entries: TranscriptionEntry[]) => {
      if (!isEnabled) return;

      for (const entry of entries) {
        if (entry.isFinal && !savedIdsRef.current.transcription.has(entry.id)) {
          transcriptionQueueRef.current.set(entry.id, entry);
        }
      }
    },
    [isEnabled]
  );

  /**
   * Queue insights
   */
  const queueInsights = useCallback(
    (insights: Insight[]) => {
      if (!isEnabled) return;

      for (const insight of insights) {
        if (!savedIdsRef.current.insights.has(insight.id)) {
          insightQueueRef.current.set(insight.id, insight);
        }
      }
    },
    [isEnabled]
  );

  /**
   * Queue document references
   */
  const queueDocumentReferences = useCallback(
    (references: DocumentReference[]) => {
      if (!isEnabled) return;

      for (const ref of references) {
        if (!savedIdsRef.current.documentRefs.has(ref.id)) {
          documentRefQueueRef.current.set(ref.id, ref);
        }
      }
    },
    [isEnabled]
  );

  /**
   * Save notes (debounced)
   */
  const saveNotes = useCallback(
    (blocks: NoteBlock[], transcriptNotes: Record<string, TranscriptNote>) => {
      if (!isEnabled) return;

      // Store pending notes
      pendingNotesRef.current = { blocks, transcriptNotes };

      // Clear existing timer
      if (notesDebounceTimerRef.current) {
        clearTimeout(notesDebounceTimerRef.current);
      }

      // Set new timer
      notesDebounceTimerRef.current = setTimeout(() => {
        saveNotesInternal();
      }, NOTES_DEBOUNCE);
    },
    [isEnabled, saveNotesInternal]
  );

  /**
   * Force save all queued data
   */
  const forceSave = useCallback(async () => {
    // Save queued data
    await saveData();

    // Save pending notes immediately
    if (notesDebounceTimerRef.current) {
      clearTimeout(notesDebounceTimerRef.current);
      notesDebounceTimerRef.current = null;
    }
    if (pendingNotesRef.current) {
      await saveNotesInternal();
    }
  }, [saveData, saveNotesInternal]);

  // Periodic save
  useEffect(() => {
    if (!isEnabled || !sessionId) return;

    const intervalId = setInterval(saveData, SAVE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isEnabled, sessionId, saveData]);

  // Save on unmount - use refs to avoid stale closures
  useEffect(() => {
    return () => {
      // Clear notes timer
      if (notesDebounceTimerRef.current) {
        clearTimeout(notesDebounceTimerRef.current);
      }

      // Fire and forget final save using refs for latest values
      if (isEnabledRef.current && meetingIdRef.current) {
        saveDataRef.current?.().catch(console.error);
        if (pendingNotesRef.current) {
          saveNotesInternalRef.current?.().catch(console.error);
        }
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      sessionId,
      isEnabled,
      isSaving,
      error,
      queueTranscription,
      queueInsights,
      queueDocumentReferences,
      saveNotes,
      forceSave,
      stats,
    }),
    [
      sessionId,
      isEnabled,
      isSaving,
      error,
      queueTranscription,
      queueInsights,
      queueDocumentReferences,
      saveNotes,
      forceSave,
      stats,
    ]
  );

  return (
    <MeetingPersistenceContext.Provider value={value}>
      {children}
    </MeetingPersistenceContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access meeting persistence context.
 * Returns null if used outside provider (persistence is optional).
 */
export function useMeetingPersistence(): MeetingPersistenceContextValue | null {
  return useContext(MeetingPersistenceContext);
}

/**
 * Hook to access meeting persistence context.
 * Throws if used outside provider.
 */
export function useMeetingPersistenceRequired(): MeetingPersistenceContextValue {
  const context = useContext(MeetingPersistenceContext);
  if (!context) {
    throw new Error(
      "useMeetingPersistenceRequired must be used within MeetingPersistenceProvider"
    );
  }
  return context;
}
