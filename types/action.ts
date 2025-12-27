/**
 * Action Types for Luframe Frontend
 *
 * These types match the backend action_classifier.py schema and are used
 * for real-time action display and classification.
 *
 * Actions are enhanced action_items with:
 * - Action type classification (email, task, calendar, manual)
 * - Extracted metadata (recipient hints, urgency, etc.)
 * - Status tracking through the action lifecycle
 */

import {
  Mail,
  Share2,
  CalendarPlus,
  ListTodo,
  Calendar,
  Hand,
  type LucideIcon,
} from "lucide-react";

// ============================================================================
// Constants
// ============================================================================

/**
 * Confidence threshold for displaying low-confidence indicators.
 * Actions/insights below this threshold show a warning.
 */
export const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Default confidence value when not provided.
 */
export const DEFAULT_CONFIDENCE = 0.8;

/**
 * Maximum number of actions to keep in memory.
 */
export const MAX_ACTIONS = 100;

// ============================================================================
// Types
// ============================================================================

/**
 * Classification of action items by execution type.
 * Determines the execution path for each action.
 */
export type ActionType =
  | "email_followup" // "send email", "follow up with", "email X about"
  | "email_share" // "share with", "send to", "forward to"
  | "email_schedule" // "schedule meeting with", "set up call"
  | "task_create" // "create task", "add to backlog"
  | "calendar_event" // "block time", "schedule", "remind me"
  | "manual"; // Default fallback for unclassified actions

/**
 * All valid action types for validation.
 */
export const VALID_ACTION_TYPES: ActionType[] = [
  "email_followup",
  "email_share",
  "email_schedule",
  "task_create",
  "calendar_event",
  "manual",
];

/**
 * Urgency level for actions.
 */
export type UrgencyLevel = "low" | "normal" | "high" | "critical";

/**
 * All valid urgency levels for validation.
 */
export const VALID_URGENCY_LEVELS: UrgencyLevel[] = [
  "low",
  "normal",
  "high",
  "critical",
];

/**
 * Status of an action through its lifecycle.
 */
export type ActionStatus =
  | "detected" // Just classified, not yet acted upon
  | "drafting" // Email draft being generated
  | "draft_ready" // Draft ready for user review
  | "sent" // Email sent or action executed
  | "rejected"; // User dismissed the action

/**
 * All valid action statuses for validation.
 */
export const VALID_ACTION_STATUSES: ActionStatus[] = [
  "detected",
  "drafting",
  "draft_ready",
  "sent",
  "rejected",
];

/**
 * Extracted metadata from action item for execution.
 * All fields are optional as not all actions have all metadata.
 */
export interface ActionMetadata {
  /** Potential email recipient (name/role mentioned) */
  recipientHint?: string;
  /** Potential email subject extracted from context */
  subjectHint?: string;
  /** Project or category hint for task creation */
  projectHint?: string;
  /** Person assigned to the task */
  assigneeHint?: string;
  /** Date/time reference for scheduling */
  datetimeHint?: string;
  /** Duration hint (e.g., '30 minutes', '1 hour') */
  durationHint?: string;
  /** Urgency level of the action */
  urgency: UrgencyLevel;
}

/**
 * Default metadata values.
 */
export const DEFAULT_ACTION_METADATA: ActionMetadata = {
  urgency: "normal",
};

/**
 * A classified action from the Luframe agent.
 * Extends action_item insights with classification and metadata.
 */
export interface ClassifiedAction {
  /** Unique action identifier */
  id: string;
  /** ID of the source action_item insight */
  originalInsightId: string;
  /** Action description content */
  content: string;
  /** Speaker identity token */
  speaker?: string;
  /** Speaker display name */
  speakerName?: string;
  /** Reference to transcript segment */
  transcriptRef?: string;
  /** Classification of action type */
  actionType: ActionType;
  /** Confidence in the classification (0.0-1.0) */
  classificationConfidence: number;
  /** Extracted metadata for execution */
  metadata: ActionMetadata;
  /** Whether this action requires email (email_* types) */
  requiresEmail: boolean;
  /** Current status in the action lifecycle */
  status: ActionStatus;
  /** When the action was detected (Unix timestamp ms) */
  timestamp: number;
  /** When classification completed (Unix timestamp ms) */
  classifiedAt: number;
}

// ============================================================================
// Icon Configuration (Centralized)
// ============================================================================

/**
 * Icon mapping for action types.
 * Centralized to avoid duplication across components.
 */
export const ACTION_ICONS: Record<string, LucideIcon> = {
  Mail,
  Share2,
  CalendarPlus,
  ListTodo,
  Calendar,
  Hand,
};

/**
 * Configuration for each action type including display properties.
 */
export interface ActionTypeConfig {
  /** Lucide icon name */
  icon: string;
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** Text color class */
  color: string;
  /** Background color class */
  bgColor: string;
  /** Badge color class */
  badgeColor: string;
}

/**
 * Configuration mapping for all action types.
 * Used for consistent styling across components.
 */
export const ACTION_TYPE_CONFIG: Record<ActionType, ActionTypeConfig> = {
  email_followup: {
    icon: "Mail",
    label: "Email Follow-up",
    description: "Send a follow-up email",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  email_share: {
    icon: "Share2",
    label: "Share via Email",
    description: "Share information via email",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/50",
    badgeColor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
  email_schedule: {
    icon: "CalendarPlus",
    label: "Schedule Meeting",
    description: "Schedule a meeting via email",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/50",
    badgeColor:
      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  task_create: {
    icon: "ListTodo",
    label: "Create Task",
    description: "Create a task or ticket",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/50",
    badgeColor:
      "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  calendar_event: {
    icon: "Calendar",
    label: "Calendar Event",
    description: "Block time or set reminder",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/50",
    badgeColor:
      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  manual: {
    icon: "Hand",
    label: "Manual Action",
    description: "Requires manual handling",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-950/50",
    badgeColor: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
  },
};

/**
 * Urgency level configuration for display.
 */
export const URGENCY_CONFIG: Record<
  UrgencyLevel,
  { label: string; color: string }
> = {
  low: { label: "Low", color: "text-gray-500" },
  normal: { label: "Normal", color: "text-blue-500" },
  high: { label: "High", color: "text-orange-500" },
  critical: { label: "Critical", color: "text-red-500" },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Helper to check if an action type is email-related.
 */
export function isEmailAction(actionType: ActionType): boolean {
  return ["email_followup", "email_share", "email_schedule"].includes(
    actionType
  );
}

/**
 * Order of action types for display purposes.
 * Prioritizes email actions (most common automated action).
 */
export const ACTION_TYPE_ORDER: ActionType[] = [
  "email_followup",
  "email_share",
  "email_schedule",
  "calendar_event",
  "task_create",
  "manual",
];

// ============================================================================
// Parsing Utilities (used by ActionsContext)
// ============================================================================

/**
 * Parse action type from string, with fallback to manual.
 */
export function parseActionType(value: string | undefined | null): ActionType {
  if (!value) return "manual";
  const normalized = value.toLowerCase().trim();
  return VALID_ACTION_TYPES.includes(normalized as ActionType)
    ? (normalized as ActionType)
    : "manual";
}

/**
 * Parse urgency level from string, with fallback to normal.
 */
export function parseUrgencyLevel(
  value: string | undefined | null
): UrgencyLevel {
  if (!value) return "normal";
  const normalized = value.toLowerCase().trim();
  return VALID_URGENCY_LEVELS.includes(normalized as UrgencyLevel)
    ? (normalized as UrgencyLevel)
    : "normal";
}

/**
 * Parse action status from string, with fallback to detected.
 */
export function parseActionStatus(
  value: string | undefined | null
): ActionStatus {
  if (!value) return "detected";
  const normalized = value.toLowerCase().trim();
  return VALID_ACTION_STATUSES.includes(normalized as ActionStatus)
    ? (normalized as ActionStatus)
    : "detected";
}

/**
 * Normalize timestamp to milliseconds.
 * Handles both seconds and milliseconds from the agent.
 * Returns current time for invalid/missing timestamps.
 */
export function normalizeTimestamp(ts: number | undefined | null): number {
  // Treat 0, undefined, null as "use current time"
  if (ts === undefined || ts === null || ts === 0) {
    return Date.now();
  }
  // If timestamp is less than 1e12, it's in seconds (Unix timestamp)
  // Convert to milliseconds
  return ts < 1e12 ? ts * 1000 : ts;
}

/**
 * Normalize confidence from integer (0-100) to float (0.0-1.0).
 * Handles both formats from different sources.
 */
export function normalizeConfidence(value: number | undefined | null): number {
  if (value === undefined || value === null) {
    return DEFAULT_CONFIDENCE;
  }
  // If value is > 1, assume it's a percentage (0-100) and convert
  if (value > 1) {
    return value / 100;
  }
  return value;
}

/**
 * Validate that a string is non-empty after trimming.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Format timestamp for display (HH:MM format).
 */
export function formatActionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get the icon component for an action type.
 */
export function getActionIcon(actionType: ActionType): LucideIcon | undefined {
  const config = ACTION_TYPE_CONFIG[actionType];
  return ACTION_ICONS[config.icon];
}
