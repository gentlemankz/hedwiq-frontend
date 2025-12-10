"use client";

import { cn } from "@/lib/utils";
import { useAgendaContextSafe } from "@/contexts/agenda-context";

// ============================================================================
// Types
// ============================================================================

interface AgendaHeaderProps {
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Header displaying the currently discussed agenda topic.
 * Shows nothing if no agenda is active or not started.
 */
export function AgendaHeader({ className }: AgendaHeaderProps) {
  const agendaContext = useAgendaContextSafe();

  // Don't render if no agenda context or no current item
  if (!agendaContext || !agendaContext.currentItem) {
    return null;
  }

  const { currentItem } = agendaContext;

  return (
    <div
      className={cn(
        "px-4 py-2 border-b bg-primary/5",
        className
      )}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Currently Discussing
      </p>
      <p className="text-sm font-medium truncate">{currentItem.title}</p>
    </div>
  );
}
