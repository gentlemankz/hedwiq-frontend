/**
 * Meeting Validation Utilities
 *
 * Centralized validation logic for meetings.
 * Used by API routes AND frontend components to ensure consistent validation.
 */

import { MEETING_LIMITS, type MeetingType, type MeetingStatus, type MeetingSettings } from "@/types/meeting";
import { TEMPLATE_LIMITS } from "@/types/template";

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Field-level validation errors for form display.
 */
export interface MeetingFieldErrors {
  title?: string;
  description?: string;
  scheduledAt?: string;
  durationMinutes?: string;
  timezone?: string;
}

// ============================================================================
// Meeting Validation
// ============================================================================

/**
 * Valid meeting types.
 */
const VALID_MEETING_TYPES: MeetingType[] = ["instant", "scheduled"];

/**
 * Valid meeting statuses.
 */
const VALID_MEETING_STATUSES: MeetingStatus[] = ["scheduled", "live", "ended", "cancelled"];

/**
 * Validates a meeting type.
 */
export function validateMeetingType(type: unknown): ValidationResult {
  if (typeof type !== "string") {
    return { isValid: false, error: "type must be a string" };
  }
  if (!VALID_MEETING_TYPES.includes(type as MeetingType)) {
    return { isValid: false, error: "type must be 'instant' or 'scheduled'" };
  }
  return { isValid: true };
}

/**
 * Validates a meeting status.
 */
export function validateMeetingStatus(status: unknown): ValidationResult {
  if (typeof status !== "string") {
    return { isValid: false, error: "status must be a string" };
  }
  if (!VALID_MEETING_STATUSES.includes(status as MeetingStatus)) {
    return { isValid: false, error: "status must be 'scheduled', 'live', 'ended', or 'cancelled'" };
  }
  return { isValid: true };
}

/**
 * Validates a meeting title.
 */
export function validateMeetingTitle(title: unknown): ValidationResult {
  if (typeof title !== "string") {
    return { isValid: false, error: "title must be a string" };
  }

  const trimmed = title.trim();
  if (trimmed.length < MEETING_LIMITS.MIN_TITLE_LENGTH) {
    return { isValid: false, error: "title is required" };
  }
  if (trimmed.length > MEETING_LIMITS.MAX_TITLE_LENGTH) {
    return {
      isValid: false,
      error: `title must be ${MEETING_LIMITS.MAX_TITLE_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a meeting description.
 */
export function validateMeetingDescription(description: unknown): ValidationResult {
  if (description === undefined || description === null || description === "") {
    return { isValid: true }; // Optional field
  }

  if (typeof description !== "string") {
    return { isValid: false, error: "description must be a string" };
  }

  if (description.length > MEETING_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return {
      isValid: false,
      error: `description must be ${MEETING_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a scheduled time.
 */
export function validateScheduledAt(
  scheduledAt: unknown,
  required = false
): ValidationResult & { parsedDate?: Date } {
  if (scheduledAt === undefined || scheduledAt === null || scheduledAt === "") {
    if (required) {
      return { isValid: false, error: "scheduledAt is required for scheduled meetings" };
    }
    return { isValid: true };
  }

  if (typeof scheduledAt !== "string") {
    return { isValid: false, error: "scheduledAt must be an ISO date string" };
  }

  const date = new Date(scheduledAt);
  if (isNaN(date.getTime())) {
    return { isValid: false, error: "scheduledAt must be a valid ISO date string" };
  }

  // Check if date is in the past (with 1 minute buffer)
  const now = new Date();
  now.setMinutes(now.getMinutes() - 1);
  if (date < now) {
    return { isValid: false, error: "scheduledAt cannot be in the past" };
  }

  return { isValid: true, parsedDate: date };
}

/**
 * Validates meeting duration.
 */
export function validateDurationMinutes(duration: unknown): ValidationResult {
  if (duration === undefined || duration === null) {
    return { isValid: true }; // Optional, will use default
  }

  if (typeof duration !== "number" || isNaN(duration)) {
    return { isValid: false, error: "durationMinutes must be a number" };
  }

  if (duration < MEETING_LIMITS.MIN_DURATION_MINUTES) {
    return {
      isValid: false,
      error: `durationMinutes must be at least ${MEETING_LIMITS.MIN_DURATION_MINUTES} minutes`,
    };
  }

  if (duration > MEETING_LIMITS.MAX_DURATION_MINUTES) {
    return {
      isValid: false,
      error: `durationMinutes must be ${MEETING_LIMITS.MAX_DURATION_MINUTES} minutes or less`,
    };
  }

  return { isValid: true };
}

/**
 * Folder ID validation regex.
 * Format: folder-{8 char userId prefix}-{base36 timestamp}-{6 alphanumeric}
 * Note: Case-insensitive to support existing folders that may have uppercase userId prefixes.
 */
const FOLDER_ID_REGEX = /^folder-[a-z0-9]{8}-[a-z0-9]{7,10}-[a-z0-9]{6}$/i;

/**
 * Maximum folder ID length to prevent abuse.
 */
const MAX_FOLDER_ID_LENGTH = 40;

/**
 * Validates a folder ID (optional field).
 * Accepts null to clear the folder assignment.
 */
export function validateFolderId(folderId: unknown): ValidationResult {
  // Allow undefined, null, or empty string (clearing the folder)
  if (folderId === undefined || folderId === null || folderId === "") {
    return { isValid: true };
  }

  if (typeof folderId !== "string") {
    return { isValid: false, error: "folderId must be a string or null" };
  }

  if (folderId.length > MAX_FOLDER_ID_LENGTH) {
    return { isValid: false, error: "Invalid folder ID" };
  }

  if (!FOLDER_ID_REGEX.test(folderId)) {
    return { isValid: false, error: "Invalid folder ID format" };
  }

  return { isValid: true };
}

// ============================================================================
// Template-Related Validation
// ============================================================================

/**
 * Template ID validation regex.
 * Format: tpl-{base36 timestamp (8-9 chars)}-{6 alphanumeric chars}
 */
const TEMPLATE_ID_REGEX = /^tpl-[a-z0-9]{8,9}-[a-z0-9]{6}$/;

/**
 * Maximum template ID length to prevent abuse.
 */
const MAX_TEMPLATE_ID_LENGTH = 24;

/**
 * Maximum length for planning answer values.
 * Should be generous but bounded to prevent abuse.
 */
const MAX_PLANNING_ANSWER_LENGTH = 2000;

/**
 * Maximum number of planning answers.
 */
const MAX_PLANNING_ANSWERS = TEMPLATE_LIMITS.MAX_PLANNING_QUESTIONS;

/**
 * Validates a template ID (optional field).
 */
export function validateTemplateId(templateId: unknown): ValidationResult {
  // Allow undefined, null, or empty string (no template)
  if (templateId === undefined || templateId === null || templateId === "") {
    return { isValid: true };
  }

  if (typeof templateId !== "string") {
    return { isValid: false, error: "templateId must be a string" };
  }

  if (templateId.length > MAX_TEMPLATE_ID_LENGTH) {
    return { isValid: false, error: "Invalid template ID" };
  }

  if (!TEMPLATE_ID_REGEX.test(templateId)) {
    return { isValid: false, error: "Invalid template ID format" };
  }

  return { isValid: true };
}

/**
 * Validates a meeting goal (optional field).
 * Uses same length limit as template description.
 */
export function validateMeetingGoal(meetingGoal: unknown): ValidationResult {
  if (meetingGoal === undefined || meetingGoal === null || meetingGoal === "") {
    return { isValid: true }; // Optional field
  }

  if (typeof meetingGoal !== "string") {
    return { isValid: false, error: "meetingGoal must be a string" };
  }

  if (meetingGoal.length > TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return {
      isValid: false,
      error: `meetingGoal must be ${TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates planning answers (optional field).
 * Must be an object with string keys and string values.
 */
export function validatePlanningAnswers(planningAnswers: unknown): ValidationResult {
  if (planningAnswers === undefined || planningAnswers === null) {
    return { isValid: true }; // Optional field
  }

  if (typeof planningAnswers !== "object" || Array.isArray(planningAnswers)) {
    return { isValid: false, error: "planningAnswers must be an object" };
  }

  const entries = Object.entries(planningAnswers as Record<string, unknown>);

  if (entries.length > MAX_PLANNING_ANSWERS) {
    return {
      isValid: false,
      error: `planningAnswers cannot have more than ${MAX_PLANNING_ANSWERS} entries`,
    };
  }

  for (const [key, value] of entries) {
    // Validate key (question ID) - should be a reasonable string
    if (typeof key !== "string" || key.length === 0 || key.length > 100) {
      return { isValid: false, error: "Invalid planning answer key" };
    }

    // Validate value (answer) - must be a string with length limit
    if (typeof value !== "string") {
      return { isValid: false, error: "Planning answer values must be strings" };
    }

    if (value.length > MAX_PLANNING_ANSWER_LENGTH) {
      return {
        isValid: false,
        error: `Planning answers must be ${MAX_PLANNING_ANSWER_LENGTH} characters or less`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Valid keys for MeetingSettings.
 */
const VALID_SETTINGS_KEYS: (keyof MeetingSettings)[] = [
  "transcriptionEnabled",
  "insightsEnabled",
  "recordingEnabled",
];

/**
 * Validates meeting settings (optional field).
 * Must be an object with only allowed boolean fields.
 */
export function validateMeetingSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { isValid: true }; // Optional field
  }

  if (typeof settings !== "object" || Array.isArray(settings)) {
    return { isValid: false, error: "settings must be an object" };
  }

  const settingsObj = settings as Record<string, unknown>;
  const keys = Object.keys(settingsObj);

  // Check for unknown keys
  for (const key of keys) {
    if (!VALID_SETTINGS_KEYS.includes(key as keyof MeetingSettings)) {
      return { isValid: false, error: `Unknown settings key: ${key}` };
    }
  }

  // Validate each value is a boolean
  for (const key of VALID_SETTINGS_KEYS) {
    const value = settingsObj[key];
    if (value !== undefined && typeof value !== "boolean") {
      return { isValid: false, error: `settings.${key} must be a boolean` };
    }
  }

  return { isValid: true };
}

/**
 * Validates a complete create meeting request.
 */
export function validateCreateMeetingRequest(body: {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  scheduledAt?: unknown;
  durationMinutes?: unknown;
  folderId?: unknown;
  templateId?: unknown;
  meetingGoal?: unknown;
  planningAnswers?: unknown;
  settings?: unknown;
}): ValidationResult & { parsedDate?: Date } {
  // Validate title (required)
  const titleValidation = validateMeetingTitle(body.title);
  if (!titleValidation.isValid) {
    return titleValidation;
  }

  // Validate description (optional)
  const descValidation = validateMeetingDescription(body.description);
  if (!descValidation.isValid) {
    return descValidation;
  }

  // Validate type (required)
  const typeValidation = validateMeetingType(body.type);
  if (!typeValidation.isValid) {
    return typeValidation;
  }

  // Validate scheduledAt (required for scheduled meetings)
  const isScheduled = body.type === "scheduled";
  const scheduledValidation = validateScheduledAt(body.scheduledAt, isScheduled);
  if (!scheduledValidation.isValid) {
    return scheduledValidation;
  }

  // Validate duration (optional)
  const durationValidation = validateDurationMinutes(body.durationMinutes);
  if (!durationValidation.isValid) {
    return durationValidation;
  }

  // Validate folderId (optional)
  const folderValidation = validateFolderId(body.folderId);
  if (!folderValidation.isValid) {
    return folderValidation;
  }

  // Validate templateId (optional)
  const templateIdValidation = validateTemplateId(body.templateId);
  if (!templateIdValidation.isValid) {
    return templateIdValidation;
  }

  // Validate meetingGoal (optional)
  const goalValidation = validateMeetingGoal(body.meetingGoal);
  if (!goalValidation.isValid) {
    return goalValidation;
  }

  // Validate planningAnswers (optional)
  const answersValidation = validatePlanningAnswers(body.planningAnswers);
  if (!answersValidation.isValid) {
    return answersValidation;
  }

  // Validate settings (optional)
  const settingsValidation = validateMeetingSettings(body.settings);
  if (!settingsValidation.isValid) {
    return settingsValidation;
  }

  return { isValid: true, parsedDate: scheduledValidation.parsedDate };
}

/**
 * Validates a partial update meeting request.
 */
export function validateUpdateMeetingRequest(body: {
  title?: unknown;
  description?: unknown;
  scheduledAt?: unknown;
  durationMinutes?: unknown;
  status?: unknown;
  folderId?: unknown;
}): ValidationResult & { parsedDate?: Date } {
  // Validate title if provided
  if (body.title !== undefined) {
    const titleValidation = validateMeetingTitle(body.title);
    if (!titleValidation.isValid) {
      return titleValidation;
    }
  }

  // Validate description if provided
  if (body.description !== undefined) {
    const descValidation = validateMeetingDescription(body.description);
    if (!descValidation.isValid) {
      return descValidation;
    }
  }

  // Validate scheduledAt if provided
  let parsedDate: Date | undefined;
  if (body.scheduledAt !== undefined) {
    const scheduledValidation = validateScheduledAt(body.scheduledAt, false);
    if (!scheduledValidation.isValid) {
      return scheduledValidation;
    }
    parsedDate = scheduledValidation.parsedDate;
  }

  // Validate duration if provided
  if (body.durationMinutes !== undefined) {
    const durationValidation = validateDurationMinutes(body.durationMinutes);
    if (!durationValidation.isValid) {
      return durationValidation;
    }
  }

  // Validate status if provided
  if (body.status !== undefined) {
    const statusValidation = validateMeetingStatus(body.status);
    if (!statusValidation.isValid) {
      return statusValidation;
    }
  }

  // Validate folderId if provided (can be null to clear)
  if (body.folderId !== undefined) {
    const folderValidation = validateFolderId(body.folderId);
    if (!folderValidation.isValid) {
      return folderValidation;
    }
  }

  return { isValid: true, parsedDate };
}

// ============================================================================
// Client-Side Field Validation (for React components)
// ============================================================================

/**
 * Validates a single meeting field.
 * Returns error message or undefined if valid.
 */
export function validateMeetingField(
  field: keyof MeetingFieldErrors,
  value: string | number | undefined | null
): string | undefined {
  switch (field) {
    case "title": {
      if (typeof value !== "string") return "Title is required";
      const trimmed = value.trim();
      if (trimmed.length < MEETING_LIMITS.MIN_TITLE_LENGTH) {
        return "Title is required";
      }
      if (trimmed.length > MEETING_LIMITS.MAX_TITLE_LENGTH) {
        return `Title must be ${MEETING_LIMITS.MAX_TITLE_LENGTH} characters or less`;
      }
      return undefined;
    }

    case "description": {
      if (value === undefined || value === null || value === "") {
        return undefined; // Optional field
      }
      if (typeof value !== "string") {
        return "Description must be text";
      }
      if (value.length > MEETING_LIMITS.MAX_DESCRIPTION_LENGTH) {
        return `Description must be ${MEETING_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
      }
      return undefined;
    }

    case "scheduledAt": {
      if (value === undefined || value === null || value === "") {
        return undefined; // Handled separately based on meeting type
      }
      if (typeof value !== "string") {
        return "Scheduled time must be a valid date";
      }
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return "Invalid date format";
      }
      if (date < new Date()) {
        return "Scheduled time cannot be in the past";
      }
      return undefined;
    }

    case "durationMinutes": {
      if (value === undefined || value === null || value === "") {
        return undefined; // Optional, will use default
      }
      const numValue = typeof value === "string" ? parseInt(value, 10) : value;
      if (typeof numValue !== "number" || isNaN(numValue)) {
        return "Duration must be a number";
      }
      if (numValue < MEETING_LIMITS.MIN_DURATION_MINUTES) {
        return `Duration must be at least ${MEETING_LIMITS.MIN_DURATION_MINUTES} minutes`;
      }
      if (numValue > MEETING_LIMITS.MAX_DURATION_MINUTES) {
        return `Duration must be ${MEETING_LIMITS.MAX_DURATION_MINUTES} minutes or less`;
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Validates all fields of a meeting at once.
 * Returns object with field-level errors for form display.
 */
export function getMeetingFieldErrors(input: {
  title?: string;
  description?: string;
  scheduledAt?: string;
  durationMinutes?: string | number;
}): MeetingFieldErrors {
  const errors: MeetingFieldErrors = {};

  const titleError = validateMeetingField("title", input.title);
  if (titleError) errors.title = titleError;

  const descError = validateMeetingField("description", input.description);
  if (descError) errors.description = descError;

  const scheduledError = validateMeetingField("scheduledAt", input.scheduledAt);
  if (scheduledError) errors.scheduledAt = scheduledError;

  const durationError = validateMeetingField("durationMinutes", input.durationMinutes);
  if (durationError) errors.durationMinutes = durationError;

  return errors;
}

/**
 * Check if there are any validation errors.
 */
export function hasMeetingFieldErrors(errors: MeetingFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ============================================================================
// Meeting ID Validation
// ============================================================================

/**
 * Meeting ID validation regex.
 * Format: mtg-{base36 timestamp (8-10 chars)}-{8 alphanumeric chars}
 * The timestamp is Date.now().toString(36) which produces 8-10 alphanumeric chars.
 */
export const MEETING_ID_REGEX = /^mtg-[a-z0-9]{8,10}-[a-z0-9]{8}$/;

/**
 * Maximum meeting ID length to prevent regex DoS.
 */
export const MAX_MEETING_ID_LENGTH = 28;

/**
 * Validate meeting ID format.
 */
export function isValidMeetingId(meetingId: unknown): meetingId is string {
  if (typeof meetingId !== "string") return false;
  if (!meetingId || meetingId.length > MAX_MEETING_ID_LENGTH) return false;
  return MEETING_ID_REGEX.test(meetingId);
}

/**
 * Validate meeting ID and return result with error message.
 */
export function validateMeetingId(meetingId: unknown): ValidationResult {
  if (!meetingId || typeof meetingId !== "string") {
    return { isValid: false, error: "Meeting ID is required" };
  }

  if (meetingId.length > MAX_MEETING_ID_LENGTH) {
    return { isValid: false, error: "Invalid meeting ID" };
  }

  if (!MEETING_ID_REGEX.test(meetingId)) {
    return { isValid: false, error: "Invalid meeting ID format" };
  }

  return { isValid: true };
}
