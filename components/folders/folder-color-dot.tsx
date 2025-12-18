"use client";

import { cn } from "@/lib/utils";

interface FolderColorDotProps {
  /** Hex color value (e.g., #3B82F6) */
  color: string | null | undefined;
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

const DEFAULT_COLOR = "#3B82F6"; // Blue

/**
 * A colored dot indicator for folders.
 * Provides consistent styling across the app for folder color indicators.
 */
export function FolderColorDot({
  color,
  size = "sm",
  className,
}: FolderColorDotProps) {
  return (
    <span
      className={cn("rounded-full shrink-0", sizeClasses[size], className)}
      style={{ backgroundColor: color || DEFAULT_COLOR }}
      aria-hidden="true"
    />
  );
}
