/**
 * Calendar Utilities
 *
 * Shared utility functions for calendar operations.
 * Used by both ICS generation and calendar link generation.
 */

import type { AgendaWithItems } from "@/types/agenda";

// ============================================================================
// Constants
// ============================================================================

/**
 * ICS field length limits to prevent oversized calendar files.
 * Based on RFC 5545 recommendations and practical calendar app limits.
 */
export const ICS_LIMITS = {
  /** Maximum title/summary length */
  MAX_SUMMARY_LENGTH: 200,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 4000,
  /** Maximum location length */
  MAX_LOCATION_LENGTH: 500,
  /** Maximum organizer name length */
  MAX_ORGANIZER_NAME_LENGTH: 100,
} as const;

// ============================================================================
// Date Formatting
// ============================================================================

/**
 * Format a Date object to ICS/Google Calendar datetime format (YYYYMMDDTHHMMSSZ).
 * Uses UTC timezone for consistent results across timezones.
 *
 * @param date - Date to format
 * @returns Formatted date string (e.g., "20241220T150000Z")
 */
export function formatICSDatetime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ============================================================================
// Agenda Formatting
// ============================================================================

/**
 * Format agenda items as text for descriptions.
 *
 * @param agenda - Agenda with items
 * @param options - Formatting options
 * @returns Formatted agenda text or empty string if no agenda
 */
export function formatAgendaForDescription(
  agenda?: AgendaWithItems | null,
  options: {
    /** Use ICS escaping (backslash-n) vs regular newlines */
    escapeNewlines?: boolean;
    /** Include item descriptions */
    includeDescriptions?: boolean;
  } = {}
): string {
  const { escapeNewlines = false, includeDescriptions = false } = options;

  if (!agenda || agenda.items.length === 0) {
    return "";
  }

  const newline = escapeNewlines ? "\\n" : "\n";

  const items = agenda.items
    .map((item, i) => {
      const duration = item.estimatedDuration
        ? ` (${item.estimatedDuration} min)`
        : "";
      const description =
        includeDescriptions && item.description
          ? `${newline}   ${item.description}`
          : "";
      return `${i + 1}. ${item.title}${duration}${description}`;
    })
    .join(newline);

  return `${newline}${newline}Agenda:${newline}${items}`;
}

// ============================================================================
// ICS Text Escaping
// ============================================================================

/**
 * Truncate text to a maximum length, adding ellipsis if truncated.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length (including ellipsis)
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Escape special characters for ICS text fields.
 * ICS uses backslash escaping for commas, semicolons, and newlines.
 *
 * @param text - Text to escape
 * @param maxLength - Optional maximum length (applies truncation before escaping)
 * @returns Escaped text safe for ICS
 */
export function escapeICSText(text: string, maxLength?: number): string {
  const truncated = maxLength ? truncateText(text, maxLength) : text;
  return truncated
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}
