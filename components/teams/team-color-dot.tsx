"use client";

import { ColorDot } from "@/components/ui/color-dot";

interface TeamColorDotProps {
  /** Hex color value (e.g., #3B82F6) */
  color: string | null | undefined;
  /** Size variant */
  size?: "xs" | "sm" | "md";
  /** Additional className */
  className?: string;
}

const DEFAULT_TEAM_COLOR = "#6366F1"; // Indigo

/**
 * A colored dot indicator for teams.
 * Wrapper around ColorDot with team-specific default color.
 */
export function TeamColorDot({ color, size = "sm", className }: TeamColorDotProps) {
  return (
    <ColorDot
      color={color}
      defaultColor={DEFAULT_TEAM_COLOR}
      size={size}
      className={className}
    />
  );
}
