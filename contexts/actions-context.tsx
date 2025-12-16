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
import type {
  ClassifiedAction,
  ActionType,
  ActionStatus,
  ActionMetadata,
} from "@/types/action";
import {
  MAX_ACTIONS,
  DEFAULT_ACTION_METADATA,
  parseActionType,
  parseUrgencyLevel,
  parseActionStatus,
  normalizeTimestamp,
  normalizeConfidence,
  isNonEmptyString,
} from "@/types/action";

/** LiveKit topic for classified actions from the Hedwiq agent */
const ACTION_TOPIC = "hedwiq.action";

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
 * Context value for actions
 */
interface ActionsContextValue {
  /** All classified actions, sorted by timestamp (newest first) */
  actions: ClassifiedAction[];
  /** Email-related actions only */
  emailActions: ClassifiedAction[];
  /** Actions grouped by type */
  actionsByType: Partial<Record<ActionType, ClassifiedAction[]>>;
  /** Actions grouped by status */
  actionsByStatus: Partial<Record<ActionStatus, ClassifiedAction[]>>;
  /** Total count of actions */
  actionCount: number;
  /** Count of email-related actions */
  emailActionCount: number;
  /** Get actions related to a specific transcript segment */
  getActionsForTranscript: (transcriptRef: string) => ClassifiedAction[];
  /** Get action by original insight ID */
  getActionByInsightId: (insightId: string) => ClassifiedAction | undefined;
  /** Update action status locally */
  updateActionStatus: (actionId: string, status: ActionStatus) => void;
  /** Clear all actions */
  clearActions: () => void;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

/**
 * Provider component that manages actions state and LiveKit stream subscription.
 * Wrap your meeting components with this provider to share actions state.
 *
 * @example
 * ```tsx
 * <ActionsProvider>
 *   <MeetingLayout />
 * </ActionsProvider>
 * ```
 */
export function ActionsProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext();
  const isMountedRef = useRef(true);
  const [actions, setActions] = useState<ClassifiedAction[]>([]);

  // Lookup maps for O(1) access - computed once and updated incrementally
  const insightIdMapRef = useRef<Map<string, ClassifiedAction>>(new Map());
  const transcriptRefMapRef = useRef<Map<string, ClassifiedAction[]>>(
    new Map()
  );

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Parse and validate action data from the agent stream.
   * Returns null if the data is invalid.
   */
  const parseActionData = useCallback(
    (
      data: Record<string, unknown>,
      attrs: Record<string, string>,
      streamId: string
    ): ClassifiedAction | null => {
      // Parse metadata with safe defaults
      const metadataRaw =
        (data.metadata as Record<string, unknown>) || {};
      const metadata: ActionMetadata = {
        ...DEFAULT_ACTION_METADATA,
        recipientHint: metadataRaw.recipientHint as string | undefined,
        subjectHint: metadataRaw.subjectHint as string | undefined,
        projectHint: metadataRaw.projectHint as string | undefined,
        assigneeHint: metadataRaw.assigneeHint as string | undefined,
        datetimeHint: metadataRaw.datetimeHint as string | undefined,
        durationHint: metadataRaw.durationHint as string | undefined,
        urgency: parseUrgencyLevel(
          (metadataRaw.urgency as string) || attrs["urgency"]
        ),
      };

      // Extract required fields
      const id = (data.id as string) || streamId;
      const originalInsightId =
        (data.original_insight_id as string) || attrs["original_insight_id"];
      const content = data.content as string;

      // Validate required fields - must be non-empty strings
      if (!isNonEmptyString(originalInsightId) || !isNonEmptyString(content)) {
        console.warn("[ActionsContext] Received action with missing required fields:", {
          hasOriginalInsightId: isNonEmptyString(originalInsightId),
          hasContent: isNonEmptyString(content),
        });
        return null;
      }

      // Parse confidence - handles both 0-100 (DB) and 0.0-1.0 (agent) formats
      const rawConfidence =
        data.classificationConfidence ??
        data.classification_confidence ??
        undefined;
      const confidence = normalizeConfidence(
        typeof rawConfidence === "number" ? rawConfidence : undefined
      );

      return {
        id,
        originalInsightId,
        content,
        speaker: data.speaker as string | undefined,
        speakerName: (data.speakerName || data.speaker_name) as
          | string
          | undefined,
        transcriptRef: (data.transcriptRef || data.transcript_ref) as
          | string
          | undefined,
        actionType: parseActionType(
          (data.actionType as string) ||
            (data.action_type as string) ||
            attrs["action_type"]
        ),
        classificationConfidence: confidence,
        metadata,
        requiresEmail:
          (data.requiresEmail as boolean) ??
          (data.requires_email as boolean) ??
          attrs["requires_email"] === "true",
        status: parseActionStatus(data.status as string),
        timestamp: normalizeTimestamp(data.timestamp as number),
        classifiedAt: normalizeTimestamp(
          (data.classifiedAt as number) || (data.classified_at as number)
        ),
      };
    },
    []
  );

  /**
   * Handle incoming action stream from the agent
   */
  const handleActionStream = useCallback(
    async (reader: TextStreamReader, _participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(rawJson) as Record<string, unknown>;
        } catch (parseError) {
          console.error("[ActionsContext] Invalid JSON in action stream:", parseError);
          return;
        }

        const attrs = reader.info.attributes ?? {};
        const action = parseActionData(data, attrs, reader.info.id);

        if (!action) {
          return;
        }

        console.log("[ActionsContext] Received classified action:", {
          id: action.id,
          actionType: action.actionType,
          content:
            action.content.length > 50
              ? action.content.slice(0, 50) + "..."
              : action.content,
          requiresEmail: action.requiresEmail,
        });

        setActions((prev) => {
          // Check for duplicates by ID or original insight ID
          const isDuplicate = prev.some(
            (a) =>
              a.id === action.id ||
              a.originalInsightId === action.originalInsightId
          );

          if (isDuplicate) {
            console.debug(
              "[ActionsContext] Duplicate action skipped:",
              action.id
            );
            return prev;
          }

          // Update lookup maps
          insightIdMapRef.current.set(action.originalInsightId, action);
          if (action.transcriptRef) {
            const existing =
              transcriptRefMapRef.current.get(action.transcriptRef) || [];
            transcriptRefMapRef.current.set(action.transcriptRef, [
              ...existing,
              action,
            ]);
          }

          // Add new action at the beginning (newest first)
          const updated = [action, ...prev];

          // Trim to max size and clean up maps for removed items
          if (updated.length > MAX_ACTIONS) {
            const removed = updated.slice(MAX_ACTIONS);
            removed.forEach((r) => {
              insightIdMapRef.current.delete(r.originalInsightId);
              if (r.transcriptRef) {
                const refActions = transcriptRefMapRef.current.get(
                  r.transcriptRef
                );
                if (refActions) {
                  const filtered = refActions.filter((a) => a.id !== r.id);
                  if (filtered.length > 0) {
                    transcriptRefMapRef.current.set(r.transcriptRef, filtered);
                  } else {
                    transcriptRefMapRef.current.delete(r.transcriptRef);
                  }
                }
              }
            });
          }

          return updated.slice(0, MAX_ACTIONS);
        });
      } catch (err) {
        console.error("[ActionsContext] Failed to process action:", err);
      }
    },
    [parseActionData]
  );

  // Register text stream handler
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(ACTION_TOPIC);
    } catch {
      // Handler wasn't registered yet, this is expected
    }

    try {
      room.registerTextStreamHandler(ACTION_TOPIC, handleActionStream);
      console.log(
        `[ActionsContext] Registered handler for topic: ${ACTION_TOPIC}`
      );
    } catch (err) {
      console.warn(
        "[ActionsContext] Failed to register action stream handler:",
        err
      );
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(ACTION_TOPIC);
      } catch {
        // Already unregistered or never registered, expected during cleanup
      }
    };
  }, [room, handleActionStream]);

  /**
   * Computed values - memoized for performance.
   * Combines all filtering/grouping into a single pass for efficiency.
   */
  const computedValues = useMemo(() => {
    const emailActions: ClassifiedAction[] = [];
    const byType: Partial<Record<ActionType, ClassifiedAction[]>> = {};
    const byStatus: Partial<Record<ActionStatus, ClassifiedAction[]>> = {};

    // Single pass through all actions
    for (const action of actions) {
      // Email actions
      if (action.requiresEmail) {
        emailActions.push(action);
      }

      // Group by type
      if (!byType[action.actionType]) {
        byType[action.actionType] = [];
      }
      byType[action.actionType]!.push(action);

      // Group by status
      if (!byStatus[action.status]) {
        byStatus[action.status] = [];
      }
      byStatus[action.status]!.push(action);
    }

    return {
      emailActions,
      actionsByType: byType,
      actionsByStatus: byStatus,
    };
  }, [actions]);

  /**
   * Get actions related to a specific transcript segment.
   * Uses lookup map for O(1) access.
   */
  const getActionsForTranscript = useCallback(
    (transcriptRef: string): ClassifiedAction[] => {
      return transcriptRefMapRef.current.get(transcriptRef) || [];
    },
    []
  );

  /**
   * Get action by original insight ID.
   * Uses lookup map for O(1) access.
   */
  const getActionByInsightId = useCallback(
    (insightId: string): ClassifiedAction | undefined => {
      return insightIdMapRef.current.get(insightId);
    },
    []
  );

  /**
   * Update action status locally
   */
  const updateActionStatus = useCallback(
    (actionId: string, status: ActionStatus) => {
      setActions((prev) =>
        prev.map((action) => {
          if (action.id !== actionId) return action;

          const updated = { ...action, status };

          // Update lookup maps
          insightIdMapRef.current.set(updated.originalInsightId, updated);
          if (updated.transcriptRef) {
            const refActions = transcriptRefMapRef.current.get(
              updated.transcriptRef
            );
            if (refActions) {
              transcriptRefMapRef.current.set(
                updated.transcriptRef,
                refActions.map((a) => (a.id === actionId ? updated : a))
              );
            }
          }

          return updated;
        })
      );
    },
    []
  );

  /**
   * Clear all actions
   */
  const clearActions = useCallback(() => {
    setActions([]);
    insightIdMapRef.current.clear();
    transcriptRefMapRef.current.clear();
  }, []);

  const value = useMemo(
    () => ({
      actions,
      emailActions: computedValues.emailActions,
      actionsByType: computedValues.actionsByType,
      actionsByStatus: computedValues.actionsByStatus,
      actionCount: actions.length,
      emailActionCount: computedValues.emailActions.length,
      getActionsForTranscript,
      getActionByInsightId,
      updateActionStatus,
      clearActions,
    }),
    [
      actions,
      computedValues,
      getActionsForTranscript,
      getActionByInsightId,
      updateActionStatus,
      clearActions,
    ]
  );

  return (
    <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>
  );
}

/**
 * Hook to access actions from context.
 * Must be used within an ActionsProvider.
 *
 * @throws Error if used outside of ActionsProvider
 */
export function useActionsContext(): ActionsContextValue {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error(
      "useActionsContext must be used within an ActionsProvider"
    );
  }
  return context;
}

/**
 * Hook to get classified action for a specific insight.
 * Returns the action if the insight has been classified, undefined otherwise.
 */
export function useActionForInsight(
  insightId: string
): ClassifiedAction | undefined {
  const { getActionByInsightId } = useActionsContext();
  return getActionByInsightId(insightId);
}
