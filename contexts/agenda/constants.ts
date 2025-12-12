/**
 * Constants for Agenda Context
 *
 * Configuration values and constants used throughout the agenda context.
 */

/** Agent identity prefix for identifying the hedwiq agent */
export const AGENT_IDENTITY_PREFIX = "hedwiq";

/** Attribute key for agenda state in agent participant attributes */
export const AGENDA_STATE_ATTRIBUTE_KEY = "agendaState";

/** Enable debug logging (disabled in production) */
export const DEBUG = process.env.NODE_ENV === "development";

/** Maximum retry attempts for agenda fetch */
export const MAX_FETCH_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
export const RETRY_BASE_DELAY_MS = 1000;
