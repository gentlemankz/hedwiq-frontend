"use client";

/**
 * Hook for late joiner sync via agent attributes
 *
 * Handles syncing agenda state from agent participant attributes for late joiners.
 */

import { useEffect, useRef, type MutableRefObject } from "react";
import type { RemoteParticipant } from "livekit-client";
import type { AgendaWithItems, AgendaItemStatus, AgendaStateAttribute } from "./types";
import { DEBUG, AGENT_IDENTITY_PREFIX, AGENDA_STATE_ATTRIBUTE_KEY } from "./constants";
import { isValidAgendaStateAttribute } from "./validators";

interface UseAgendaLateJoinerSyncProps {
  apiLoadComplete: boolean;
  remoteParticipants: RemoteParticipant[];
  error: string | null;
  agenda: AgendaWithItems | null;
  lastVersionRef: MutableRefObject<number | undefined>;
  setCurrentItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setItemStatuses: React.Dispatch<React.SetStateAction<Map<string, AgendaItemStatus>>>;
  setIsMeetingStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setRecoveredFromAgent: React.Dispatch<React.SetStateAction<boolean>>;
  setHasAgentStateOnly: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook that handles late joiner sync from agent attributes
 */
export function useAgendaLateJoinerSync({
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
}: UseAgendaLateJoinerSyncProps) {
  // Track last processed attribute state to prevent duplicate processing
  const lastAttributeStateRef = useRef<string | null>(null);

  /**
   * Check agent participant attributes for agenda state
   * This handles late joiner sync without relying on text stream replay.
   *
   * IMPORTANT: This effect runs even when agenda is null to allow attribute-based
   * recovery for late joiners who may receive attributes before API response.
   */
  useEffect(() => {
    // Wait for API load attempt to complete (whether success, 404, or error)
    // This prevents race conditions with initial fetch
    if (!apiLoadComplete) return;

    // Find the hedwiq agent participant
    const agentParticipant = remoteParticipants.find((p) =>
      p.identity.toLowerCase().startsWith(AGENT_IDENTITY_PREFIX)
    );

    if (!agentParticipant) return;

    // Check for agenda state in attributes
    const agendaStateJson = agentParticipant.attributes?.[AGENDA_STATE_ATTRIBUTE_KEY];
    if (!agendaStateJson) return;

    // Skip if we already processed this exact state
    if (agendaStateJson === lastAttributeStateRef.current) return;

    try {
      const parsed = JSON.parse(agendaStateJson);

      // Validate attribute structure before processing
      if (!isValidAgendaStateAttribute(parsed)) {
        if (DEBUG) {
          console.warn("[AgendaContext] Invalid agent attribute structure:", parsed);
        }
        return;
      }

      const state = parsed as AgendaStateAttribute;

      // Only process if version matches or is newer
      if (state.v >= (lastVersionRef.current ?? 0)) {
        lastAttributeStateRef.current = agendaStateJson;
        lastVersionRef.current = state.v;

        // Update current item
        if (state.c) {
          setCurrentItemId(state.c);
        }

        // Update completed items and current item status
        if ((state.d && state.d.length > 0) || state.c) {
          setItemStatuses((prev) => {
            const updated = new Map(prev);
            // Mark completed items
            if (state.d) {
              state.d.forEach((id) => {
                updated.set(id, "completed");
              });
            }
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

        // Clear error state since we have valid data from agent
        // This allows UI to render recovered state instead of error message
        if (error) {
          setError(null);
          setRecoveredFromAgent(true);
        }

        // Track if we have agent state but no agenda definition yet
        // This enables UI to show "using agent state, awaiting definition" message
        if (!agenda && (state.c || (state.d && state.d.length > 0))) {
          setHasAgentStateOnly(true);
        }

        if (DEBUG) {
          console.log("[AgendaContext] Synced from agent attributes:", state);
        }
      }
    } catch (err) {
      if (DEBUG) {
        console.warn("[AgendaContext] Failed to parse agent attributes:", err);
      }
    }
  }, [
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
  ]);
}
