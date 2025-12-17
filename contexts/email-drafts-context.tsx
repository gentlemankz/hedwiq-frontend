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
import { useSession } from "@/lib/auth-client";
import type {
  EmailDraft,
  DraftStatus,
  EmailDraftEdits,
} from "@/types/email-draft";
import {
  MAX_DRAFTS,
  parseDraftStatus,
  normalizeDraftTimestamp,
  normalizeDraftConfidence,
  parseEmailRecipients,
  parseMeetingContext,
  isNonEmptyDraftString,
} from "@/types/email-draft";

/** LiveKit topic for email drafts from the Hedwiq agent */
const EMAIL_DRAFT_TOPIC = "hedwiq.email_draft";

/**
 * Interface for the text stream reader from LiveKit
 */
interface TextStreamReader {
  info: {
    id: string;
    timestamp?: number;
    attributes?: Record<string, string>;
  };
  readAll: () => Promise<string>;
}

/**
 * Interface for participant info from LiveKit
 */
interface ParticipantInfo {
  identity: string;
}

/**
 * Context value for email drafts
 */
interface EmailDraftsContextValue {
  /** All email drafts, sorted by timestamp (newest first) */
  drafts: EmailDraft[];
  /** Drafts that are ready to send (ready or edited status) */
  pendingDrafts: EmailDraft[];
  /** Drafts grouped by status */
  draftsByStatus: Partial<Record<DraftStatus, EmailDraft[]>>;
  /** Total count of drafts */
  draftCount: number;
  /** Count of pending drafts (ready + edited) */
  pendingCount: number;
  /** Currently active/expanded draft for editing */
  activeDraftId: string | null;
  /** Set the active draft for editing */
  setActiveDraft: (draftId: string | null) => void;
  /** Get draft by ID */
  getDraftById: (draftId: string) => EmailDraft | undefined;
  /** Get draft by action ID */
  getDraftByActionId: (actionId: string) => EmailDraft | undefined;
  /** Update draft content locally (for editing) */
  updateDraft: (draftId: string, edits: EmailDraftEdits) => void;
  /** Update draft status locally */
  updateDraftStatus: (draftId: string, status: DraftStatus) => void;
  /** Mark draft as rejected/dismissed */
  rejectDraft: (draftId: string) => void;
  /** Clear all drafts */
  clearDrafts: () => void;
  /** Whether there are any unsent drafts */
  hasUnsentDrafts: boolean;
}

const EmailDraftsContext = createContext<EmailDraftsContextValue | null>(null);

/**
 * Provider component that manages email drafts state and LiveKit stream subscription.
 * Wrap your meeting components with this provider to share drafts state.
 *
 * @example
 * ```tsx
 * <EmailDraftsProvider>
 *   <MeetingLayout />
 * </EmailDraftsProvider>
 * ```
 */
export function EmailDraftsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const room = useRoomContext();
  const { data: session } = useSession();
  const isMountedRef = useRef(true);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  // Lookup maps for O(1) access
  const draftIdMapRef = useRef<Map<string, EmailDraft>>(new Map());
  const actionIdMapRef = useRef<Map<string, EmailDraft>>(new Map());

  // Track which drafts are currently being persisted to avoid duplicates
  const persistingActionIdsRef = useRef<Set<string>>(new Set());

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Persist a draft to the database via API.
   * This ensures the draft can be retrieved by the send endpoint.
   * Returns the persisted draft with the database-assigned ID, or null on failure.
   */
  const persistDraftToDatabase = useCallback(
    async (draft: EmailDraft): Promise<EmailDraft | null> => {
      // Skip if no session (user not authenticated)
      if (!session?.user?.id) {
        console.warn("[EmailDraftsContext] Cannot persist draft: no session");
        return null;
      }

      // Skip if already persisting this action
      if (persistingActionIdsRef.current.has(draft.actionId)) {
        console.log(
          "[EmailDraftsContext] Already persisting draft for action:",
          draft.actionId
        );
        return null;
      }

      persistingActionIdsRef.current.add(draft.actionId);

      try {
        // Prepare payload with fallbacks for optional fields
        const payload = {
          actionId: draft.actionId,
          meetingId: draft.meetingId || draft.roomId || undefined,
          roomId: draft.roomId || draft.meetingContext?.roomId || "",
          originalInsightId: draft.originalInsightId || draft.actionId,
          suggestedTo: draft.suggestedTo || [],
          subject: draft.subject,
          body: draft.body,
          meetingContext: draft.meetingContext || {
            meetingTitle: null,
            meetingDate: null,
            participants: [],
            agendaTopics: [],
            roomId: null,
          },
          transcriptContext: draft.transcriptContext || null,
          actionContent: draft.actionContent || draft.subject,
          actionType: draft.actionType || "email_followup",
          speakerName: draft.speakerName || null,
          generationConfidence: draft.generationConfidence,
        };

        // Validate roomId is present (required field)
        if (!payload.roomId) {
          console.error(
            "[EmailDraftsContext] Cannot persist draft: missing roomId",
            { draft }
          );
          return null;
        }

        const response = await fetch("/api/email-drafts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(
            "[EmailDraftsContext] Failed to persist draft:",
            response.status,
            errorData,
            { payload }
          );
          return null;
        }

        const { draft: persistedDraft } = await response.json();

        console.log(
          "[EmailDraftsContext] Draft persisted to database:",
          persistedDraft.id
        );

        return persistedDraft as EmailDraft;
      } catch (error) {
        console.error("[EmailDraftsContext] Error persisting draft:", error);
        return null;
      } finally {
        persistingActionIdsRef.current.delete(draft.actionId);
      }
    },
    [session?.user?.id]
  );

  /**
   * Parse and validate draft data from the agent stream.
   * Returns null if the data is invalid.
   */
  const parseDraftData = useCallback(
    (
      data: Record<string, unknown>,
      attrs: Record<string, string>,
      streamId: string
    ): EmailDraft | null => {
      // Extract required fields
      const id = (data.id as string) || streamId;
      const actionId = (data.actionId as string) || attrs["action_id"];
      const originalInsightId =
        (data.originalInsightId as string) || attrs["original_insight_id"];
      const subject = data.subject as string;
      const body = data.body as string;
      const actionContent = data.actionContent as string;
      const actionType =
        (data.actionType as string) || attrs["action_type"] || "email_followup";

      // Validate required fields
      if (
        !isNonEmptyDraftString(actionId) ||
        !isNonEmptyDraftString(subject) ||
        !isNonEmptyDraftString(body)
      ) {
        console.warn(
          "[EmailDraftsContext] Received draft with missing required fields:",
          {
            hasActionId: isNonEmptyDraftString(actionId),
            hasSubject: isNonEmptyDraftString(subject),
            hasBody: isNonEmptyDraftString(body),
          }
        );
        return null;
      }

      // Parse recipients
      const suggestedTo = parseEmailRecipients(data.suggestedTo);

      // Parse meeting context
      const meetingContext = parseMeetingContext(data.meetingContext);

      // Parse confidence
      const confidence = normalizeDraftConfidence(
        typeof data.generationConfidence === "number"
          ? data.generationConfidence
          : undefined
      );

      // Extract meetingId and roomId for audit logging
      const meetingIdValue = (data.meetingId as string) || attrs["meeting_id"] || "";
      const roomIdValue = (data.roomId as string) || attrs["room_id"] || meetingContext.roomId || "";

      return {
        id,
        actionId,
        originalInsightId: originalInsightId || "",
        meetingId: meetingIdValue,
        roomId: roomIdValue,
        suggestedTo,
        subject,
        body,
        meetingContext,
        transcriptContext:
          typeof data.transcriptContext === "string"
            ? data.transcriptContext
            : null,
        actionContent: actionContent || "",
        actionType,
        speakerName:
          typeof data.speakerName === "string" ? data.speakerName : null,
        status: parseDraftStatus(
          (data.status as string) || attrs["status"]
        ),
        generationConfidence: confidence,
        generatedAt: normalizeDraftTimestamp(data.generatedAt as number),
        errorMessage:
          typeof data.errorMessage === "string" ? data.errorMessage : null,
      };
    },
    []
  );

  /**
   * Handle incoming email draft stream from the agent
   */
  const handleDraftStream = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (reader: TextStreamReader, _participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(rawJson) as Record<string, unknown>;
        } catch (parseError) {
          console.error(
            "[EmailDraftsContext] Invalid JSON in draft stream:",
            parseError
          );
          return;
        }

        const attrs = reader.info.attributes ?? {};
        const draft = parseDraftData(data, attrs, reader.info.id);

        if (!draft) {
          return;
        }

        console.log("[EmailDraftsContext] Received email draft:", {
          id: draft.id,
          actionId: draft.actionId,
          subject:
            draft.subject.length > 40
              ? draft.subject.slice(0, 40) + "..."
              : draft.subject,
          status: draft.status,
        });

        // Persist draft to database first (so it can be found by send endpoint)
        const persistedDraft = await persistDraftToDatabase(draft);

        // Use persisted draft if available (has database ID), otherwise use stream draft
        const finalDraft = persistedDraft || draft;

        if (!isMountedRef.current) return;

        setDrafts((prev) => {
          // Check for existing draft by ID or action ID
          const existingByIdIndex = prev.findIndex((d) => d.id === finalDraft.id);
          const existingByActionIndex = prev.findIndex(
            (d) => d.actionId === finalDraft.actionId
          );

          // If draft exists, update it (preserving any local edits if newer)
          if (existingByIdIndex !== -1) {
            const existing = prev[existingByIdIndex];
            // Only update if new draft is newer or existing is still generating
            if (
              existing.status === "generating" ||
              finalDraft.generatedAt > existing.generatedAt
            ) {
              const updated = [...prev];
              updated[existingByIdIndex] = finalDraft;
              // Update lookup maps
              draftIdMapRef.current.set(finalDraft.id, finalDraft);
              actionIdMapRef.current.set(finalDraft.actionId, finalDraft);
              return updated;
            }
            return prev;
          }

          // If we already have a draft for this action, update it
          if (existingByActionIndex !== -1) {
            const existing = prev[existingByActionIndex];
            if (
              existing.status === "generating" ||
              finalDraft.generatedAt > existing.generatedAt
            ) {
              const updated = [...prev];
              // Use the database ID for existing draft
              updated[existingByActionIndex] = finalDraft;
              // Update lookup maps - remove old ID if different
              if (prev[existingByActionIndex].id !== finalDraft.id) {
                draftIdMapRef.current.delete(prev[existingByActionIndex].id);
              }
              draftIdMapRef.current.set(finalDraft.id, finalDraft);
              actionIdMapRef.current.set(finalDraft.actionId, finalDraft);
              return updated;
            }
            return prev;
          }

          // Add new draft at the beginning (newest first)
          const updated = [finalDraft, ...prev];

          // Update lookup maps
          draftIdMapRef.current.set(finalDraft.id, finalDraft);
          actionIdMapRef.current.set(finalDraft.actionId, finalDraft);

          // Trim to max size and clean up maps for removed items
          if (updated.length > MAX_DRAFTS) {
            const removed = updated.slice(MAX_DRAFTS);
            removed.forEach((r) => {
              draftIdMapRef.current.delete(r.id);
              actionIdMapRef.current.delete(r.actionId);
            });
          }

          return updated.slice(0, MAX_DRAFTS);
        });
      } catch (err) {
        console.error("[EmailDraftsContext] Failed to process draft:", err);
      }
    },
    [parseDraftData, persistDraftToDatabase]
  );

  // Register text stream handler
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(EMAIL_DRAFT_TOPIC);
    } catch {
      // Handler wasn't registered yet, this is expected
    }

    try {
      room.registerTextStreamHandler(EMAIL_DRAFT_TOPIC, handleDraftStream);
      console.log(
        `[EmailDraftsContext] Registered handler for topic: ${EMAIL_DRAFT_TOPIC}`
      );
    } catch (err) {
      console.warn(
        "[EmailDraftsContext] Failed to register draft stream handler:",
        err
      );
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(EMAIL_DRAFT_TOPIC);
      } catch {
        // Already unregistered or never registered, expected during cleanup
      }
    };
  }, [room, handleDraftStream]);

  /**
   * Computed values - memoized for performance.
   */
  const computedValues = useMemo(() => {
    const pendingDrafts: EmailDraft[] = [];
    const byStatus: Partial<Record<DraftStatus, EmailDraft[]>> = {};

    // Single pass through all drafts
    for (const draft of drafts) {
      // Pending drafts (ready or edited)
      if (draft.status === "ready" || draft.status === "edited") {
        pendingDrafts.push(draft);
      }

      // Group by status
      if (!byStatus[draft.status]) {
        byStatus[draft.status] = [];
      }
      byStatus[draft.status]!.push(draft);
    }

    return {
      pendingDrafts,
      draftsByStatus: byStatus,
    };
  }, [drafts]);

  /**
   * Get draft by ID.
   * Uses lookup map for O(1) access.
   */
  const getDraftById = useCallback(
    (draftId: string): EmailDraft | undefined => {
      return draftIdMapRef.current.get(draftId);
    },
    []
  );

  /**
   * Get draft by action ID.
   * Uses lookup map for O(1) access.
   */
  const getDraftByActionId = useCallback(
    (actionId: string): EmailDraft | undefined => {
      return actionIdMapRef.current.get(actionId);
    },
    []
  );

  /**
   * Update draft content locally (for editing before send).
   */
  const updateDraft = useCallback(
    (draftId: string, edits: EmailDraftEdits) => {
      setDrafts((prev) =>
        prev.map((draft) => {
          if (draft.id !== draftId) return draft;

          const updated: EmailDraft = {
            ...draft,
            subject: edits.subject ?? draft.subject,
            body: edits.body ?? draft.body,
            // If user edited, update status to 'edited'
            status: draft.status === "ready" ? "edited" : draft.status,
            // Update recipients if provided
            suggestedTo: edits.to
              ? edits.to.map((email) => ({
                  email,
                  name: email.split("@")[0],
                  source: "explicit" as const,
                }))
              : draft.suggestedTo,
          };

          // Update lookup maps
          draftIdMapRef.current.set(updated.id, updated);
          actionIdMapRef.current.set(updated.actionId, updated);

          return updated;
        })
      );
    },
    []
  );

  /**
   * Update draft status locally.
   */
  const updateDraftStatus = useCallback(
    (draftId: string, status: DraftStatus) => {
      setDrafts((prev) =>
        prev.map((draft) => {
          if (draft.id !== draftId) return draft;

          const updated = { ...draft, status };

          // Update lookup maps
          draftIdMapRef.current.set(updated.id, updated);
          actionIdMapRef.current.set(updated.actionId, updated);

          return updated;
        })
      );
    },
    []
  );

  /**
   * Mark draft as rejected/dismissed.
   */
  const rejectDraft = useCallback((draftId: string) => {
    updateDraftStatus(draftId, "rejected");
  }, [updateDraftStatus]);

  /**
   * Set active draft for editing.
   */
  const setActiveDraft = useCallback((draftId: string | null) => {
    setActiveDraftId(draftId);
  }, []);

  /**
   * Clear all drafts.
   */
  const clearDrafts = useCallback(() => {
    setDrafts([]);
    setActiveDraftId(null);
    draftIdMapRef.current.clear();
    actionIdMapRef.current.clear();
  }, []);

  /**
   * Check if there are any unsent drafts.
   */
  const hasUnsentDrafts = useMemo(() => {
    return drafts.some(
      (d) => d.status === "ready" || d.status === "edited"
    );
  }, [drafts]);

  const value = useMemo(
    () => ({
      drafts,
      pendingDrafts: computedValues.pendingDrafts,
      draftsByStatus: computedValues.draftsByStatus,
      draftCount: drafts.length,
      pendingCount: computedValues.pendingDrafts.length,
      activeDraftId,
      setActiveDraft,
      getDraftById,
      getDraftByActionId,
      updateDraft,
      updateDraftStatus,
      rejectDraft,
      clearDrafts,
      hasUnsentDrafts,
    }),
    [
      drafts,
      computedValues,
      activeDraftId,
      setActiveDraft,
      getDraftById,
      getDraftByActionId,
      updateDraft,
      updateDraftStatus,
      rejectDraft,
      clearDrafts,
      hasUnsentDrafts,
    ]
  );

  return (
    <EmailDraftsContext.Provider value={value}>
      {children}
    </EmailDraftsContext.Provider>
  );
}

/**
 * Hook to access email drafts from context.
 * Must be used within an EmailDraftsProvider.
 *
 * @throws Error if used outside of EmailDraftsProvider
 */
export function useEmailDraftsContext(): EmailDraftsContextValue {
  const context = useContext(EmailDraftsContext);
  if (!context) {
    throw new Error(
      "useEmailDraftsContext must be used within an EmailDraftsProvider"
    );
  }
  return context;
}

/**
 * Hook to get draft for a specific action.
 * Returns the draft if one exists for the action, undefined otherwise.
 */
export function useDraftForAction(
  actionId: string
): EmailDraft | undefined {
  const { getDraftByActionId } = useEmailDraftsContext();
  return getDraftByActionId(actionId);
}

/**
 * Hook to get pending (unsent) draft count.
 * Useful for badge indicators.
 */
export function usePendingDraftCount(): number {
  const { pendingCount } = useEmailDraftsContext();
  return pendingCount;
}
