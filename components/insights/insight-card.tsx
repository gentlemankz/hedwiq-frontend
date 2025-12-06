"use client";

import { cn, getInitials, getHashedColor } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
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
import { INSIGHT_CONFIG, type Insight } from "@/types/insight";

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

interface InsightCardProps {
  /** The insight to display */
  insight: Insight;
  /** Additional CSS classes */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Whether to show compact version */
  compact?: boolean;
}

/**
 * A card component that displays a single insight with full details.
 *
 * Shows the insight type, content, speaker, and timestamp.
 * Used in the insights panel and summary views.
 *
 * @example
 * ```tsx
 * <InsightCard
 *   insight={insight}
 *   onClick={() => scrollToTranscript(insight.transcriptRef)}
 * />
 * ```
 */
export function InsightCard({
  insight,
  className,
  onClick,
  compact = false,
}: InsightCardProps) {
  const config = INSIGHT_CONFIG[insight.type];
  const IconComponent = ICONS[config.icon];
  const timestamp = new Date(insight.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!IconComponent) {
    return null;
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left p-2 rounded-lg transition-all",
          "hover:shadow-sm cursor-pointer",
          config.bgColor,
          className
        )}
        type="button"
      >
        <div className="flex items-start gap-2">
          <IconComponent className={cn("size-4 mt-0.5 shrink-0", config.color)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm line-clamp-2">{insight.content}</p>
            {insight.speakerName && (
              <p className="text-xs text-muted-foreground mt-1">
                {insight.speakerName}
              </p>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md border-0",
        config.bgColor,
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "p-2 rounded-full shrink-0",
              "bg-background/50"
            )}
          >
            <IconComponent className={cn("size-4", config.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn("text-xs font-medium", config.color)}>
                {config.label}
              </span>

              {insight.speaker && (
                <div className="flex items-center gap-1">
                  <Avatar className="size-4">
                    <AvatarFallback
                      className={cn(
                        "text-[8px] text-white",
                        getHashedColor(insight.speaker)
                      )}
                    >
                      {getInitials(insight.speakerName || insight.speaker)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">
                    {insight.speakerName || insight.speaker}
                  </span>
                </div>
              )}

              <span className="text-xs text-muted-foreground ml-auto">
                {timestamp}
              </span>
            </div>

            {/* Content text */}
            <p className="text-sm">{insight.content}</p>

            {/* Confidence indicator (optional, subtle) */}
            {insight.confidence < 0.7 && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Low confidence ({Math.round(insight.confidence * 100)}%)
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A list of insight cards with optional grouping by type.
 */
export function InsightCardList({
  insights,
  className,
  onInsightClick,
  compact = false,
  emptyMessage = "No insights yet",
}: {
  insights: Insight[];
  className?: string;
  onInsightClick?: (insight: Insight) => void;
  compact?: boolean;
  emptyMessage?: string;
}) {
  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <Search className="mb-2 size-8 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
        <p className="text-xs">
          Insights will appear here as they are detected
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {insights.map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onClick={() => onInsightClick?.(insight)}
          compact={compact}
        />
      ))}
    </div>
  );
}
