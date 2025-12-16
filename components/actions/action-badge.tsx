"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ACTION_TYPE_CONFIG,
  ACTION_ICONS,
  type ActionType,
} from "@/types/action";

interface ActionBadgeProps {
  /** The action type to display */
  actionType: ActionType;
  /** Whether to show the icon */
  showIcon?: boolean;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

/**
 * A badge component that displays an action type with icon and/or label.
 *
 * @example
 * ```tsx
 * <ActionBadge actionType="email_followup" />
 * <ActionBadge actionType="task_create" showIcon showLabel={false} />
 * ```
 */
export function ActionBadge({
  actionType,
  showIcon = true,
  showLabel = true,
  size = "sm",
  className,
}: ActionBadgeProps) {
  const config = ACTION_TYPE_CONFIG[actionType];
  const IconComponent = ACTION_ICONS[config.icon];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "size-3",
    md: "size-4",
    lg: "size-5",
  };

  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium gap-1",
        config.badgeColor,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && IconComponent && (
        <IconComponent className={iconSizes[size]} />
      )}
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

/**
 * Just the icon for an action type, without the badge wrapper.
 * Note: This component is exported for future use but not currently used.
 */
export function ActionBadgeIcon({
  actionType,
  className,
}: {
  actionType: ActionType;
  className?: string;
}) {
  const config = ACTION_TYPE_CONFIG[actionType];
  const IconComponent = ACTION_ICONS[config.icon];

  if (!IconComponent) return null;

  return <IconComponent className={cn("size-4", config.color, className)} />;
}
