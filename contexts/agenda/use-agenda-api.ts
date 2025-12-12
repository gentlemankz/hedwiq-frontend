"use client";

/**
 * Hook for agenda API interactions
 *
 * Handles fetching agenda from API with retry/backoff logic.
 */

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { AgendaWithItems, AgendaItem, AgendaItemStatus } from "./types";
import { DEBUG, MAX_FETCH_RETRIES, RETRY_BASE_DELAY_MS } from "./constants";

interface UseAgendaApiProps {
  roomId: string;
  isMountedRef: MutableRefObject<boolean>;
  lastVersionRef: MutableRefObject<number | undefined>;
  lastEventTimestampRef: MutableRefObject<number>;
  setAgenda: React.Dispatch<React.SetStateAction<AgendaWithItems | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setApiLoadComplete: React.Dispatch<React.SetStateAction<boolean>>;
  setItemStatuses: React.Dispatch<React.SetStateAction<Map<string, AgendaItemStatus>>>;
  setItemDurations: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setIsMeetingStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMeetingEnded: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setRecoveredFromAgent: React.Dispatch<React.SetStateAction<boolean>>;
  setHasAgentStateOnly: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook that provides agenda fetching functionality with retry logic
 */
export function useAgendaApi({
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
}: UseAgendaApiProps) {
  // Track fetch retry count and timer for cancellation
  const fetchRetryCountRef = useRef(0);
  const fetchRetryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (fetchRetryTimerRef.current) {
        clearTimeout(fetchRetryTimerRef.current);
        fetchRetryTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Fetch agenda from API with retry/backoff logic.
   * Handles transient errors with exponential backoff and proper cleanup.
   */
  const fetchAgenda = useCallback(async (isRetry = false) => {
    // Cancel any pending retry timer when starting a new fetch
    if (fetchRetryTimerRef.current) {
      clearTimeout(fetchRetryTimerRef.current);
      fetchRetryTimerRef.current = null;
    }

    // Handle empty roomId - set loading false to prevent permanent skeleton
    if (!roomId) {
      if (isMountedRef.current) {
        setIsLoading(false);
        setApiLoadComplete(true);
      }
      return;
    }

    if (!isMountedRef.current) return;

    // Only show loading on first attempt, not retries (but we'll clear it on success)
    if (!isRetry) {
      setIsLoading(true);
      setError(null);
      fetchRetryCountRef.current = 0;
    }

    try {
      const response = await fetch(`/api/rooms/${roomId}/agenda`);

      if (!response.ok) {
        if (response.status === 404) {
          // No agenda exists - not an error, mark load complete
          if (isMountedRef.current) {
            setAgenda(null);
            setApiLoadComplete(true);
            setIsLoading(false); // Always clear loading on completion
            fetchRetryCountRef.current = 0;
            setHasAgentStateOnly(false);
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
        // Reset event timestamp on version change to accept fresh events
        lastEventTimestampRef.current = 0;

        // Initialize item statuses from fetched data
        const statusMap = new Map<string, AgendaItemStatus>();
        const durationMap = new Map<string, number>();
        data.agenda.items.forEach((item: AgendaItem) => {
          statusMap.set(item.id, item.status);
          if (item.actualDuration !== null && item.actualDuration !== undefined) {
            durationMap.set(item.id, item.actualDuration);
          }
        });
        setItemStatuses(statusMap);
        setItemDurations(durationMap);

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

        // Clear any previous errors and recovery state
        setError(null);
        setRecoveredFromAgent(false);
        setHasAgentStateOnly(false);
      } else {
        setAgenda(null);
      }

      // Success: always clear loading and reset retry count
      setApiLoadComplete(true);
      setIsLoading(false);
      fetchRetryCountRef.current = 0;
    } catch (err) {
      if (DEBUG) {
        console.error("[AgendaContext] Error fetching agenda:", err);
      }

      // Retry with exponential backoff for transient errors
      if (fetchRetryCountRef.current < MAX_FETCH_RETRIES && isMountedRef.current) {
        fetchRetryCountRef.current += 1;
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, fetchRetryCountRef.current - 1);

        if (DEBUG) {
          console.log(`[AgendaContext] Retrying fetch (${fetchRetryCountRef.current}/${MAX_FETCH_RETRIES}) in ${delay}ms`);
        }

        // Store timer ref for cancellation on unmount/manual refresh
        fetchRetryTimerRef.current = setTimeout(() => {
          fetchRetryTimerRef.current = null;
          if (isMountedRef.current) {
            fetchAgenda(true);
          }
        }, delay);
        return;
      }

      // Max retries reached - set error but allow agent recovery
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load agenda");
        setApiLoadComplete(true);
        setIsLoading(false); // Clear loading on final failure;
      }
    }
  }, [
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
  ]);

  /**
   * Manually refresh agenda from API
   */
  const refreshAgenda = useCallback(async () => {
    await fetchAgenda();
  }, [fetchAgenda]);

  return { fetchAgenda, refreshAgenda };
}
