"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ListTodo, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgenda } from "@/hooks/use-agenda";
import { AgendaProgressItem } from "./agenda-progress-item";

// ============================================================================
// Types
// ============================================================================

interface AgendaProgressProps {
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Agenda progress panel for the meeting sidebar.
 *
 * Displays:
 * - Progress bar with completion percentage
 * - List of agenda items with status indicators
 * - Current topic highlighting
 * - Estimated remaining time
 *
 * Handles states:
 * - Loading: Skeleton UI
 * - No agenda: Empty state message
 * - Error: Error with retry button
 * - Active: Full progress display
 */
export function AgendaProgress({ className }: AgendaProgressProps) {
  const {
    agenda,
    isLoading,
    error,
    progressPercentage,
    isCurrentItem,
    hasAgenda,
    progressSummary,
    remainingTimeLabel,
    refreshAgenda,
  } = useAgenda();

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("p-4 space-y-4", className)}>
        <AgendaProgressSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("p-4", className)}>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshAgenda()}
              className="ml-2"
            >
              <RefreshCw className="size-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No agenda state
  if (!hasAgenda || !agenda) {
    return (
      <div className={cn("p-4", className)}>
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <ListTodo className="mb-2 size-8 opacity-50" />
          <p className="text-sm font-medium">No agenda for this meeting</p>
          <p className="text-xs mt-1">
            Agendas can be created before joining the meeting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with progress */}
      <div className="p-4 border-b space-y-3">
        {/* Title and count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Agenda Progress</span>
          </div>
          {progressSummary && (
            <span className="text-sm text-muted-foreground">
              {progressSummary.label}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <Progress value={progressPercentage} className="h-2" />

        {/* Estimated remaining time */}
        {remainingTimeLabel && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>Est. remaining: {remainingTimeLabel}</span>
          </div>
        )}
      </div>

      {/* Scrollable items list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-0">
          {agenda.items.map((item, index) => (
            <AgendaProgressItem
              key={item.id}
              item={item}
              isCurrent={isCurrentItem(item)}
              isLast={index === agenda.items.length - 1}
              index={index + 1}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function AgendaProgressSkeleton() {
  return (
    <>
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>

      {/* Items skeleton */}
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-5 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================================
// Compact Variant for Sidebar Header
// ============================================================================

interface AgendaProgressCompactProps {
  /** Custom class name */
  className?: string;
  /** Click handler for expanding */
  onClick?: () => void;
}

/**
 * Compact agenda progress indicator for sidebar header.
 * Shows just the progress bar and current topic.
 */
export function AgendaProgressCompact({
  className,
  onClick,
}: AgendaProgressCompactProps) {
  const { hasAgenda, currentItem, progressPercentage, progressSummary } = useAgenda();

  if (!hasAgenda) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-left",
        className
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">
          Agenda
        </span>
        {progressSummary && (
          <span className="text-xs text-muted-foreground">
            {progressSummary.label}
          </span>
        )}
      </div>
      <Progress value={progressPercentage} className="h-1.5 mb-1" />
      {currentItem && (
        <p className="text-xs truncate">
          <span className="text-primary font-medium">Now:</span>{" "}
          {currentItem.title}
        </p>
      )}
    </button>
  );
}
