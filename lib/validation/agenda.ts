/**
 * Agenda Validation Utilities
 *
 * Centralized validation logic for agenda items.
 * Used by API routes AND frontend components to ensure consistent validation.
 *
 * Usage:
 * - API routes: validateAgendaItemInput(), validateAgendaItems()
 * - Frontend components: validateAgendaField(), getAgendaFieldErrors()
 */

import { AGENDA_LIMITS, type AgendaItemInput } from "@/types/agenda";

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
export interface AgendaItemFieldErrors {
  title?: string;
  description?: string;
  estimatedDuration?: string;
  presenter?: string;
}

// ============================================================================
// Agenda Item Validation
// ============================================================================

/**
 * Validates a complete agenda item input (for creation/bulk update).
 * Returns error message or null if valid.
 *
 * @param item - The agenda item input to validate
 * @param index - Optional item index for error messages (0-based, displayed as 1-based)
 */
export function validateAgendaItemInput(
  item: AgendaItemInput,
  index?: number
): string | null {
  const prefix = index !== undefined ? `Item ${index + 1}: ` : "";

  // Title validation (required)
  if (!item.title || typeof item.title !== "string") {
    return `${prefix}title is required`;
  }

  const title = item.title.trim();
  if (title.length < AGENDA_LIMITS.MIN_TITLE_LENGTH) {
    return `${prefix}title is required`;
  }
  if (title.length > AGENDA_LIMITS.MAX_TITLE_LENGTH) {
    return `${prefix}title must be ${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters or less`;
  }

  // Description validation (optional)
  if (item.description !== undefined && item.description !== null) {
    if (typeof item.description !== "string") {
      return `${prefix}description must be a string`;
    }
    if (item.description.length > AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH) {
      return `${prefix}description must be ${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
    }
  }

  // Estimated duration validation (optional)
  if (item.estimatedDuration !== undefined && item.estimatedDuration !== null) {
    if (typeof item.estimatedDuration !== "number") {
      return `${prefix}estimatedDuration must be a number`;
    }
    if (
      item.estimatedDuration < AGENDA_LIMITS.MIN_DURATION_MINUTES ||
      item.estimatedDuration > AGENDA_LIMITS.MAX_DURATION_MINUTES
    ) {
      return `${prefix}estimatedDuration must be between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES} minutes`;
    }
  }

  // Presenter validation (optional)
  if (item.presenter !== undefined && item.presenter !== null) {
    if (typeof item.presenter !== "string") {
      return `${prefix}presenter must be a string`;
    }
    if (item.presenter.length > AGENDA_LIMITS.MAX_PRESENTER_LENGTH) {
      return `${prefix}presenter must be ${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters or less`;
    }
  }

  return null;
}

/**
 * Validates partial agenda item updates (for PATCH operations).
 * Returns error message or null if valid.
 *
 * NOTE: orderIndex is intentionally NOT validated here.
 * Ordering should be done via the dedicated reorder endpoint.
 */
export function validateAgendaItemUpdate(body: {
  title?: string;
  description?: string;
  estimatedDuration?: number;
  presenter?: string;
}): string | null {
  // Title validation (if provided)
  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return "title must be a string";
    }
    const title = body.title.trim();
    if (title.length < AGENDA_LIMITS.MIN_TITLE_LENGTH) {
      return "title is required";
    }
    if (title.length > AGENDA_LIMITS.MAX_TITLE_LENGTH) {
      return `title must be ${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters or less`;
    }
  }

  // Description validation (if provided)
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return "description must be a string";
    }
    if (body.description.length > AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH) {
      return `description must be ${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
    }
  }

  // Estimated duration validation (if provided)
  if (body.estimatedDuration !== undefined && body.estimatedDuration !== null) {
    if (typeof body.estimatedDuration !== "number") {
      return "estimatedDuration must be a number";
    }
    if (
      body.estimatedDuration < AGENDA_LIMITS.MIN_DURATION_MINUTES ||
      body.estimatedDuration > AGENDA_LIMITS.MAX_DURATION_MINUTES
    ) {
      return `estimatedDuration must be between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES} minutes`;
    }
  }

  // Presenter validation (if provided)
  if (body.presenter !== undefined && body.presenter !== null) {
    if (typeof body.presenter !== "string") {
      return "presenter must be a string";
    }
    if (body.presenter.length > AGENDA_LIMITS.MAX_PRESENTER_LENGTH) {
      return `presenter must be ${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters or less`;
    }
  }

  return null;
}

/**
 * Validates an array of agenda items.
 * Checks count limits and validates each item.
 *
 * @param items - Array of agenda item inputs
 * @returns Validation result with isValid flag and optional error
 */
export function validateAgendaItems(items: unknown): ValidationResult {
  // Check it's an array
  if (!Array.isArray(items)) {
    return { isValid: false, error: "items must be an array" };
  }

  // Check count limit
  if (items.length > AGENDA_LIMITS.MAX_ITEMS) {
    return {
      isValid: false,
      error: `Maximum ${AGENDA_LIMITS.MAX_ITEMS} items allowed`,
    };
  }

  // Validate each item
  for (let i = 0; i < items.length; i++) {
    const validation = validateAgendaItemInput(items[i] as AgendaItemInput, i);
    if (validation) {
      return { isValid: false, error: validation };
    }
  }

  return { isValid: true };
}

/**
 * Validates reorder request item IDs.
 *
 * @param itemIds - Array of item IDs in desired order
 * @returns Validation result with isValid flag and optional error
 */
export function validateReorderItemIds(itemIds: unknown): ValidationResult {
  // Check it's an array
  if (!Array.isArray(itemIds)) {
    return { isValid: false, error: "itemIds must be an array" };
  }

  // Check not empty
  if (itemIds.length === 0) {
    return { isValid: false, error: "itemIds cannot be empty" };
  }

  // Check all items are strings
  for (const id of itemIds) {
    if (typeof id !== "string") {
      return { isValid: false, error: "itemIds must be an array of strings" };
    }
  }

  // Check for duplicates
  const uniqueIds = new Set(itemIds);
  if (uniqueIds.size !== itemIds.length) {
    return {
      isValid: false,
      error: "itemIds contains duplicates. Each item ID must appear exactly once.",
    };
  }

  return { isValid: true };
}

// ============================================================================
// Client-Side Field Validation (for React components)
// ============================================================================

/**
 * Validates a single agenda item field.
 * Returns error message or undefined if valid.
 *
 * @param field - The field name to validate
 * @param value - The field value
 * @returns Error message or undefined
 */
export function validateAgendaField(
  field: keyof AgendaItemFieldErrors,
  value: string | number | undefined | null
): string | undefined {
  switch (field) {
    case "title": {
      if (typeof value !== "string") return "Title is required";
      const trimmed = value.trim();
      if (trimmed.length < AGENDA_LIMITS.MIN_TITLE_LENGTH) {
        return "Title is required";
      }
      if (trimmed.length > AGENDA_LIMITS.MAX_TITLE_LENGTH) {
        return `Title must be ${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters or less`;
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
      // Trim before checking length to match persistence behavior
      const trimmedDesc = value.trim();
      if (trimmedDesc.length > AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH) {
        return `Description must be ${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
      }
      return undefined;
    }

    case "estimatedDuration": {
      if (value === undefined || value === null || value === "") {
        return undefined; // Optional field
      }
      const numValue = typeof value === "string" ? parseInt(value, 10) : value;
      if (typeof numValue !== "number" || isNaN(numValue)) {
        return "Duration must be a number";
      }
      if (numValue < AGENDA_LIMITS.MIN_DURATION_MINUTES) {
        return `Duration must be at least ${AGENDA_LIMITS.MIN_DURATION_MINUTES} minute`;
      }
      if (numValue > AGENDA_LIMITS.MAX_DURATION_MINUTES) {
        return `Duration must be ${AGENDA_LIMITS.MAX_DURATION_MINUTES} minutes or less`;
      }
      return undefined;
    }

    case "presenter": {
      if (value === undefined || value === null || value === "") {
        return undefined; // Optional field
      }
      if (typeof value !== "string") {
        return "Presenter must be text";
      }
      // Trim before checking length to match persistence behavior
      const trimmedPresenter = value.trim();
      if (trimmedPresenter.length > AGENDA_LIMITS.MAX_PRESENTER_LENGTH) {
        return `Presenter must be ${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters or less`;
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Validates all fields of an agenda item at once.
 * Returns object with field-level errors for form display.
 *
 * @param item - The item fields to validate
 * @returns Object with errors per field, empty object if all valid
 */
export function getAgendaFieldErrors(item: {
  title?: string;
  description?: string;
  estimatedDuration?: string | number;
  presenter?: string;
}): AgendaItemFieldErrors {
  const errors: AgendaItemFieldErrors = {};

  const titleError = validateAgendaField("title", item.title);
  if (titleError) errors.title = titleError;

  const descError = validateAgendaField("description", item.description);
  if (descError) errors.description = descError;

  const durationError = validateAgendaField("estimatedDuration", item.estimatedDuration);
  if (durationError) errors.estimatedDuration = durationError;

  const presenterError = validateAgendaField("presenter", item.presenter);
  if (presenterError) errors.presenter = presenterError;

  return errors;
}

/**
 * Check if there are any validation errors.
 *
 * @param errors - The errors object from getAgendaFieldErrors
 * @returns true if there are errors, false otherwise
 */
export function hasAgendaFieldErrors(errors: AgendaItemFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ============================================================================
// Meeting Info Validation
// ============================================================================

/**
 * Result of meeting info validation.
 */
export interface MeetingInfoValidationResult {
  isValid: boolean;
  error?: string;
  /** Sanitized meeting name (trimmed, truncated) */
  sanitizedName?: string;
  /** Parsed and validated date */
  parsedDate?: Date;
}

/**
 * Validates meeting info (name and scheduled time).
 * Performs sanitization and returns cleaned values.
 *
 * @param info - The meeting info to validate
 * @returns Validation result with sanitized values
 */
export function validateMeetingInfo(info: {
  meetingName?: string;
  scheduledAt?: string;
}): MeetingInfoValidationResult {
  let sanitizedName: string | undefined;
  let parsedDate: Date | undefined;

  // Validate meeting name (optional but has constraints)
  if (info.meetingName !== undefined && info.meetingName !== null) {
    if (typeof info.meetingName !== "string") {
      return { isValid: false, error: "meetingName must be a string" };
    }

    // Trim and check length
    sanitizedName = info.meetingName.trim();
    if (sanitizedName.length > AGENDA_LIMITS.MAX_MEETING_NAME_LENGTH) {
      return {
        isValid: false,
        error: `meetingName must be ${AGENDA_LIMITS.MAX_MEETING_NAME_LENGTH} characters or less`,
      };
    }

    // Empty string after trim means no name
    if (sanitizedName.length === 0) {
      sanitizedName = undefined;
    }
  }

  // Validate scheduled time (optional but must be valid ISO string)
  if (info.scheduledAt !== undefined && info.scheduledAt !== null) {
    if (typeof info.scheduledAt !== "string") {
      return { isValid: false, error: "scheduledAt must be an ISO date string" };
    }

    // Try to parse as ISO date
    const date = new Date(info.scheduledAt);
    if (isNaN(date.getTime())) {
      return { isValid: false, error: "scheduledAt must be a valid ISO date string" };
    }

    parsedDate = date;
  }

  return {
    isValid: true,
    sanitizedName,
    parsedDate,
  };
}
