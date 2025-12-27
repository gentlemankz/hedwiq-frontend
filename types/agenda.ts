/**
 * Agenda Types for Luframe Frontend
 *
 * These types support the Meeting Agenda Builder and Automatic Progress feature.
 * Used for agenda creation in PreJoin and real-time progress tracking during meetings.
 *
 * Key Features:
 * - Draft agenda creation in PreJoin screen
 * - Automatic topic detection by AI agent
 * - Real-time progress updates via LiveKit
 * - Late joiner sync via participant attributes
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * Overall agenda status.
 * - draft: Being created/edited in PreJoin (editable)
 * - active: Meeting in progress (locked, tracking progress)
 * - completed: Meeting ended (all items processed)
 */
export type AgendaStatus = "draft" | "active" | "completed";

/**
 * Individual agenda item status.
 * - pending: Not yet started
 * - in_progress: Currently being discussed
 * - completed: Discussion finished
 * - skipped: Intentionally skipped
 */
export type AgendaItemStatus = "pending" | "in_progress" | "completed" | "skipped";

// ============================================================================
// Core Types
// ============================================================================

/**
 * An individual agenda item (topic).
 * Matches the database schema from `agenda_item` table.
 */
export interface AgendaItem {
  /** Unique item identifier (e.g., item-{agendaId}-{index}) */
  id: string;
  /** Parent agenda ID */
  agendaId: string;
  /** Topic title (required) */
  title: string;
  /** Topic description (optional) */
  description?: string | null;
  /** Estimated duration in minutes (optional) */
  estimatedDuration?: number | null;
  /** Assigned presenter/leader (optional) */
  presenter?: string | null;
  /** Display order (0-based) */
  orderIndex: number;
  /** Item status */
  status: AgendaItemStatus;
  /** Actual start time (ISO string or timestamp) */
  startedAt?: string | number | null;
  /** Actual end time (ISO string or timestamp) */
  completedAt?: string | number | null;
  /** Actual duration in seconds (calculated) */
  actualDuration?: number | null;
  /** Transcript segment ID when topic started */
  startTranscriptRef?: string | null;
  /** Transcript segment ID when topic ended */
  endTranscriptRef?: string | null;
  /** Creation timestamp */
  createdAt?: string | number;
  /** Last update timestamp */
  updatedAt?: string | number;
}

/**
 * A meeting agenda with all its items.
 * Matches the database schema from `agenda` table.
 */
export interface Agenda {
  /** Unique agenda identifier (e.g., agenda-{roomId}-{timestamp}) */
  id: string;
  /** LiveKit room ID */
  roomId: string;
  /** User ID who created the agenda */
  createdBy: string;
  /**
   * Meeting ID - links agenda to a scheduled meeting (optional).
   * When set, this agenda was created during meeting scheduling.
   */
  meetingId?: string | null;
  /** Meeting name/title (e.g., "Marketing Team. Production") */
  meetingName?: string | null;
  /** Scheduled meeting time (ISO string or Date) */
  scheduledAt?: string | Date | null;
  /** Total number of items */
  itemCount: number;
  /** Overall status */
  status: AgendaStatus;
  /** Current active item index (0-based, null if not started) */
  currentItemIndex: number | null;
  /** Version number for cache invalidation */
  version: number;
  /** Meeting start time (ISO string) */
  meetingStartedAt?: string | null;
  /** Meeting end time (ISO string) */
  meetingEndedAt?: string | null;
  /** Creation timestamp */
  createdAt?: string | number;
  /** Last update timestamp */
  updatedAt?: string | number;
}

/**
 * Agenda with its items included.
 * Used for API responses and context state.
 */
export interface AgendaWithItems extends Agenda {
  /** Agenda items ordered by orderIndex */
  items: AgendaItem[];
}

// ============================================================================
// Draft Types (PreJoin)
// ============================================================================

/**
 * A draft agenda item before saving to database.
 * Used in the PreJoin agenda builder.
 */
export interface DraftAgendaItem {
  /** Temporary client-side ID (e.g., draft-{timestamp}-{index}) */
  id: string;
  /** Topic title (required) */
  title: string;
  /** Topic description (optional) */
  description?: string;
  /** Estimated duration in minutes (optional) */
  estimatedDuration?: number;
  /** Assigned presenter/leader (optional) */
  presenter?: string;
}

/**
 * Input for creating/updating agenda items.
 */
export interface AgendaItemInput {
  title: string;
  description?: string;
  estimatedDuration?: number;
  presenter?: string;
}

// ============================================================================
// LiveKit Event Types
// ============================================================================

/**
 * Base type for agenda progress events sent via LiveKit.
 */
export interface AgendaProgressEventBase {
  /** Event timestamp (Unix milliseconds) */
  timestamp: number;
}

/**
 * Event: Meeting started (first topic begins).
 */
export interface MeetingStartedEvent extends AgendaProgressEventBase {
  type: "meeting_started";
}

/**
 * Event: Meeting ended (all topics completed or skipped).
 */
export interface MeetingEndedEvent extends AgendaProgressEventBase {
  type: "meeting_ended";
}

/**
 * Event: A topic has started.
 */
export interface TopicStartedEvent extends AgendaProgressEventBase {
  type: "topic_started";
  /** ID of the agenda item */
  itemId: string;
  /** Index of the item (0-based) */
  itemIndex: number;
  /** Reference to transcript segment */
  transcriptRef?: string;
  /** AI confidence in this detection (0.0-1.0) */
  confidence: number;
}

/**
 * Event: A topic has completed.
 */
export interface TopicCompletedEvent extends AgendaProgressEventBase {
  type: "topic_completed";
  /** ID of the agenda item */
  itemId: string;
  /** Index of the item (0-based) */
  itemIndex: number;
  /** Reference to transcript segment */
  transcriptRef?: string;
  /** AI confidence in this detection (0.0-1.0) */
  confidence: number;
  /** Actual duration in seconds */
  actualDuration: number;
}

/**
 * Event: A topic was skipped.
 */
export interface TopicSkippedEvent extends AgendaProgressEventBase {
  type: "topic_skipped";
  /** ID of the agenda item */
  itemId: string;
  /** Index of the item (0-based) */
  itemIndex: number;
  /** Reason for skipping */
  reason: string;
}

/**
 * Event: Full agenda sync for late joiners.
 */
export interface AgendaSyncEvent extends AgendaProgressEventBase {
  type: "agenda_sync";
  /** Full agenda state */
  agenda: AgendaWithItems;
  /** Current item index */
  currentItemIndex: number | null;
}

/**
 * Union type for all agenda progress events.
 */
export type AgendaProgressEvent =
  | MeetingStartedEvent
  | MeetingEndedEvent
  | TopicStartedEvent
  | TopicCompletedEvent
  | TopicSkippedEvent
  | AgendaSyncEvent;

// ============================================================================
// Participant Attribute Types (Late Joiner Sync)
// ============================================================================

/**
 * Compact agenda state stored in agent participant attributes.
 * Used for late joiner sync without relying on text stream replay.
 *
 * Fields are abbreviated to minimize size:
 * - v: version
 * - c: current item ID
 * - d: done (completed) item IDs
 * - s: started timestamp
 */
export interface AgendaStateAttribute {
  /** Version for cache invalidation */
  v: number;
  /** Current item ID (null if not started) */
  c: string | null;
  /** Completed item IDs */
  d: string[];
  /** Meeting started timestamp (Unix seconds) */
  s: number | null;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Request body for PUT /api/rooms/[roomId]/agenda (create/update draft).
 */
export interface AgendaUpsertRequest {
  items: AgendaItemInput[];
  /** Meeting name/title (optional) */
  meetingName?: string;
  /** Scheduled meeting time (ISO string, optional) */
  scheduledAt?: string;
}

/**
 * Response from GET /api/rooms/[roomId]/agenda.
 */
export interface AgendaGetResponse {
  agenda: AgendaWithItems | null;
}

/**
 * Response from PUT /api/rooms/[roomId]/agenda.
 */
export interface AgendaUpsertResponse {
  agenda: AgendaWithItems;
}

/**
 * Response from POST /api/rooms/[roomId]/agenda/publish.
 */
export interface AgendaPublishResponse {
  agenda: AgendaWithItems;
}

/**
 * Request body for PATCH /api/rooms/[roomId]/agenda/items/[itemId].
 */
export interface AgendaItemUpdateRequest {
  title?: string;
  description?: string;
  estimatedDuration?: number;
  presenter?: string;
  orderIndex?: number;
}

/**
 * Response from PATCH /api/rooms/[roomId]/agenda/items/[itemId].
 */
export interface AgendaItemUpdateResponse {
  item: AgendaItem;
}

/**
 * Request body for POST /api/rooms/[roomId]/agenda/reorder.
 */
export interface AgendaReorderRequest {
  /** Item IDs in desired order */
  itemIds: string[];
}

/**
 * Response from POST /api/rooms/[roomId]/agenda/reorder.
 */
export interface AgendaReorderResponse {
  items: AgendaItem[];
}

/**
 * Request body for POST /api/rooms/[roomId]/agenda/items/[itemId]/status.
 */
export interface AgendaItemStatusRequest {
  status: "in_progress" | "completed" | "skipped";
}

/**
 * Response from POST /api/rooms/[roomId]/agenda/items/[itemId]/status.
 */
export interface AgendaItemStatusResponse {
  item: AgendaItem;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Validation and limit constants for agendas.
 */
export const AGENDA_LIMITS = {
  /** Maximum agenda items per meeting */
  MAX_ITEMS: 20,
  /** Minimum title length */
  MIN_TITLE_LENGTH: 1,
  /** Maximum title length */
  MAX_TITLE_LENGTH: 100,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Maximum estimated duration in minutes */
  MAX_DURATION_MINUTES: 120,
  /** Minimum estimated duration in minutes */
  MIN_DURATION_MINUTES: 1,
  /** Maximum presenter name length */
  MAX_PRESENTER_LENGTH: 50,
  /** Maximum meeting name length */
  MAX_MEETING_NAME_LENGTH: 100,
} as const;

/**
 * LiveKit topic name for agenda events.
 */
export const AGENDA_TOPIC = "luframe.agenda" as const;
