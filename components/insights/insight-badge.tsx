"use client";

import { cn } from "@/lib/utils";
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Search,
  FlaskConical,
  ClipboardList,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { INSIGHT_CONFIG, type InsightType } from "@/types/insight";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Icon mapping for insight types
 */
const ICONS: Record<string, LucideIcon> = {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Search,
  FlaskConical,
  ClipboardList,
  HelpCircle,
};

interface InsightBadgeProps {
  /** The type of insight */
  type: InsightType;
  /** The insight content (shown in tooltip) */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Whether to show the label text */
  showLabel?: boolean;
}

/**
 * A small badge component that displays an insight type with an icon.
 *
 * Shows the full content in a tooltip on hover. Used inline with
 * transcript entries to indicate detected insights.
 *
 * @example
 * ```tsx
 * <InsightBadge
 *   type="action_item"
 *   content="John will prepare the report by Friday"
 *   onClick={() => setSelectedInsight(insight)}
 * />
 * ```
 */
export function InsightBadge({
  type,
  content,
  className,
  onClick,
  showLabel = true,
}: InsightBadgeProps) {
  const config = INSIGHT_CONFIG[type];
  const IconComponent = ICONS[config.icon];

  if (!IconComponent) {
    console.warn(`Unknown icon: ${config.icon}`);
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
              "transition-all hover:scale-105 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary/50",
              config.bgColor,
              config.color,
              className
            )}
            type="button"
          >
            <IconComponent className="size-3" />
            {showLabel && <span>{config.label}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * A minimal version of the badge showing only the icon.
 */
export function InsightBadgeIcon({
  type,
  className,
}: {
  type: InsightType;
  className?: string;
}) {
  const config = INSIGHT_CONFIG[type];
  const IconComponent = ICONS[config.icon];

  if (!IconComponent) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center size-5 rounded-full",
        config.bgColor,
        className
      )}
    >
      <IconComponent className={cn("size-3", config.color)} />
    </div>
  );
}
