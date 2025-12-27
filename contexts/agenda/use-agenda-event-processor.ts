"use client";

/**
 * Hook for processing agenda events from LiveKit
 *
 * Handles the business logic of updating agenda state based on incoming events.
 */

import { useCallback, useRef, type MutableRefObject } from "react";
import type { AgendaProgressEvent, AgendaItem, AgendaItemStatus, AgendaWithItems } from "./types";
import { DEBUG, AGENT_IDENTITY_PREFIX } from "./constants";

interface UseAgendaEventProcessorProps {
  isMountedRef: MutableRefObject<boolean>;
  lastEventTimestampRef: MutableRefObject<number>;
  lastVersionRef: MutableRefObject<number | undefined>;
  setIsMeetingStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMeetingEnded: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setItemStatuses: React.Dispatch<React.SetStateAction<Map<string, AgendaItemStatus>>>;
  setItemDurations: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setAgenda: React.Dispatch<React.SetStateAction<AgendaWithItems | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setRecoveredFromAgent: React.Dispatch<React.SetStateAction<boolean>>;
  setHasAgentStateOnly: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook that returns a callback for processing agenda events
 */
export function useAgendaEventProcessor({
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
}: UseAgendaEventProcessorProps) {
  /**
   * Process agenda progress event from LiveKit
   * Includes stale event rejection and sender validation
   */
  const processAgendaEvent = useCallback((event: AgendaProgressEvent, senderIdentity?: string) => {
    if (!isMountedRef.current) return;

    // Validate sender is the luframe agent (security)
    if (senderIdentity && !senderIdentity.toLowerCase().startsWith(AGENT_IDENTITY_PREFIX)) {
      if (DEBUG) {
        console.warn(`[AgendaContext] Ignoring event from non-agent sender: ${senderIdentity}`);
      }
      return;
    }

    // Stale event rejection: ignore events older than last processed
    if (event.timestamp <= lastEventTimestampRef.current) {
      if (DEBUG) {
        console.warn(`[AgendaContext] Ignoring stale event (${event.timestamp} <= ${lastEventTimestampRef.current})`);
      }
      return;
    }
    lastEventTimestampRef.current = event.timestamp;

    switch (event.type) {
      case "meeting_started":
        setIsMeetingStarted(true);
        break;

      case "meeting_ended":
        setIsMeetingEnded(true);
        setCurrentItemId(null);
        // Mark all remaining pending/in_progress items as completed
        setItemStatuses((prev) => {
          const updated = new Map(prev);
          prev.forEach((status, id) => {
            if (status === "pending" || status === "in_progress") {
              updated.set(id, "completed");
            }
          });
          return updated;
        });
        break;

      case "topic_started":
        setIsMeetingStarted(true); // Ensure meeting is marked as started
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
        // Capture actual duration from event
        if ("actualDuration" in event && typeof event.actualDuration === "number") {
          setItemDurations((prev) => {
            const updated = new Map(prev);
            updated.set(event.itemId, event.actualDuration);
            return updated;
          });
        }
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
          // Version guard: only apply if version is newer or equal
          // Skip if incoming version is older (prevents regression from late/stale sync)
          const incomingVersion = event.agenda.version ?? 0;
          const currentVersion = lastVersionRef.current ?? 0;

          if (incomingVersion < currentVersion) {
            if (DEBUG) {
              console.warn(
                `[AgendaContext] Ignoring stale agenda_sync (version ${incomingVersion} < ${currentVersion})`
              );
            }
            break;
          }

          setAgenda(event.agenda);

          // Reset event timestamp when version changes to accept fresh events
          // This prevents dropping valid events after a version bump
          if (incomingVersion > currentVersion) {
            lastEventTimestampRef.current = 0;
          }
          lastVersionRef.current = event.agenda.version;

          // Clear agent-only state since we now have full agenda definition
          setHasAgentStateOnly(false);

          // Update all item statuses and durations
          const statusMap = new Map<string, AgendaItemStatus>();
          const durationMap = new Map<string, number>();
          event.agenda.items.forEach((item: AgendaItem) => {
            statusMap.set(item.id, item.status);
            if (item.actualDuration !== null && item.actualDuration !== undefined) {
              durationMap.set(item.id, item.actualDuration);
            }
          });
          setItemStatuses(statusMap);
          setItemDurations(durationMap);

          // Update current item
          if (event.currentItemIndex !== null && event.agenda.items[event.currentItemIndex]) {
            setCurrentItemId(event.agenda.items[event.currentItemIndex].id);
          } else {
            setCurrentItemId(null);
          }

          // Sync lifecycle flags from agenda status (critical for late joiners)
          if (event.agenda.meetingStartedAt) {
            setIsMeetingStarted(true);
          }
          if (event.agenda.status === "completed" || event.agenda.meetingEndedAt) {
            setIsMeetingEnded(true);
          }

          // Clear error state since we have valid data from agent
          setError(null);
          setRecoveredFromAgent(true);

          if (DEBUG) {
            console.log("[AgendaContext] Applied agenda_sync, cleared error state");
          }
        }
        break;
    }
  }, [
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
  ]);

  return { processAgendaEvent };
}
