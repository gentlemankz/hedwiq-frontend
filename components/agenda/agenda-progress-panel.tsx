"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Circle,
  Play,
  CheckCircle,
  Clock,
  User,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgendaContextSafe } from "@/contexts/agenda-context";
import type { AgendaItemProgress, AgendaItemStatus } from "@/types/agenda";
import { AGENDA_CONSTANTS } from "@/types/agenda";

// ============================================================================
// Types
// ============================================================================

interface AgendaProgressPanelProps {
  /** Custom class name */
  className?: string;
  /** Whether to show manual controls */
  showControls?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Status icon for agenda items
 */
function StatusIcon({
  status,
  className,
}: {
  status: AgendaItemStatus;
  className?: string;
}) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle
          className={cn("size-4 text-green-600 dark:text-green-400", className)}
        />
      );
    case "in_progress":
      return (
        <Play
          className={cn("size-4 text-blue-600 dark:text-blue-400 fill-current", className)}
        />
      );
    default:
      return (
        <Circle
          className={cn("size-4 text-muted-foreground/50", className)}
        />
      );
  }
}

/**
 * Single agenda item in the progress list
 */
function AgendaItemRow({
  item,
  index,
  isCurrentItem,
  showControls,
  onComplete,
  onStart,
  onRevert,
}: {
  item: AgendaItemProgress;
  index: number;
  isCurrentItem: boolean;
  showControls: boolean;
  onComplete: (index: number) => void;
  onStart: (index: number) => void;
  onRevert: (index: number) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-2 px-3 py-2 rounded-md transition-colors",
        isCurrentItem && "bg-primary/10 border border-primary/20",
        item.status === "completed" && "opacity-70"
      )}
    >
      {/* Status Icon */}
      <div className="pt-0.5">
        <StatusIcon status={item.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium leading-tight truncate",
            item.status === "completed" && "line-through text-muted-foreground"
          )}
        >
          {item.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {item.estimatedMinutes && (
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" />
              {item.actualMinutes ?? item.estimatedMinutes}m
              {item.status === "completed" && item.actualMinutes && (
                <span className="text-muted-foreground/70">
                  /{item.estimatedMinutes}m
                </span>
              )}
            </span>
          )}
          {item.leadBy && (
            <span className="flex items-center gap-0.5">
              <User className="size-3" />
              {item.leadBy}
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.status === "pending" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => onStart(index)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Start this topic</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.status === "in_progress" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => onComplete(index)}
                  >
                    <CheckCircle className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark as complete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.status === "completed" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => onRevert(index)}
                  >
                    <RotateCcw className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Revert to pending</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * Panel showing agenda progress during a meeting.
 * Displays items with their completion status, time estimates,
 * and overall progress.
 */
export function AgendaProgressPanel({
  className,
  showControls = true,
}: AgendaProgressPanelProps) {
  const agendaContext = useAgendaContextSafe();

  // Handler callbacks
  const handleComplete = useCallback(
    (index: number) => {
      agendaContext?.manuallyCompleteItem(index);
    },
    [agendaContext]
  );

  const handleStart = useCallback(
    (index: number) => {
      agendaContext?.manuallyStartItem(index);
    },
    [agendaContext]
  );

  const handleRevert = useCallback(
    (index: number) => {
      agendaContext?.revertItemStatus(index);
    },
    [agendaContext]
  );

  // Don't render if no agenda context or no agenda
  if (!agendaContext || !agendaContext.isAgendaActive) {
    return null;
  }

  const { agenda, getProgressPercentage, getEstimatedTimeRemaining } = agendaContext;

  if (!agenda) return null;

  const progressPercentage = getProgressPercentage();
  const estimatedTimeRemaining = getEstimatedTimeRemaining();
  const completedCount = agenda.items.filter((i) => i.status === "completed").length;
  const totalCount = agenda.items.length;

  return (
    <div
      className={cn(
        "flex flex-col h-full border-r bg-background",
        className
      )}
      style={{ width: AGENDA_CONSTANTS.AGENDA_PANEL_WIDTH }}
    >
      {/* Header */}
      <div className="px-3 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Meeting Agenda
          </p>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount}
          </span>
        </div>
        <Progress value={progressPercentage} className="h-1.5" />
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="space-y-1">
          {agenda.items.map((item, index) => (
            <AgendaItemRow
              key={item.id}
              item={item}
              index={index}
              isCurrentItem={agenda.currentItemIndex === index}
              showControls={showControls}
              onComplete={handleComplete}
              onStart={handleStart}
              onRevert={handleRevert}
            />
          ))}
        </div>
      </div>

      {/* Footer with time estimate */}
      {estimatedTimeRemaining > 0 && (
        <div className="px-3 py-2 border-t">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" />
            Est. {estimatedTimeRemaining} min remaining
          </p>
        </div>
      )}
    </div>
  );
}
