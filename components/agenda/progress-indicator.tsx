"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { AgendaItemStatus } from "@/types/agenda";

// ============================================================================
// Types
// ============================================================================

interface ProgressIndicatorProps {
  /** Item status */
  status: AgendaItemStatus;
  /** Whether this is the current active item */
  isCurrent?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Visual indicator for agenda item status.
 *
 * States:
 * - Pending: Grey outline circle
 * - In Progress: Blue filled circle with pulse animation
 * - Completed: Green filled circle with checkmark
 * - Skipped: Grey filled circle with dash
 */
export function ProgressIndicator({
  status,
  isCurrent = false,
  size = "md",
  className,
}: ProgressIndicatorProps) {
  const sizeClasses = {
    sm: "size-4",
    md: "size-5",
    lg: "size-6",
  };

  const iconSizes = {
    sm: "size-2.5",
    md: "size-3",
    lg: "size-3.5",
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full shrink-0 transition-all duration-300",
        sizeClasses[size],
        // Status-specific styles
        status === "pending" && "border-2 border-muted-foreground/40 bg-transparent",
        status === "in_progress" && "bg-primary",
        status === "completed" && "bg-green-500",
        status === "skipped" && "bg-muted-foreground/40",
        // Current item pulse animation
        isCurrent && status === "in_progress" && "animate-pulse",
        className
      )}
      role="status"
      aria-label={getAriaLabel(status)}
    >
      {/* Completed checkmark */}
      {status === "completed" && (
        <Check className={cn("text-white", iconSizes[size])} strokeWidth={3} />
      )}

      {/* Skipped dash */}
      {status === "skipped" && (
        <div
          className={cn(
            "bg-white rounded-full",
            size === "sm" && "h-0.5 w-2",
            size === "md" && "h-0.5 w-2.5",
            size === "lg" && "h-0.5 w-3"
          )}
        />
      )}

      {/* In progress dot */}
      {status === "in_progress" && isCurrent && (
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-primary animate-ping opacity-75"
          )}
        />
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getAriaLabel(status: AgendaItemStatus): string {
  switch (status) {
    case "pending":
      return "Upcoming topic";
    case "in_progress":
      return "Topic in progress";
    case "completed":
      return "Completed topic";
    case "skipped":
      return "Skipped topic";
    default:
      return "Topic";
  }
}

// ============================================================================
// Connector Line Component
// ============================================================================

interface ConnectorLineProps {
  /** Status of the item this line connects to */
  status: AgendaItemStatus;
  /** Whether this is the last item (no line below) */
  isLast?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Vertical connector line between agenda items.
 */
export function ConnectorLine({ status, isLast, className }: ConnectorLineProps) {
  if (isLast) return null;

  return (
    <div
      className={cn(
        "absolute left-[9px] top-5 w-0.5 h-full -bottom-2",
        status === "completed" || status === "skipped"
          ? "bg-green-500/40"
          : "bg-muted-foreground/20",
        className
      )}
    />
  );
}
