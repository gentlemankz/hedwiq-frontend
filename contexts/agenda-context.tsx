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
import { useRoomContext, useConnectionState, useRemoteParticipants } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import type {
  Agenda,
  AgendaItem,
  AgendaItemProgress,
  AgendaItemStatus,
  AgendaPayload,
  AgendaProgressPayload,
  TopicChangeEvent,
} from "@/types/agenda";
import { AGENDA_TOPICS, AGENDA_CONSTANTS } from "@/types/agenda";

/**
 * Generate a unique ID for agenda items and events.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
 * Context value for agenda management
 */
interface AgendaContextValue {
  /** Current agenda state (null if no agenda created) */
  agenda: Agenda | null;
  /** Currently active agenda item (null if not started or no agenda) */
  currentItem: AgendaItemProgress | null;
  /** List of topic change events for transcription display */
  topicChanges: TopicChangeEvent[];
  /** Whether an agenda has been created and is active */
  isAgendaActive: boolean;
  /** Whether agenda has been sent to agent */
  isAgendaSent: boolean;

  /** Initialize agenda from PreJoin items */
  initializeAgenda: (items: AgendaItem[], createdBy: string) => void;
  /** Send agenda to agent via LiveKit stream */
  sendAgendaToAgent: () => Promise<void>;
  /** Manually mark an item as completed */
  manuallyCompleteItem: (index: number) => void;
  /** Manually start an item (mark as in_progress) */
  manuallyStartItem: (index: number) => void;
  /** Revert item status to pending */
  revertItemStatus: (index: number) => void;

  /** Get progress percentage (0-100) */
  getProgressPercentage: () => number;
  /** Get estimated time remaining in minutes */
  getEstimatedTimeRemaining: () => number;
  /** Get topic change event for a specific transcript reference */
  getTopicChangeForTranscript: (transcriptRef: string) => TopicChangeEvent | null;
}

const AgendaContext = createContext<AgendaContextValue | null>(null);

/**
 * Provider component that manages agenda state and LiveKit stream communication.
 * Wrap your meeting components with this provider to share agenda state.
 *
 * @example
 * ```tsx
 * <AgendaProvider initialItems={userChoices.agendaItems} createdBy={userId}>
 *   <MeetingLayout />
 * </AgendaProvider>
 * ```
 */
interface AgendaProviderProps {
  children: React.ReactNode;
  /** Initial agenda items from PreJoin (optional) */
  initialItems?: AgendaItem[];
  /** User ID of the agenda creator */
  createdBy?: string;
}

export function AgendaProvider({
  children,
  initialItems,
  createdBy,
}: AgendaProviderProps) {
  const room = useRoomContext();
  // Use reactive connection state hook - this properly triggers re-renders when state changes
  const connectionState = useConnectionState();
  const isMountedRef = useRef(true);

  // Initialize agenda from props using lazy initialization
  const [agenda, setAgenda] = useState<Agenda | null>(() => {
    if (initialItems && initialItems.length > 0 && createdBy) {
      return {
        id: generateId(),
        roomId: "", // Will be updated when room connects
        items: initialItems.map((item, index) => ({
          ...item,
          order: index,
          status: "pending" as AgendaItemStatus,
        })),
        currentItemIndex: -1,
        createdBy,
      };
    }
    return null;
  });
  const [topicChanges, setTopicChanges] = useState<TopicChangeEvent[]>([]);
  const [isAgendaSent, setIsAgendaSent] = useState(false);
  const hasSentAgendaRef = useRef(false);

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Initialize agenda from PreJoin items
   */
  const initializeAgenda = useCallback(
    (items: AgendaItem[], creatorId: string) => {
      if (!isMountedRef.current) return;

      const roomId = room?.name || "";
      const newAgenda: Agenda = {
        id: generateId(),
        roomId,
        items: items.map((item, index) => ({
          ...item,
          order: index,
          status: "pending" as AgendaItemStatus,
        })),
        currentItemIndex: -1,
        createdBy: creatorId,
      };
      setAgenda(newAgenda);
      setIsAgendaSent(false);
    },
    [room?.name]
  );

  /**
   * Send agenda to agent via LiveKit text stream
   */
  const sendAgendaToAgent = useCallback(async () => {
    if (!room || !agenda || isAgendaSent) {
      console.warn("[AgendaContext] Cannot send agenda: no room, agenda, or already sent");
      return;
    }

    // Get the actual room ID from the LiveKit room
    const actualRoomId = room.name || "";
    if (!actualRoomId) {
      console.warn("[AgendaContext] Room name not available yet");
      return;
    }

    try {
      const payload: AgendaPayload = {
        type: "agenda_init",
        agenda: {
          id: agenda.id,
          roomId: actualRoomId, // Use actual room ID from LiveKit
          items: agenda.items.map(({ id, title, description, estimatedMinutes, leadBy, order }) => ({
            id,
            title,
            description,
            estimatedMinutes,
            leadBy,
            order,
          })),
        },
      };

      const localParticipant = room.localParticipant;
      if (!localParticipant) {
        console.warn("[AgendaContext] No local participant to send agenda");
        return;
      }

      await localParticipant.sendText(JSON.stringify(payload), {
        topic: AGENDA_TOPICS.AGENDA_INIT,
      });

      console.log("[AgendaContext] Agenda sent to agent:", payload.agenda.id, "roomId:", actualRoomId);

      // Mark as sent only after successful send
      setIsAgendaSent(true);
      hasSentAgendaRef.current = true;

      // Update agenda with actual roomId only
      // NOTE: Do NOT start the first item here - let the agent drive progress (Phase 1)
      // The agent will send a 'topic_started' event when it detects discussion has begun
      setAgenda((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          roomId: actualRoomId,
          // Keep items unchanged - agent will update via progress events
          // Keep currentItemIndex as -1 until agent sends topic_started
        };
      });
    } catch (err) {
      console.error("[AgendaContext] Failed to send agenda to agent:", err);
      // Reset the ref so we can retry on next effect trigger
      hasSentAgendaRef.current = false;
    }
  }, [room, agenda, isAgendaSent]);

  /**
   * Handle progress update from agent
   */
  const handleProgressUpdate = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (reader: TextStreamReader, _participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        const data: AgendaProgressPayload = JSON.parse(rawJson);

        console.log("[AgendaContext] Received progress update:", data);

        // Validate the update
        if (!data.agendaId || data.itemIndex === undefined) {
          console.warn("[AgendaContext] Invalid progress update:", data);
          return;
        }

        setAgenda((prev) => {
          if (!prev || prev.id !== data.agendaId) {
            console.warn("[AgendaContext] Progress update for unknown agenda");
            return prev;
          }

          if (data.itemIndex < 0 || data.itemIndex >= prev.items.length) {
            console.warn("[AgendaContext] Invalid item index:", data.itemIndex);
            return prev;
          }

          const updatedItems = [...prev.items];
          const currentItem = updatedItems[data.itemIndex];

          // Update item status
          updatedItems[data.itemIndex] = {
            ...currentItem,
            status: data.status,
            startedAt:
              data.status === "in_progress" && !currentItem.startedAt
                ? data.timestamp
                : currentItem.startedAt,
            completedAt:
              data.status === "completed" ? data.timestamp : currentItem.completedAt,
            actualMinutes:
              data.status === "completed" && currentItem.startedAt
                ? Math.round((data.timestamp - currentItem.startedAt) / 60000)
                : currentItem.actualMinutes,
          };

          // Handle topic change events
          if (data.type === "topic_change" || data.type === "topic_started") {
            const topicChange: TopicChangeEvent = {
              id: generateId(),
              fromItemIndex: prev.currentItemIndex,
              toItemIndex: data.itemIndex,
              timestamp: data.timestamp,
              transcriptRef: data.transcriptRef || "",
            };

            setTopicChanges((prevChanges) => [...prevChanges, topicChange]);
          }

          // Set meetingStartedAt on first topic_started event
          const shouldSetMeetingStart =
            data.type === "topic_started" && !prev.meetingStartedAt;

          return {
            ...prev,
            items: updatedItems,
            currentItemIndex:
              data.status === "in_progress" ? data.itemIndex : prev.currentItemIndex,
            meetingStartedAt: shouldSetMeetingStart ? data.timestamp : prev.meetingStartedAt,
          };
        });
      } catch (err) {
        console.error("[AgendaContext] Failed to parse progress update:", err);
      }
    },
    []
  );

  // Register text stream handler for progress updates
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(AGENDA_TOPICS.AGENDA_PROGRESS);
    } catch {
      // Handler wasn't registered yet, ignore
    }

    try {
      room.registerTextStreamHandler(AGENDA_TOPICS.AGENDA_PROGRESS, handleProgressUpdate);
      console.log(`[AgendaContext] Registered handler for topic: ${AGENDA_TOPICS.AGENDA_PROGRESS}`);
    } catch (err) {
      console.warn("[AgendaContext] Failed to register progress stream handler:", err);
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(AGENDA_TOPICS.AGENDA_PROGRESS);
      } catch {
        // Already unregistered, ignore
      }
    };
  }, [room, handleProgressUpdate]);

  // Send agenda to agent when room is connected and agenda exists
  // IMPORTANT: Use reactive connectionState hook, not room.state
  // room.state doesn't trigger re-renders when it changes
  useEffect(() => {
    if (room && agenda && !hasSentAgendaRef.current && connectionState === ConnectionState.Connected) {
      console.log("[AgendaContext] Room connected, sending agenda to agent automatically");
      // Note: hasSentAgendaRef is set inside sendAgendaToAgent after successful send
      sendAgendaToAgent();
    }
  }, [room, agenda, connectionState, sendAgendaToAgent]);

  // Re-send agenda when a new participant joins (handles race condition where agent joins after frontend)
  // The agent might connect after the frontend, missing the initial agenda send
  useEffect(() => {
    if (!room || !agenda || !isAgendaSent) return;

    const handleParticipantConnected = () => {
      // A new participant joined - this could be the agent
      // Re-send the agenda to ensure the agent receives it
      console.log("[AgendaContext] New participant joined, re-sending agenda to agent");

      // Small delay to ensure the agent has registered its handlers
      setTimeout(async () => {
        try {
          const localParticipant = room.localParticipant;
          if (!localParticipant) return;

          const payload = {
            type: "agenda_init",
            agenda: {
              id: agenda.id,
              roomId: agenda.roomId || room.name || "",
              items: agenda.items.map(({ id, title, description, estimatedMinutes, leadBy, order }) => ({
                id,
                title,
                description,
                estimatedMinutes,
                leadBy,
                order,
              })),
            },
          };

          await localParticipant.sendText(JSON.stringify(payload), {
            topic: AGENDA_TOPICS.AGENDA_INIT,
          });
          console.log("[AgendaContext] Re-sent agenda to newly joined participant");
        } catch (err) {
          console.error("[AgendaContext] Failed to re-send agenda:", err);
        }
      }, 1500); // 1.5 second delay to let agent register handlers
    };

    // Use RoomEvent.ParticipantConnected for type safety
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);

    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
    };
  }, [room, agenda, isAgendaSent]);

  /**
   * Manually mark an item as completed
   * NOTE: Manual status changes are local-only in Phase 1.
   * Phase 2 will add sync back to agent for consistency.
   */
  const manuallyCompleteItem = useCallback((index: number) => {
    setAgenda((prev) => {
      if (!prev || index < 0 || index >= prev.items.length) return prev;

      const updatedItems = [...prev.items];
      const now = Date.now();

      updatedItems[index] = {
        ...updatedItems[index],
        status: "completed",
        completedAt: now,
        actualMinutes: updatedItems[index].startedAt
          ? Math.round((now - updatedItems[index].startedAt!) / 60000)
          : undefined,
      };

      // Start next item if available
      let newCurrentIndex = prev.currentItemIndex;
      const nextIndex = index + 1;
      if (nextIndex < prev.items.length && updatedItems[nextIndex].status === "pending") {
        updatedItems[nextIndex] = {
          ...updatedItems[nextIndex],
          status: "in_progress",
          startedAt: now,
        };
        newCurrentIndex = nextIndex;

        // Add topic change event
        const topicChange: TopicChangeEvent = {
          id: generateId(),
          fromItemIndex: index,
          toItemIndex: nextIndex,
          timestamp: now,
          transcriptRef: "",
        };
        setTopicChanges((prevChanges) => [...prevChanges, topicChange]);
      }

      return {
        ...prev,
        items: updatedItems,
        currentItemIndex: newCurrentIndex,
      };
    });
  }, []);

  /**
   * Manually start an item (mark as in_progress)
   * NOTE: Manual status changes are local-only in Phase 1.
   * Phase 2 will add sync back to agent for consistency.
   */
  const manuallyStartItem = useCallback((index: number) => {
    setAgenda((prev) => {
      if (!prev || index < 0 || index >= prev.items.length) return prev;

      const updatedItems = [...prev.items];
      const now = Date.now();

      // Mark previous in_progress items as completed
      updatedItems.forEach((item, i) => {
        if (item.status === "in_progress" && i !== index) {
          updatedItems[i] = {
            ...item,
            status: "completed",
            completedAt: now,
            actualMinutes: item.startedAt
              ? Math.round((now - item.startedAt) / 60000)
              : undefined,
          };
        }
      });

      updatedItems[index] = {
        ...updatedItems[index],
        status: "in_progress",
        startedAt: now,
      };

      // Add topic change event
      const topicChange: TopicChangeEvent = {
        id: generateId(),
        fromItemIndex: prev.currentItemIndex,
        toItemIndex: index,
        timestamp: now,
        transcriptRef: "",
      };
      setTopicChanges((prevChanges) => [...prevChanges, topicChange]);

      return {
        ...prev,
        items: updatedItems,
        currentItemIndex: index,
        meetingStartedAt: prev.meetingStartedAt || now,
      };
    });
  }, []);

  /**
   * Revert item status to pending
   * NOTE: Manual status changes are local-only in Phase 1.
   * Phase 2 will add sync back to agent for consistency.
   */
  const revertItemStatus = useCallback((index: number) => {
    setAgenda((prev) => {
      if (!prev || index < 0 || index >= prev.items.length) return prev;

      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        status: "pending",
        startedAt: undefined,
        completedAt: undefined,
        actualMinutes: undefined,
      };

      // Update current index if we reverted the current item
      let newCurrentIndex = prev.currentItemIndex;
      if (prev.currentItemIndex === index) {
        // Find the last in_progress item, or -1 if none
        // Using backwards loop for ES2022 compatibility (no findLastIndex)
        newCurrentIndex = -1;
        for (let i = updatedItems.length - 1; i >= 0; i--) {
          if (updatedItems[i].status === "in_progress") {
            newCurrentIndex = i;
            break;
          }
        }
      }

      return {
        ...prev,
        items: updatedItems,
        currentItemIndex: newCurrentIndex,
      };
    });
  }, []);

  /**
   * Get current item
   */
  const currentItem = useMemo(() => {
    if (!agenda || agenda.currentItemIndex < 0) return null;
    return agenda.items[agenda.currentItemIndex] || null;
  }, [agenda]);

  /**
   * Check if agenda is active
   */
  const isAgendaActive = useMemo(() => {
    return !!agenda && agenda.items.length > 0;
  }, [agenda]);

  /**
   * Get progress percentage
   */
  const getProgressPercentage = useCallback(() => {
    if (!agenda || agenda.items.length === 0) return 0;
    const completed = agenda.items.filter((item) => item.status === "completed").length;
    return Math.round((completed / agenda.items.length) * 100);
  }, [agenda]);

  /**
   * Get estimated time remaining in minutes
   */
  const getEstimatedTimeRemaining = useCallback(() => {
    if (!agenda || agenda.items.length === 0) return 0;

    return agenda.items.reduce((total, item) => {
      if (item.status === "completed") return total;
      return total + (item.estimatedMinutes || AGENDA_CONSTANTS.DEFAULT_ITEM_MINUTES);
    }, 0);
  }, [agenda]);

  /**
   * Get topic change event for a specific transcript reference
   */
  const getTopicChangeForTranscript = useCallback(
    (transcriptRef: string): TopicChangeEvent | null => {
      return topicChanges.find((tc) => tc.transcriptRef === transcriptRef) || null;
    },
    [topicChanges]
  );

  const value = useMemo(
    () => ({
      agenda,
      currentItem,
      topicChanges,
      isAgendaActive,
      isAgendaSent,
      initializeAgenda,
      sendAgendaToAgent,
      manuallyCompleteItem,
      manuallyStartItem,
      revertItemStatus,
      getProgressPercentage,
      getEstimatedTimeRemaining,
      getTopicChangeForTranscript,
    }),
    [
      agenda,
      currentItem,
      topicChanges,
      isAgendaActive,
      isAgendaSent,
      initializeAgenda,
      sendAgendaToAgent,
      manuallyCompleteItem,
      manuallyStartItem,
      revertItemStatus,
      getProgressPercentage,
      getEstimatedTimeRemaining,
      getTopicChangeForTranscript,
    ]
  );

  return (
    <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>
  );
}

/**
 * Hook to access agenda from context.
 * Must be used within an AgendaProvider.
 *
 * @throws Error if used outside of AgendaProvider
 */
export function useAgendaContext(): AgendaContextValue {
  const context = useContext(AgendaContext);
  if (!context) {
    throw new Error("useAgendaContext must be used within an AgendaProvider");
  }
  return context;
}

/**
 * Hook to safely access agenda context (returns null if not available).
 * Use this when the component might be rendered outside AgendaProvider.
 */
export function useAgendaContextSafe(): AgendaContextValue | null {
  return useContext(AgendaContext);
}
