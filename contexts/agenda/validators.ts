/**
 * Validators for Agenda Context
 *
 * Type guards and validation functions for agenda events and state.
 */

import type { AgendaProgressEvent, AgendaStateAttribute } from "./types";

/**
 * Type guard for validating AgendaProgressEvent structure
 */
export function isValidAgendaProgressEvent(data: unknown): data is AgendaProgressEvent {
  if (!data || typeof data !== "object") return false;
  const event = data as Record<string, unknown>;

  if (typeof event.type !== "string") return false;
  if (typeof event.timestamp !== "number") return false;

  const validTypes = [
    "meeting_started",
    "meeting_ended",
    "topic_started",
    "topic_completed",
    "topic_skipped",
    "agenda_sync",
  ];

  if (!validTypes.includes(event.type)) return false;

  // Validate type-specific fields
  if (event.type === "topic_started" || event.type === "topic_completed" || event.type === "topic_skipped") {
    if (typeof event.itemId !== "string") return false;
    if (typeof event.itemIndex !== "number") return false;
  }

  if (event.type === "agenda_sync") {
    if (!event.agenda || typeof event.agenda !== "object") return false;
  }

  return true;
}

/**
 * Type guard for validating AgendaStateAttribute structure
 */
export function isValidAgendaStateAttribute(data: unknown): data is AgendaStateAttribute {
  if (!data || typeof data !== "object") return false;
  const state = data as Record<string, unknown>;

  if (typeof state.v !== "number") return false;
  if (state.c !== null && typeof state.c !== "string") return false;
  if (!Array.isArray(state.d)) return false;
  if (state.s !== null && typeof state.s !== "number") return false;

  return true;
}
