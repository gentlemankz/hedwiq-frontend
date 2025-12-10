/**
 * Agenda Types for Hedwiq Frontend
 *
 * These types support the Progressive Meeting Agenda feature, enabling
 * users to create agendas before meetings and track progress in real-time
 * with AI-powered topic detection.
 *
 * Key Features:
 * - Agenda creation in PreJoin screen
 * - Real-time progress tracking via LiveKit streams
 * - AI-powered topic completion detection
 * - Manual override capabilities
 */

/**
 * Status of an agenda item during the meeting.
 */
export type AgendaItemStatus = "pending" | "in_progress" | "completed";

/**
 * Single agenda item created by user.
 */
export interface AgendaItem {
  /** Unique identifier for this item */
  id: string;
  /** Title of the agenda item */
  title: string;
  /** Optional description providing more context */
  description?: string;
  /** Estimated duration in minutes */
  estimatedMinutes?: number;
  /** Optional presenter/leader name */
  leadBy?: string;
  /** Order in agenda (0-indexed) */
  order: number;
}

/**
 * Agenda item with progress tracking state.
 * Extends base AgendaItem with runtime status information.
 */
export interface AgendaItemProgress extends AgendaItem {
  /** Current status of this item */
  status: AgendaItemStatus;
  /** Unix timestamp when discussion started (milliseconds) */
  startedAt?: number;
  /** Unix timestamp when marked complete (milliseconds) */
  completedAt?: number;
  /** Actual duration in minutes (calculated from startedAt/completedAt) */
  actualMinutes?: number;
}

/**
 * Full agenda with progress tracking.
 * Represents the complete state of a meeting's agenda.
 */
export interface Agenda {
  /** Unique identifier for this agenda */
  id: string;
  /** Room ID this agenda belongs to */
  roomId: string;
  /** List of agenda items with progress state */
  items: AgendaItemProgress[];
  /** Currently active item index (-1 if not started) */
  currentItemIndex: number;
  /** Unix timestamp when meeting started (milliseconds) */
  meetingStartedAt?: number;
  /** User ID who created the agenda */
  createdBy: string;
}

/**
 * Payload sent to agent when joining with an agenda.
 * This is the initial agenda data without progress state.
 */
export interface AgendaPayload {
  type: "agenda_init";
  agenda: {
    id: string;
    roomId: string;
    items: AgendaItem[];
  };
}

/**
 * Type of progress update event from the agent.
 */
export type AgendaProgressType =
  | "topic_started"
  | "topic_completed"
  | "topic_change"
  | "agenda_complete";

/**
 * Progress update from agent.
 * Sent via LiveKit text stream when topic progression is detected.
 */
export interface AgendaProgressPayload {
  /** Type of progress update */
  type: AgendaProgressType;
  /** ID of the agenda this update refers to */
  agendaId: string;
  /** Index of the affected item */
  itemIndex: number;
  /** New status after this update */
  status: AgendaItemStatus;
  /** Confidence score (0-1) for AI-detected changes */
  confidence: number;
  /** Brief explanation of why the change was detected */
  reason?: string;
  /** Transcript segment that triggered the change */
  transcriptRef?: string;
  /** Unix timestamp of this update (milliseconds) */
  timestamp: number;
}

/**
 * Topic change event for display in transcription.
 * Used to show dividers when topics change.
 */
export interface TopicChangeEvent {
  /** Unique identifier for this event */
  id: string;
  /** Item index transitioning from (-1 if starting first topic) */
  fromItemIndex: number;
  /** Item index transitioning to */
  toItemIndex: number;
  /** Unix timestamp of the change (milliseconds) */
  timestamp: number;
  /** Transcript segment where change occurred */
  transcriptRef: string;
}

/**
 * Configuration for agenda item status display.
 */
export interface AgendaStatusConfig {
  /** Lucide icon name */
  icon: string;
  /** Human-readable label */
  label: string;
  /** Text color class */
  color: string;
  /** Background color class */
  bgColor: string;
}

/**
 * Configuration mapping for agenda item statuses.
 * Used for consistent styling across components.
 */
export const AGENDA_STATUS_CONFIG: Record<AgendaItemStatus, AgendaStatusConfig> = {
  pending: {
    icon: "Circle",
    label: "Pending",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
  },
  in_progress: {
    icon: "Play",
    label: "In Progress",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
  },
  completed: {
    icon: "CheckCircle",
    label: "Completed",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/50",
  },
};

/**
 * Agenda feature constants.
 * Configuration limits and defaults for the agenda feature.
 */
export const AGENDA_CONSTANTS = {
  /** Maximum number of agenda items allowed */
  MAX_AGENDA_ITEMS: 10,
  /** Maximum title length in characters */
  MAX_TITLE_LENGTH: 100,
  /** Maximum description length in characters */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Default estimated minutes per item */
  DEFAULT_ITEM_MINUTES: 10,
  /** Maximum estimated minutes per item */
  MAX_ITEM_MINUTES: 120,
  /** Sidebar width with agenda panel (pixels) */
  SIDEBAR_WIDTH: 600,
  /** Agenda panel width within sidebar (pixels) */
  AGENDA_PANEL_WIDTH: 200,
  /** Heartbeat interval for state sync (milliseconds) */
  HEARTBEAT_INTERVAL_MS: 30000,
} as const;

/**
 * LiveKit topic constants for agenda communication.
 */
export const AGENDA_TOPICS = {
  /** Topic for sending agenda to agent (frontend -> agent) */
  AGENDA_INIT: "hedwiq.agenda",
  /** Topic for receiving progress updates (agent -> frontend) */
  AGENDA_PROGRESS: "hedwiq.agenda_progress",
} as const;
