/**
 * Meeting Types for Luframe Frontend
 *
 * These types support the Meeting Scheduling feature.
 * Used for creating, listing, and managing meetings.
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * Meeting type.
 * - instant: Started immediately, no scheduled time
 * - scheduled: Has a scheduled start time
 */
export type MeetingType = "instant" | "scheduled";

/**
 * Meeting status.
 * - scheduled: Future meeting, not started
 * - live: Meeting in progress
 * - ended: Meeting completed
 * - cancelled: Meeting cancelled
 */
export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

// ============================================================================
// Core Types
// ============================================================================

/**
 * Meeting settings configuration.
 */
export interface MeetingSettings {
  transcriptionEnabled?: boolean;
  insightsEnabled?: boolean;
  recordingEnabled?: boolean;
}

/**
 * A meeting record from the database.
 */
export interface Meeting {
  /** Unique meeting identifier (e.g., mtg-{timestamp}-{random}) */
  id: string;
  /** LiveKit room ID */
  roomId: string;
  /** Host user ID */
  hostId: string;
  /** Folder ID for organization (null if not assigned) */
  folderId: string | null;
  /** Template ID used to create this meeting (null if created without template) */
  templateId: string | null;
  /** Meeting goal/purpose (may come from template or be custom) */
  meetingGoal: string | null;
  /** Answers to planning questions (questionId -> answer) */
  planningAnswers: Record<string, string>;
  /** Meeting title */
  title: string;
  /** Meeting description (optional) */
  description?: string | null;
  /** Meeting type */
  type: MeetingType;
  /** Meeting status */
  status: MeetingStatus;
  /** Scheduled start time (ISO string, null for instant) */
  scheduledAt?: string | null;
  /** Expected duration in minutes */
  durationMinutes: number;
  /** User's timezone */
  timezone?: string | null;
  /** Actual start time (ISO string) */
  startedAt?: string | null;
  /** Actual end time (ISO string) */
  endedAt?: string | null;
  /** Meeting settings */
  settings?: MeetingSettings | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Meeting with host user information.
 */
export interface MeetingWithHost extends Meeting {
  host: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for creating a meeting.
 */
export interface CreateMeetingRequest {
  /** Meeting title */
  title: string;
  /** Meeting description (optional) */
  description?: string;
  /** Meeting type */
  type: MeetingType;
  /** Scheduled start time (ISO string, required for scheduled meetings) */
  scheduledAt?: string;
  /** Expected duration in minutes */
  durationMinutes?: number;
  /** User's timezone */
  timezone?: string;
  /** Meeting settings */
  settings?: MeetingSettings;
  /** Optional folder ID for organization */
  folderId?: string;
}

/**
 * Request body for updating a meeting.
 */
export interface UpdateMeetingRequest {
  /** Meeting title */
  title?: string;
  /** Meeting description */
  description?: string;
  /** Scheduled start time (ISO string) */
  scheduledAt?: string;
  /** Expected duration in minutes */
  durationMinutes?: number;
  /** User's timezone */
  timezone?: string;
  /** Meeting status */
  status?: MeetingStatus;
  /** Meeting settings */
  settings?: MeetingSettings;
  /** Optional folder ID for organization */
  folderId?: string | null;
}

/**
 * Response from creating a meeting.
 */
export interface CreateMeetingResponse {
  meeting: Meeting;
}

/**
 * Response from getting a single meeting.
 */
export interface GetMeetingResponse {
  meeting: Meeting | null;
}

/**
 * Response from listing meetings.
 */
export interface ListMeetingsResponse {
  meetings: Meeting[];
}

/**
 * Response from updating a meeting.
 */
export interface UpdateMeetingResponse {
  meeting: Meeting;
}

/**
 * Response from deleting a meeting.
 */
export interface DeleteMeetingResponse {
  success: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Validation and limit constants for meetings.
 */
export const MEETING_LIMITS = {
  /** Minimum title length */
  MIN_TITLE_LENGTH: 1,
  /** Maximum title length */
  MAX_TITLE_LENGTH: 200,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 2000,
  /** Minimum duration in minutes */
  MIN_DURATION_MINUTES: 5,
  /** Maximum duration in minutes (8 hours) */
  MAX_DURATION_MINUTES: 480,
  /** Default duration in minutes */
  DEFAULT_DURATION_MINUTES: 60,
} as const;

/**
 * Duration options for meeting scheduling UI.
 */
export const DURATION_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
] as const;
