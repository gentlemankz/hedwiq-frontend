"use client";

/**
 * Hook for computed agenda values
 *
 * Provides memoized computed values derived from agenda state.
 */

import { useMemo, useCallback } from "react";
import type { AgendaWithItems, AgendaItem, AgendaItemStatus } from "./types";

interface UseAgendaComputedProps {
  agenda: AgendaWithItems | null;
  itemStatuses: Map<string, AgendaItemStatus>;
  itemDurations: Map<string, number>;
  currentItemId: string | null;
}

/**
 * Hook that provides computed values from agenda state
 */
export function useAgendaComputed({
  agenda,
  itemStatuses,
  itemDurations,
  currentItemId,
}: UseAgendaComputedProps) {
  /**
   * Compute items with merged real-time status updates and durations
   */
  const itemsWithLiveStatus = useMemo(() => {
    if (!agenda?.items) return [];

    return agenda.items.map((item) => {
      const liveStatus = itemStatuses.get(item.id);
      const liveDuration = itemDurations.get(item.id);

      const updates: Partial<AgendaItem> = {};
      if (liveStatus && liveStatus !== item.status) {
        updates.status = liveStatus;
      }
      if (liveDuration !== undefined && liveDuration !== item.actualDuration) {
        updates.actualDuration = liveDuration;
      }

      if (Object.keys(updates).length > 0) {
        return { ...item, ...updates };
      }
      return item;
    });
  }, [agenda?.items, itemStatuses, itemDurations]);

  /**
   * Current active item
   */
  const currentItem = useMemo(() => {
    if (!currentItemId) return null;
    return itemsWithLiveStatus.find((item) => item.id === currentItemId) ?? null;
  }, [itemsWithLiveStatus, currentItemId]);

  /**
   * Current item index
   */
  const currentItemIndex = useMemo(() => {
    if (!currentItemId) return null;
    const index = itemsWithLiveStatus.findIndex((item) => item.id === currentItemId);
    return index >= 0 ? index : null;
  }, [itemsWithLiveStatus, currentItemId]);

  /**
   * Completed items
   */
  const completedItems = useMemo(() => {
    return itemsWithLiveStatus.filter((item) => item.status === "completed");
  }, [itemsWithLiveStatus]);

  /**
   * Pending items
   */
  const pendingItems = useMemo(() => {
    return itemsWithLiveStatus.filter((item) => item.status === "pending");
  }, [itemsWithLiveStatus]);

  /**
   * Skipped items
   */
  const skippedItems = useMemo(() => {
    return itemsWithLiveStatus.filter((item) => item.status === "skipped");
  }, [itemsWithLiveStatus]);

  /**
   * Progress percentage
   */
  const progressPercentage = useMemo(() => {
    const total = itemsWithLiveStatus.length;
    if (total === 0) return 0;
    const completed = completedItems.length + skippedItems.length;
    return Math.round((completed / total) * 100);
  }, [itemsWithLiveStatus.length, completedItems.length, skippedItems.length]);

  /**
   * Estimated remaining time based on pending items' estimated durations
   */
  const estimatedRemainingTime = useMemo(() => {
    return pendingItems.reduce(
      (sum, item) => sum + (item.estimatedDuration ?? 0),
      0
    );
  }, [pendingItems]);

  /**
   * Get the topic associated with a transcript reference
   */
  const getTopicForTranscript = useCallback(
    (transcriptRef: string): AgendaItem | null => {
      if (!agenda?.items) return null;

      // Find item where transcript ref falls between start and end refs
      for (const item of itemsWithLiveStatus) {
        if (item.startTranscriptRef === transcriptRef) {
          return item;
        }
        if (item.endTranscriptRef === transcriptRef) {
          return item;
        }
      }

      return null;
    },
    [agenda?.items, itemsWithLiveStatus]
  );

  return {
    itemsWithLiveStatus,
    currentItem,
    currentItemIndex,
    completedItems,
    pendingItems,
    skippedItems,
    progressPercentage,
    estimatedRemainingTime,
    getTopicForTranscript,
  };
}
