"use client";

import { cn, getInitials, getHashedAvatar, getHashedColor } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
import { ActionBadge } from "@/components/actions/action-badge";
import { CONFIDENCE_THRESHOLD, type ClassifiedAction } from "@/types/action";

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
  /** Classified action data (if this insight has been classified) */
  classifiedAction?: ClassifiedAction;
  /** Handler for action button (e.g., "Generate Email") */
  onActionClick?: (action: ClassifiedAction) => void;
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
  classifiedAction,
  onActionClick,
}: InsightCardProps) {
  const config = INSIGHT_CONFIG[insight.type];
  const IconComponent = ICONS[config.icon];
  const timestamp = new Date(insight.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Check if this is an action item with classification
  const isClassifiedAction =
    insight.type === "action_item" && classifiedAction;

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
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          config.bgColor,
          className
        )}
        type="button"
        aria-label={`${config.label}: ${insight.content.slice(0, 50)}`}
      >
        <div className="flex items-start gap-2">
          <IconComponent
            className={cn("size-4 mt-0.5 shrink-0", config.color)}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            {/* Show action type badge in compact mode */}
            {isClassifiedAction && (
              <div className="mb-1">
                <ActionBadge
                  actionType={classifiedAction.actionType}
                  size="sm"
                />
              </div>
            )}
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
        "focus-within:ring-2 focus-within:ring-ring",
        config.bgColor,
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn("p-2 rounded-full shrink-0", "bg-background/50")} aria-hidden="true">
            <IconComponent className={cn("size-4", config.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn("text-xs font-medium", config.color)}>
                {config.label}
              </span>

              {/* Action type badge (when classified) */}
              {isClassifiedAction && (
                <ActionBadge
                  actionType={classifiedAction.actionType}
                  size="sm"
                />
              )}

              {insight.speaker && (
                <div className="flex items-center gap-1">
                  <Avatar className="size-4">
                    <AvatarImage
                      src={getHashedAvatar(insight.speaker)}
                      alt={insight.speakerName || insight.speaker}
                    />
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

            {/* Action metadata hints (when classified) */}
            {isClassifiedAction &&
              (classifiedAction.metadata.recipientHint ||
                classifiedAction.metadata.subjectHint) && (
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                  {classifiedAction.metadata.recipientHint && (
                    <span>To: {classifiedAction.metadata.recipientHint}</span>
                  )}
                  {classifiedAction.metadata.subjectHint && (
                    <span className="truncate max-w-[200px]">
                      Re: {classifiedAction.metadata.subjectHint}
                    </span>
                  )}
                </div>
              )}

            {/* Confidence indicator (optional, subtle) */}
            {insight.confidence < CONFIDENCE_THRESHOLD && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Low confidence ({Math.round(insight.confidence * 100)}%)
              </p>
            )}

            {/* Action button for email-related actions */}
            {isClassifiedAction &&
              classifiedAction.requiresEmail &&
              classifiedAction.status === "detected" &&
              onActionClick && (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionClick(classifiedAction);
                  }}
                  aria-label={`Generate email draft for: ${insight.content.slice(0, 50)}`}
                >
                  Generate Email Draft
                </button>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A list of insight cards with optional grouping by type.
 * Supports displaying classified action badges for action_item insights.
 */
export function InsightCardList({
  insights,
  className,
  onInsightClick,
  compact = false,
  emptyMessage = "No insights yet",
  getActionForInsight,
  onActionClick,
}: {
  insights: Insight[];
  className?: string;
  onInsightClick?: (insight: Insight) => void;
  compact?: boolean;
  emptyMessage?: string;
  /** Optional function to get classified action for an insight */
  getActionForInsight?: (insightId: string) => ClassifiedAction | undefined;
  /** Handler for action button clicks */
  onActionClick?: (action: ClassifiedAction) => void;
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
          classifiedAction={getActionForInsight?.(insight.id)}
          onActionClick={onActionClick}
        />
      ))}
    </div>
  );
}
