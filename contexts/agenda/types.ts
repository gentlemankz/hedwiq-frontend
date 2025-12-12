/**
 * Types for Agenda Context
 *
 * Internal types used by the agenda context and its hooks.
 * Re-exports relevant types from @/types/agenda for convenience.
 */

import type {
  AgendaWithItems,
  AgendaItem,
  AgendaItemStatus,
  AgendaProgressEvent,
  AgendaStateAttribute,
} from "@/types/agenda";

// Re-export types for convenience
export type {
  AgendaWithItems,
  AgendaItem,
  AgendaItemStatus,
  AgendaProgressEvent,
  AgendaStateAttribute,
};

/**
 * Interface for the text stream reader from LiveKit
 */
export interface TextStreamReader {
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
export interface ParticipantInfo {
  identity: string;
}

/**
 * Context value for agenda
 */
export interface AgendaContextValue {
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
  /** Whether state was recovered from agent after API failure */
  recoveredFromAgent: boolean;
  /** Whether we have agent state (current item, completed items) but no agenda definition */
  hasAgentStateOnly: boolean;
}

/**
 * Props for the AgendaProvider component
 */
export interface AgendaProviderProps {
  children: React.ReactNode;
  /** Room ID for fetching agenda */
  roomId: string;
  /** Initial agenda version (for cache invalidation) */
  agendaVersion?: number;
}
