"use client";

import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamColorDotProps {
  /** Hex color value (e.g., #3B82F6) */
  color: string | null | undefined;
  /** Size variant */
  size?: "xs" | "sm" | "md";
  /** Additional className */
  className?: string;
}

const DEFAULT_TEAM_COLOR = "#6366F1"; // Indigo

const sizePx = {
  xs: 12,
  sm: 14,
  md: 16,
} as const;

/**
 * A colored team indicator.
 * Uses the saved team color as the Gem icon color.
 */
export function TeamColorDot({ color, size = "sm", className }: TeamColorDotProps) {
  const resolvedColor = color || DEFAULT_TEAM_COLOR;

  return (
    <Paperclip
      aria-hidden="true"
      size={sizePx[size]}
      className={cn("shrink-0", className)}
      style={{ color: resolvedColor }}
      fill="currentColor"
      fillOpacity={0.2}
    />
  );
}
