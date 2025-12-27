"use client";

/**
 * Agenda Context Provider
 *
 * Provider component that manages agenda state and LiveKit stream subscription.
 * Handles:
 * - Initial agenda fetch from API
 * - Real-time updates via luframe.agenda LiveKit topic
 * - Late joiner sync via agent participant attributes
 *
 * NOTE: Manual override methods (forceStartItem, forceCompleteItem, forceSkipItem)
 * from Plan Section 5.3 are intentionally deferred to Phase 5 implementation.
 * These will be added when the manual topic control UI is built.
 */

import React, {
  createContext,
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
  AgendaContextValue,
  AgendaProviderProps,
  AgendaWithItems,
  AgendaItemStatus,
} from "./types";

import { useAgendaApi } from "./use-agenda-api";
import { useAgendaEventProcessor } from "./use-agenda-event-processor";
import { useAgendaLiveKit } from "./use-agenda-livekit";
import { useAgendaComputed } from "./use-agenda-computed";
import { useAgendaLateJoinerSync } from "./use-agenda-late-joiner-sync";

// ============================================================================
// Context
// ============================================================================

const AgendaContext = createContext<AgendaContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

/**
 * Provider component that manages agenda state and LiveKit stream subscription.
 */
export function AgendaProvider({
  children,
  roomId,
  agendaVersion,
}: AgendaProviderProps) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const isMountedRef = useRef(true);

  // Core state
  const [agenda, setAgenda] = useState<AgendaWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiLoadComplete, setApiLoadComplete] = useState(false);

  // Track if we've recovered state from agent (to clear error UI)
  const [recoveredFromAgent, setRecoveredFromAgent] = useState(false);

  // Track if we have partial state from agent but no agenda definition
  const [hasAgentStateOnly, setHasAgentStateOnly] = useState(false);

  // Track current item separately for real-time updates
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);

  // Track item statuses for real-time updates
  const [itemStatuses, setItemStatuses] = useState<
    Map<string, AgendaItemStatus>
  >(new Map());

  // Track item actual durations for completed items
  const [itemDurations, setItemDurations] = useState<
    Map<string, number>
  >(new Map());

  // Track meeting lifecycle
  const [isMeetingStarted, setIsMeetingStarted] = useState(false);
  const [isMeetingEnded, setIsMeetingEnded] = useState(false);

  // Version tracking for cache invalidation and stale event rejection
  const lastVersionRef = useRef<number | undefined>(agendaVersion);
  const lastEventTimestampRef = useRef<number>(0);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // Hooks
  // ============================================================================

  // Event processor hook
  const { processAgendaEvent } = useAgendaEventProcessor({
    isMountedRef,
    lastEventTimestampRef,
    lastVersionRef,
    setIsMeetingStarted,
    setIsMeetingEnded,
    setCurrentItemId,
    setItemStatuses,
    setItemDurations,
    setAgenda,
    setError,
    setRecoveredFromAgent,
    setHasAgentStateOnly,
  });

  // API hook
  const { fetchAgenda, refreshAgenda } = useAgendaApi({
    roomId,
    isMountedRef,
    lastVersionRef,
    lastEventTimestampRef,
    setAgenda,
    setIsLoading,
    setError,
    setApiLoadComplete,
    setItemStatuses,
    setItemDurations,
    setIsMeetingStarted,
    setIsMeetingEnded,
    setCurrentItemId,
    setRecoveredFromAgent,
    setHasAgentStateOnly,
  });

  // LiveKit stream hook
  useAgendaLiveKit({
    room,
    isMountedRef,
    processAgendaEvent,
  });

  // Computed values hook
  const {
    itemsWithLiveStatus,
    currentItem,
    currentItemIndex,
    completedItems,
    pendingItems,
    skippedItems,
    progressPercentage,
    estimatedRemainingTime,
    getTopicForTranscript,
  } = useAgendaComputed({
    agenda,
    itemStatuses,
    itemDurations,
    currentItemId,
  });

  // Late joiner sync hook
  useAgendaLateJoinerSync({
    apiLoadComplete,
    remoteParticipants,
    error,
    agenda,
    lastVersionRef,
    setCurrentItemId,
    setItemStatuses,
    setIsMeetingStarted,
    setError,
    setRecoveredFromAgent,
    setHasAgentStateOnly,
  });

  // ============================================================================
  // Effects
  // ============================================================================

  // Fetch agenda on mount
  useEffect(() => {
    fetchAgenda();
  }, [fetchAgenda]);

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
      recoveredFromAgent,
      hasAgentStateOnly,
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
      recoveredFromAgent,
      hasAgentStateOnly,
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
