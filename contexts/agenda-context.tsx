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
import {
  useRoomContext,
  useRemoteParticipants,
} from "@livekit/components-react";
import type {
  AgendaWithItems,
  AgendaItem,
  AgendaProgressEvent,
  AgendaStateAttribute,
  AgendaItemStatus,
} from "@/types/agenda";
import { AGENDA_TOPIC } from "@/types/agenda";

// ============================================================================
// Constants
// ============================================================================

/** Agent identity prefix for identifying the hedwiq agent */
const AGENT_IDENTITY_PREFIX = "hedwiq";

/** Attribute key for agenda state in agent participant attributes */
const AGENDA_STATE_ATTRIBUTE_KEY = "agendaState";

// ============================================================================
// Types
// ============================================================================

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
 * Context value for agenda
 */
interface AgendaContextValue {
  /** Full agenda with items (null if not loaded or no agenda exists) */
  agenda: AgendaWithItems | null;
  /** Whether agenda is loading from the API */
  isLoading: boolean;
  /** Error from loading/hydration */
  error: string | null;
  /** Current active item (null if meeting not started) */
  currentItem: AgendaItem | null;
  /** Current item index (null if meeting not started) */
  currentItemIndex: number | null;
  /** Items that have been completed */
  completedItems: AgendaItem[];
  /** Items still pending */
  pendingItems: AgendaItem[];
  /** Items that were skipped */
  skippedItems: AgendaItem[];
  /** Progress percentage (0-100) */
  progressPercentage: number;
  /** Estimated remaining time in minutes */
  estimatedRemainingTime: number;
  /** Whether the meeting has started (first topic began) */
  isMeetingStarted: boolean;
  /** Whether the meeting has ended (all topics done) */
  isMeetingEnded: boolean;
  /** Get the topic associated with a transcript reference */
  getTopicForTranscript: (transcriptRef: string) => AgendaItem | null;
  /** Manually refresh agenda from API */
  refreshAgenda: () => Promise<void>;
}

const AgendaContext = createContext<AgendaContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AgendaProviderProps {
  children: React.ReactNode;
  /** Room ID for fetching agenda */
  roomId: string;
  /** Initial agenda ID (from join sequence) */
  agendaId?: string;
  /** Initial agenda version (for cache invalidation) */
  agendaVersion?: number;
}

/**
 * Provider component that manages agenda state and LiveKit stream subscription.
 * Handles:
 * - Initial agenda fetch from API
 * - Real-time updates via hedwiq.agenda LiveKit topic
 * - Late joiner sync via agent participant attributes
 */
export function AgendaProvider({
  children,
  roomId,
  agendaId,
  agendaVersion,
}: AgendaProviderProps) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const isMountedRef = useRef(true);

  // Core state
  const [agenda, setAgenda] = useState<AgendaWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track current item separately for real-time updates
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);

  // Track item statuses for real-time updates
  const [itemStatuses, setItemStatuses] = useState<
    Map<string, AgendaItemStatus>
  >(new Map());

  // Track meeting lifecycle
  const [isMeetingStarted, setIsMeetingStarted] = useState(false);
  const [isMeetingEnded, setIsMeetingEnded] = useState(false);

  // Version tracking for cache invalidation
  const lastVersionRef = useRef<number | undefined>(agendaVersion);

  // Ref for AgendaId to avoid stale closures
  void agendaId; // Used only for logging/debugging

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // Computed Values
  // ============================================================================

  /**
   * Compute items with merged real-time status updates
   */
  const itemsWithLiveStatus = useMemo(() => {
    if (!agenda?.items) return [];

    return agenda.items.map((item) => {
      const liveStatus = itemStatuses.get(item.id);
      if (liveStatus && liveStatus !== item.status) {
        return { ...item, status: liveStatus };
      }
      return item;
    });
  }, [agenda?.items, itemStatuses]);

  /**
   * Current active item
   */
  const currentItem = useMemo(() => {
    if (!currentItemId) return null;
    return itemsWithLiveStatus.find((item) => item.id === currentItemId) ?? null;
  }, [itemsWithLiveStatus, currentItemId]);

  /**
   * Current item index
   */
  const currentItemIndex = useMemo(() => {
    if (!currentItemId) return null;
    const index = itemsWithLiveStatus.findIndex((item) => item.id === currentItemId);
    return index >= 0 ? index : null;
  }, [itemsWithLiveStatus, currentItemId]);

  /**
   * Completed items
   */
  const completedItems = useMemo(() => {
    return itemsWithLiveStatus.filter((item) => item.status === "completed");
  }, [itemsWithLiveStatus]);

  /**
   * Pending items
   */
  const pendingItems = useMemo(() => {
    return itemsWithLiveStatus.filter((item) => item.status === "pending");
  }, [itemsWithLiveStatus]);

  /**
   * Skipped items
   */
  const skippedItems = useMemo(() => {
    return itemsWithLiveStatus.filter((item) => item.status === "skipped");
  }, [itemsWithLiveStatus]);

  /**
   * Progress percentage
   */
  const progressPercentage = useMemo(() => {
    const total = itemsWithLiveStatus.length;
    if (total === 0) return 0;
    const completed = completedItems.length + skippedItems.length;
    return Math.round((completed / total) * 100);
  }, [itemsWithLiveStatus.length, completedItems.length, skippedItems.length]);

  /**
   * Estimated remaining time based on pending items' estimated durations
   */
  const estimatedRemainingTime = useMemo(() => {
    return pendingItems.reduce(
      (sum, item) => sum + (item.estimatedDuration ?? 0),
      0
    );
  }, [pendingItems]);

  // ============================================================================
  // API Functions
  // ============================================================================

  /**
   * Fetch agenda from API
   */
  const fetchAgenda = useCallback(async () => {
    if (!roomId || !isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/agenda`);

      if (!response.ok) {
        if (response.status === 404) {
          // No agenda exists - not an error
          if (isMountedRef.current) {
            setAgenda(null);
            setIsLoading(false);
          }
          return;
        }
        throw new Error(`Failed to fetch agenda (${response.status})`);
      }

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (data.agenda) {
        setAgenda(data.agenda);
        lastVersionRef.current = data.agenda.version;

        // Initialize item statuses from fetched data
        const statusMap = new Map<string, AgendaItemStatus>();
        data.agenda.items.forEach((item: AgendaItem) => {
          statusMap.set(item.id, item.status);
        });
        setItemStatuses(statusMap);

        // Check if meeting is already started
        if (data.agenda.meetingStartedAt) {
          setIsMeetingStarted(true);
        }

        // Check if meeting has ended
        if (data.agenda.status === "completed") {
          setIsMeetingEnded(true);
        }

        // Find current item
        const inProgressItem = data.agenda.items.find(
          (item: AgendaItem) => item.status === "in_progress"
        );
        if (inProgressItem) {
          setCurrentItemId(inProgressItem.id);
        }
      } else {
        setAgenda(null);
      }
    } catch (err) {
      console.error("[AgendaContext] Error fetching agenda:", err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load agenda");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [roomId]);

  /**
   * Manually refresh agenda from API
   */
  const refreshAgenda = useCallback(async () => {
    await fetchAgenda();
  }, [fetchAgenda]);

  // ============================================================================
  // LiveKit Event Handlers
  // ============================================================================

  /**
   * Process agenda progress event from LiveKit
   */
  const processAgendaEvent = useCallback((event: AgendaProgressEvent) => {
    if (!isMountedRef.current) return;

    switch (event.type) {
      case "meeting_started":
        setIsMeetingStarted(true);
        break;

      case "meeting_ended":
        setIsMeetingEnded(true);
        setCurrentItemId(null);
        break;

      case "topic_started":
        setCurrentItemId(event.itemId);
        setItemStatuses((prev) => {
          const updated = new Map(prev);
          updated.set(event.itemId, "in_progress");
          return updated;
        });
        break;

      case "topic_completed":
        // If completed item is current, clear current
        setCurrentItemId((prev) =>
          prev === event.itemId ? null : prev
        );
        setItemStatuses((prev) => {
          const updated = new Map(prev);
          updated.set(event.itemId, "completed");
          return updated;
        });
        break;

      case "topic_skipped":
        setCurrentItemId((prev) =>
          prev === event.itemId ? null : prev
        );
        setItemStatuses((prev) => {
          const updated = new Map(prev);
          updated.set(event.itemId, "skipped");
          return updated;
        });
        break;

      case "agenda_sync":
        // Full agenda sync from agent (for late joiners)
        if (event.agenda) {
          setAgenda(event.agenda);
          lastVersionRef.current = event.agenda.version;

          // Update all item statuses
          const statusMap = new Map<string, AgendaItemStatus>();
          event.agenda.items.forEach((item: AgendaItem) => {
            statusMap.set(item.id, item.status);
          });
          setItemStatuses(statusMap);

          // Update current item
          if (event.currentItemIndex !== null && event.agenda.items[event.currentItemIndex]) {
            setCurrentItemId(event.agenda.items[event.currentItemIndex].id);
          } else {
            setCurrentItemId(null);
          }
        }
        break;
    }
  }, []);

  /**
   * Handle incoming agenda stream from the agent
   */
  const handleAgendaStream = useCallback(
    async (reader: TextStreamReader, _info: ParticipantInfo) => {
      void _info; // Used by text stream subscription signature
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        const data = JSON.parse(rawJson) as AgendaProgressEvent;
        processAgendaEvent(data);
      } catch (err) {
        console.error("[AgendaContext] Failed to parse agenda event:", err);
      }
    },
    [processAgendaEvent]
  );

  // ============================================================================
  // Late Joiner Sync via Agent Attributes
  // ============================================================================

  /**
   * Check agent participant attributes for agenda state
   * This handles late joiner sync without relying on text stream replay
   */
  useEffect(() => {
    if (!agenda) return;

    // Find the hedwiq agent participant
    const agentParticipant = remoteParticipants.find((p) =>
      p.identity.toLowerCase().startsWith(AGENT_IDENTITY_PREFIX)
    );

    if (!agentParticipant) return;

    // Check for agenda state in attributes
    const agendaStateJson = agentParticipant.attributes?.[AGENDA_STATE_ATTRIBUTE_KEY];
    if (!agendaStateJson) return;

    try {
      const state = JSON.parse(agendaStateJson) as AgendaStateAttribute;

      // Only process if version matches or is newer
      if (state.v >= (lastVersionRef.current ?? 0)) {
        // Update current item
        if (state.c) {
          setCurrentItemId(state.c);
        }

        // Update completed items
        if (state.d && state.d.length > 0) {
          setItemStatuses((prev) => {
            const updated = new Map(prev);
            state.d.forEach((id) => {
              if (updated.get(id) !== "completed") {
                updated.set(id, "completed");
              }
            });
            // Set current as in_progress
            if (state.c) {
              updated.set(state.c, "in_progress");
            }
            return updated;
          });
        }

        // Update meeting started
        if (state.s) {
          setIsMeetingStarted(true);
        }
      }
    } catch (err) {
      console.warn("[AgendaContext] Failed to parse agent attributes:", err);
    }
  }, [agenda, remoteParticipants]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Fetch agenda on mount
  useEffect(() => {
    fetchAgenda();
  }, [fetchAgenda]);

  // Register text stream handler for agenda events
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(AGENDA_TOPIC);
    } catch {
      // Handler wasn't registered yet, ignore
    }

    try {
      room.registerTextStreamHandler(AGENDA_TOPIC, handleAgendaStream);
      console.log(`[AgendaContext] Registered handler for topic: ${AGENDA_TOPIC}`);
    } catch (err) {
      console.warn("[AgendaContext] Failed to register agenda handler:", err);
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(AGENDA_TOPIC);
      } catch {
        // Already unregistered, ignore
      }
    };
  }, [room, handleAgendaStream]);

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Get the topic associated with a transcript reference
   */
  const getTopicForTranscript = useCallback(
    (transcriptRef: string): AgendaItem | null => {
      if (!agenda?.items) return null;

      // Find item where transcript ref falls between start and end refs
      for (const item of itemsWithLiveStatus) {
        if (item.startTranscriptRef === transcriptRef) {
          return item;
        }
        if (item.endTranscriptRef === transcriptRef) {
          return item;
        }
      }

      return null;
    },
    [agenda?.items, itemsWithLiveStatus]
  );

  // ============================================================================
  // Context Value
  // ============================================================================

  const value = useMemo(
    () => ({
      agenda: agenda
        ? { ...agenda, items: itemsWithLiveStatus }
        : null,
      isLoading,
      error,
      currentItem,
      currentItemIndex,
      completedItems,
      pendingItems,
      skippedItems,
      progressPercentage,
      estimatedRemainingTime,
      isMeetingStarted,
      isMeetingEnded,
      getTopicForTranscript,
      refreshAgenda,
    }),
    [
      agenda,
      itemsWithLiveStatus,
      isLoading,
      error,
      currentItem,
      currentItemIndex,
      completedItems,
      pendingItems,
      skippedItems,
      progressPercentage,
      estimatedRemainingTime,
      isMeetingStarted,
      isMeetingEnded,
      getTopicForTranscript,
      refreshAgenda,
    ]
  );

  return (
    <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

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
