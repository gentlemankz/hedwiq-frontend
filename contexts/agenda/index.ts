/**
 * Agenda Context Module
 *
 * Barrel export for agenda context and related hooks.
 */

// Main exports
export { AgendaProvider, useAgendaContext } from "./agenda-context";

// Types
export type {
  AgendaContextValue,
  AgendaProviderProps,
  TextStreamReader,
  ParticipantInfo,
} from "./types";

// Re-export types from @/types/agenda for convenience
export type {
  AgendaWithItems,
  AgendaItem,
  AgendaItemStatus,
  AgendaProgressEvent,
  AgendaStateAttribute,
} from "./types";

// Constants (for external use if needed)
export {
  AGENT_IDENTITY_PREFIX,
  AGENDA_STATE_ATTRIBUTE_KEY,
  DEBUG,
  MAX_FETCH_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "./constants";

// Validators (for external use if needed)
export {
  isValidAgendaProgressEvent,
  isValidAgendaStateAttribute,
} from "./validators";
