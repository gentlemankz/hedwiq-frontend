"use client";

import { cn, getInitials, getHashedAvatar, getHashedColor } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  Clock,
  User,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import { ActionBadge } from "./action-badge";
import {
  ACTION_TYPE_CONFIG,
  ACTION_ICONS,
  URGENCY_CONFIG,
  CONFIDENCE_THRESHOLD,
  DEFAULT_ACTION_METADATA,
  formatActionTime,
  type ClassifiedAction,
  type ActionStatus,
} from "@/types/action";

/**
 * Status indicator configuration
 */
const STATUS_CONFIG: Record<
  ActionStatus,
  { icon: LucideIcon; label: string; color: string }
> = {
  detected: {
    icon: AlertCircle,
    label: "Ready",
    color: "text-blue-500",
  },
  drafting: {
    icon: Loader2,
    label: "Drafting...",
    color: "text-amber-500",
  },
  draft_ready: {
    icon: FileText,
    label: "Draft Ready",
    color: "text-green-500",
  },
  sent: {
    icon: CheckCircle2,
    label: "Sent",
    color: "text-green-600",
  },
  rejected: {
    icon: AlertCircle,
    label: "Dismissed",
    color: "text-gray-400",
  },
};

interface ActionCardProps {
  /** The classified action to display */
  action: ClassifiedAction;
  /** Additional CSS classes */
  className?: string;
  /** Click handler for the card */
  onClick?: () => void;
  /** Handler for the primary action button (e.g., "Generate Email") */
  onAction?: () => void;
  /** Whether to show compact version */
  compact?: boolean;
  /** Whether to show the action button */
  showActionButton?: boolean;
}

/**
 * A card component that displays a classified action with full details.
 *
 * Shows the action type badge, content, speaker, metadata hints, and status.
 * Used in the actions panel and summary views.
 *
 * @example
 * ```tsx
 * <ActionCard
 *   action={action}
 *   onClick={() => scrollToTranscript(action.transcriptRef)}
 *   onAction={() => generateEmailDraft(action)}
 * />
 * ```
 */
export function ActionCard({
  action,
  className,
  onClick,
  onAction,
  compact = false,
  showActionButton = true,
}: ActionCardProps) {
  const config = ACTION_TYPE_CONFIG[action.actionType];
  const IconComponent = ACTION_ICONS[config.icon];
  const statusConfig = STATUS_CONFIG[action.status];
  const StatusIcon = statusConfig.icon;

  // Safely access metadata with defaults
  const metadata = action.metadata ?? DEFAULT_ACTION_METADATA;
  const urgencyConfig = URGENCY_CONFIG[metadata.urgency ?? "normal"];

  const timestamp = formatActionTime(action.timestamp);

  // Determine if action button should be shown
  const canTakeAction =
    showActionButton &&
    action.requiresEmail &&
    (action.status === "detected" || action.status === "draft_ready");

  const actionButtonLabel =
    action.status === "detected"
      ? "Generate Email"
      : action.status === "draft_ready"
        ? "View Draft"
        : null;

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
        aria-label={`Action: ${action.content}`}
      >
        <div className="flex items-start gap-2">
          <IconComponent
            className={cn("size-4 mt-0.5 shrink-0", config.color)}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ActionBadge
                actionType={action.actionType}
                showLabel={false}
                size="sm"
              />
              {metadata.urgency && metadata.urgency !== "normal" && (
                <span
                  className={cn("text-xs font-medium", urgencyConfig.color)}
                >
                  {urgencyConfig.label}
                </span>
              )}
            </div>
            <p className="text-sm line-clamp-2">{action.content}</p>
            {action.speakerName && (
              <p className="text-xs text-muted-foreground mt-1">
                {action.speakerName}
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
        "transition-all hover:shadow-md border-0",
        onClick && "cursor-pointer focus-within:ring-2 focus-within:ring-ring",
        config.bgColor,
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn("p-2 rounded-full shrink-0", "bg-background/50")}
            aria-hidden="true"
          >
            <IconComponent className={cn("size-4", config.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header with badges */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <ActionBadge actionType={action.actionType} size="sm" />

              {/* Urgency badge (if not normal) */}
              {metadata.urgency && metadata.urgency !== "normal" && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs px-1.5 py-0",
                    urgencyConfig.color,
                    "border-current"
                  )}
                >
                  {urgencyConfig.label}
                </Badge>
              )}

              {/* Status indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <StatusIcon
                      className={cn(
                        "size-3.5",
                        statusConfig.color,
                        action.status === "drafting" && "animate-spin"
                      )}
                      aria-label={statusConfig.label}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{statusConfig.label}</p>
                </TooltipContent>
              </Tooltip>

              {/* Speaker & Timestamp */}
              <div className="flex items-center gap-2 ml-auto">
                {action.speaker && (
                  <div className="flex items-center gap-1">
                    <Avatar className="size-4">
                      <AvatarImage
                        src={getHashedAvatar(action.speaker)}
                        alt={action.speakerName || action.speaker}
                      />
                      <AvatarFallback
                        className={cn(
                          "text-[8px] text-white",
                          getHashedColor(action.speaker)
                        )}
                      >
                        {getInitials(action.speakerName || action.speaker)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {action.speakerName || action.speaker}
                    </span>
                  </div>
                )}

                <span className="text-xs text-muted-foreground">
                  {timestamp}
                </span>
              </div>
            </div>

            {/* Content text */}
            <p className="text-sm">{action.content}</p>

            {/* Metadata hints (if any) */}
            {(metadata.recipientHint ||
              metadata.subjectHint ||
              metadata.assigneeHint ||
              metadata.datetimeHint) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {metadata.recipientHint && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="size-3" aria-hidden="true" />
                    <span>{metadata.recipientHint}</span>
                  </div>
                )}
                {metadata.subjectHint && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-3" aria-hidden="true" />
                    <span className="truncate max-w-[150px]">
                      {metadata.subjectHint}
                    </span>
                  </div>
                )}
                {metadata.assigneeHint && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="size-3" aria-hidden="true" />
                    <span>{metadata.assigneeHint}</span>
                  </div>
                )}
                {metadata.datetimeHint && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" aria-hidden="true" />
                    <span>{metadata.datetimeHint}</span>
                  </div>
                )}
              </div>
            )}

            {/* Confidence indicator (if low) */}
            {action.classificationConfidence < CONFIDENCE_THRESHOLD && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Low confidence (
                {Math.round(action.classificationConfidence * 100)}%)
              </p>
            )}

            {/* Action button */}
            {canTakeAction && actionButtonLabel && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.();
                  }}
                >
                  <Mail className="size-4 mr-2" aria-hidden="true" />
                  {actionButtonLabel}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A list of action cards.
 * Note: This component is exported for future use in dedicated actions panel.
 */
export function ActionCardList({
  actions,
  className,
  onActionClick,
  onAction,
  compact = false,
  showActionButtons = true,
  emptyMessage = "No actions detected",
}: {
  actions: ClassifiedAction[];
  className?: string;
  onActionClick?: (action: ClassifiedAction) => void;
  onAction?: (action: ClassifiedAction) => void;
  compact?: boolean;
  showActionButtons?: boolean;
  emptyMessage?: string;
}) {
  if (actions.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground"
        role="status"
        aria-label={emptyMessage}
      >
        <ListTodo className="mb-2 size-8 opacity-50" aria-hidden="true" />
        <p className="text-sm">{emptyMessage}</p>
        <p className="text-xs">
          Actions will appear here as they are classified
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} role="list">
      {actions.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          onClick={() => onActionClick?.(action)}
          onAction={() => onAction?.(action)}
          compact={compact}
          showActionButton={showActionButtons}
        />
      ))}
    </div>
  );
}
