"use client";

import { cn } from "@/lib/utils";

interface ColorDotProps {
  /** Hex color value (e.g., #3B82F6) */
  color: string | null | undefined;
  /** Fallback color if color is null/undefined */
  defaultColor?: string;
  /** Size variant */
  size?: "xs" | "sm" | "md";
  /** Additional className */
  className?: string;
}

const sizeClasses = {
  xs: "size-2",
  sm: "size-3",
  md: "size-4",
} as const;

const DEFAULT_FALLBACK_COLOR = "#6366F1"; // Indigo

/**
 * A colored dot indicator.
 * Provides consistent styling across the app for color indicators.
 */
export function ColorDot({
  color,
  defaultColor = DEFAULT_FALLBACK_COLOR,
  size = "sm",
  className,
}: ColorDotProps) {
  return (
    <span
      className={cn("rounded-full shrink-0", sizeClasses[size], className)}
      style={{ backgroundColor: color || defaultColor }}
      aria-hidden="true"
    />
  );
}
