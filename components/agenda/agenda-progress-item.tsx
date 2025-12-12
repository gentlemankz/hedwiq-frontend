"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Clock, User } from "lucide-react";
import { ProgressIndicator, ConnectorLine } from "./progress-indicator";
import { formatDuration, formatActualDuration } from "@/hooks/use-agenda";
import type { AgendaItem } from "@/types/agenda";

// ============================================================================
// Types
// ============================================================================

interface AgendaProgressItemProps {
  /** The agenda item to display */
  item: AgendaItem;
  /** Whether this is the current active item */
  isCurrent: boolean;
  /** Whether this is the last item in the list */
  isLast: boolean;
  /** Item index (1-based for display) */
  index: number;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Individual agenda item display in the progress panel.
 *
 * Shows:
 * - Status indicator (pending/in-progress/completed/skipped)
 * - Title
 * - Estimated or actual duration
 * - Presenter (if set)
 * - Connector line to next item
 */
export const AgendaProgressItem = React.memo(function AgendaProgressItem({
  item,
  isCurrent,
  isLast,
  // Note: index is available in props for future numbering display (e.g., "1. Topic")
  // Currently unused but kept for API stability with parent component
  className,
}: AgendaProgressItemProps) {
  const isCompleted = item.status === "completed";
  const isSkipped = item.status === "skipped";
  const isDone = isCompleted || isSkipped;

  // Show actual duration if completed, otherwise estimated
  const durationLabel = isDone && item.actualDuration
    ? formatActualDuration(item.actualDuration)
    : formatDuration(item.estimatedDuration);

  return (
    <div
      className={cn(
        "relative pl-8 pb-4",
        // Current item highlight
        isCurrent && "bg-primary/5 -mx-3 px-3 pl-11 rounded-md",
        className
      )}
      aria-current={isCurrent ? "step" : undefined}
    >
      {/* Status indicator */}
      <div className="absolute left-0 top-0.5">
        <ProgressIndicator
          status={item.status}
          isCurrent={isCurrent}
          size="md"
        />
      </div>

      {/* Connector line */}
      <ConnectorLine status={item.status} isLast={isLast} />

      {/* Content */}
      <div className="space-y-1">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "text-sm font-medium leading-tight",
              isDone && "text-muted-foreground line-through decoration-muted-foreground/40",
              isCurrent && "text-primary font-semibold"
            )}
          >
            {item.title}
          </span>

          {/* Current indicator badge */}
          {isCurrent && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              Now
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {/* Duration */}
          {durationLabel && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {durationLabel}
            </span>
          )}

          {/* Presenter */}
          {item.presenter && (
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {item.presenter}
            </span>
          )}
        </div>

        {/* Description (only show for current item to save space) */}
        {isCurrent && item.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
});
