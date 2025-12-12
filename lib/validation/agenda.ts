/**
 * Agenda Validation Utilities
 *
 * Centralized validation logic for agenda items.
 * Used by API routes to ensure consistent validation across endpoints.
 */

import { AGENDA_LIMITS, type AgendaItemInput } from "@/types/agenda";

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
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
