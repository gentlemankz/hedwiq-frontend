/**
 * Meeting Form Utilities
 *
 * Shared utilities for meeting scheduling and editing dialogs.
 * Centralizes time options and form helper functions.
 */

import type { DraftAgendaItem, AgendaWithItems } from "@/types/agenda";

// ============================================================================
// Time Options
// ============================================================================

/**
 * Time option for meeting scheduling.
 */
export interface TimeOption {
  /** Value in HH:mm format for form state */
  value: string;
  /** Display label in 12-hour format */
  label: string;
}

/**
 * Generate time options at 30-minute intervals for a full day.
 * Creates 48 options from 00:00 to 23:30.
 *
 * @returns Array of time options with value (24h) and label (12h)
 *
 * @example
 * const options = TIME_OPTIONS;
 * // [{ value: "00:00", label: "12:00 AM" }, { value: "00:30", label: "12:30 AM" }, ...]
 */
export const TIME_OPTIONS: TimeOption[] = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

  // Format as 12-hour time without creating Date objects (more efficient)
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  const label = `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;

  return { value, label };
});

// ============================================================================
// Agenda Conversion
// ============================================================================

/**
 * Convert AgendaWithItems to DraftAgendaItem array.
 * Used when loading existing agenda items into the agenda builder.
 *
 * @param agenda - The agenda with items from the database
 * @returns Array of draft agenda items for the form
 *
 * @example
 * const draftItems = agendaItemsToDraft(existingAgenda);
 * setAgendaItems(draftItems);
 */
export function agendaItemsToDraft(
  agenda: AgendaWithItems | null | undefined
): DraftAgendaItem[] {
  if (!agenda?.items) return [];

  return agenda.items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? undefined,
    estimatedDuration: item.estimatedDuration ?? undefined,
    presenter: item.presenter ?? undefined,
  }));
}

/**
 * Convert DraftAgendaItem array to API input format.
 * Strips the id field for creating/updating agendas via API.
 *
 * @param items - Draft agenda items from the form
 * @returns Array suitable for API requests
 *
 * @example
 * const apiItems = draftItemsToApiInput(agendaItems);
 * await fetch("/api/meetings", { body: JSON.stringify({ agendaItems: apiItems }) });
 */
export function draftItemsToApiInput(
  items: DraftAgendaItem[]
): Omit<DraftAgendaItem, "id">[] {
  return items.map((item) => ({
    title: item.title,
    description: item.description,
    estimatedDuration: item.estimatedDuration,
    presenter: item.presenter,
  }));
}

// ============================================================================
// Time Helpers
// ============================================================================

/**
 * Extract time string (HH:mm) from a Date object.
 *
 * @param date - Date to extract time from
 * @returns Time string in HH:mm format
 *
 * @example
 * const time = getTimeFromDate(new Date("2024-12-15T14:30:00"));
 * // "14:30"
 */
export function getTimeFromDate(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Parse time string and combine with date.
 *
 * @param date - Base date to set time on
 * @param time - Time string in HH:mm format
 * @returns New Date with the specified time
 *
 * @example
 * const scheduledAt = combineDateAndTime(selectedDate, "14:30");
 */
export function combineDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
