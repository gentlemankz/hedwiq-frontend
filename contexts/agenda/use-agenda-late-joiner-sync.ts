"use client";

/**
 * Hook for late joiner sync (DEPRECATED - Agent is now hidden)
 *
 * IMPORTANT: The Hedwiq agent is now a hidden participant and does NOT appear
 * in remoteParticipants. This hook is kept as a no-op placeholder for backwards
 * compatibility and potential future use.
 *
 * Late joiner sync is now handled via:
 * 1. API fetch in use-agenda-api.ts (primary method)
 * 2. LiveKit text streams (real-time updates) which work regardless of agent visibility
 *
 * The agent still attempts to set participant attributes, but this may fail silently
 * for hidden participants. This is expected behavior.
 */

import type { MutableRefObject } from "react";
import type { RemoteParticipant } from "livekit-client";
import type { AgendaWithItems, AgendaItemStatus } from "./types";

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
 * Hook that handles late joiner sync from agent attributes (NO-OP)
 *
 * This hook is a no-op placeholder because the Hedwiq agent is now a hidden
 * participant and does not appear in remoteParticipants.
 *
 * Late joiner sync flow:
 * 1. Late joiner connects to room
 * 2. use-agenda-api.ts fetches current agenda state from API
 * 3. use-agenda-livekit.ts subscribes to real-time updates via text streams
 * 4. Both methods work regardless of agent visibility
 *
 * @see use-agenda-api.ts for API-based late joiner sync
 * @see use-agenda-livekit.ts for real-time stream updates
 */
export function useAgendaLateJoinerSync({
  // Props kept for interface compatibility - not used since agent is hidden
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiLoadComplete,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  remoteParticipants,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  agenda,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lastVersionRef,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setCurrentItemId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setItemStatuses,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setIsMeetingStarted,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setError,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setRecoveredFromAgent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setHasAgentStateOnly,
}: UseAgendaLateJoinerSyncProps) {
  // NO-OP: Agent is hidden and does not appear in remoteParticipants
  // Late joiner sync is handled via API fetch (use-agenda-api.ts)
  // Real-time updates come via LiveKit text streams (use-agenda-livekit.ts)
}
