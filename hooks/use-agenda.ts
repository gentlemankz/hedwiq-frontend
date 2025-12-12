/**
 * Hook for consuming agenda context in components.
 *
 * Re-exports useAgendaContext from context for consistency with other hooks.
 * Also provides computed values and utility functions for agenda display.
 */

import { useMemo } from "react";
import { useAgendaContext } from "@/contexts/agenda-context";
import type { AgendaItem, AgendaItemStatus } from "@/types/agenda";

/**
 * Format duration in minutes to display string.
 * Examples: "5 min", "1 hr 15 min"
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Format actual duration (in seconds) to display string.
 */
export function formatActualDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get status label for display.
 */
export function getStatusLabel(status: AgendaItemStatus): string {
  switch (status) {
    case "pending":
      return "Upcoming";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    default:
      return "Unknown";
  }
}

/**
 * Main hook for consuming agenda state.
 * Re-exports context with additional computed values.
 */
export function useAgenda() {
  const context = useAgendaContext();

  /**
   * Progress summary for display
   */
  const progressSummary = useMemo(() => {
    const { agenda, completedItems, skippedItems } = context;
    if (!agenda) return null;

    const total = agenda.items.length;
    const done = completedItems.length + skippedItems.length;

    return {
      done,
      total,
      label: `${done}/${total}`,
    };
  }, [context]);

  /**
   * Remaining time formatted for display
   */
  const remainingTimeLabel = useMemo(() => {
    return formatDuration(context.estimatedRemainingTime);
  }, [context.estimatedRemainingTime]);

  /**
   * Check if an item is the current active item
   */
  const isCurrentItem = (item: AgendaItem): boolean => {
    return context.currentItem?.id === item.id;
  };

  /**
   * Check if there is an active agenda to display
   */
  const hasAgenda = context.agenda !== null && context.agenda.items.length > 0;

  return {
    ...context,
    progressSummary,
    remainingTimeLabel,
    isCurrentItem,
    hasAgenda,
  };
}

export type { AgendaItem, AgendaItemStatus };
