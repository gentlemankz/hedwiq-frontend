"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ParsedReference } from "@/types/agent";
import {
  getEntityColorClasses,
  getCustomColorStyles,
  hasCustomColor,
  getParsedReferenceIcon,
} from "@/lib/agents";

// ============================================================================
// Types
// ============================================================================

export interface MentionTagProps {
  /** The parsed reference to display */
  reference: ParsedReference;
  /** Size variant */
  size?: "sm" | "md";
  /** Whether to show tooltip */
  showTooltip?: boolean;
  /** Additional className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * MentionTag - Displays a mention reference as an inline tag/chip
 *
 * Features:
 * - Color-coded by type (folder, team, service)
 * - Shows icon based on type
 * - Highlights unresolved references with warning style
 * - Optional tooltip with additional info
 *
 * Note: This component expects a TooltipProvider to be present higher in the tree.
 * The parent component (e.g., TextWithMentions) should wrap content with TooltipProvider.
 */
export function MentionTag({
  reference,
  size = "sm",
  showTooltip = true,
  className,
}: MentionTagProps) {
  const isResolved = !!reference.entityId;
  const useCustomColor = hasCustomColor(reference);
  const isGmailService =
    reference.type === "service" && reference.name.toLowerCase() === "gmail";
  const colors = getEntityColorClasses(reference.type, isResolved);
  const customStyles =
    isGmailService
      ? { backgroundColor: "transparent", color: "#000000", borderColor: "transparent" }
      : useCustomColor && reference.color
        ? getCustomColorStyles(reference.color)
        : undefined;

  const tag = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium",
        // Only use Tailwind classes if no custom color
        !customStyles && colors.bg,
        !customStyles && colors.text,
        !customStyles && colors.border,
        size === "sm" && "px-1.5 py-0.5 text-xs",
        size === "md" && "px-2 py-1 text-sm",
        className
      )}
      style={customStyles}
    >
      {getParsedReferenceIcon(reference)}
      <span>{reference.name}</span>
    </span>
  );

  if (!showTooltip) {
    return tag;
  }

  const tooltipContent = isResolved
    ? `${reference.type.charAt(0).toUpperCase() + reference.type.slice(1)}: ${reference.name}`
    : `Unresolved ${reference.type}: "${reference.name}"`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{tag}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltipContent}
        {!isResolved && (
          <p className="text-amber-500 mt-1">This reference could not be found</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Text with Mentions Component
// ============================================================================

export interface TextWithMentionsProps {
  /** Raw text containing @ mentions */
  text: string;
  /** Parsed references to highlight */
  references: ParsedReference[];
  /** Size variant for tags */
  tagSize?: "sm" | "md";
  /** Additional className for the container */
  className?: string;
}

/**
 * TextWithMentions - Renders text with mentions highlighted as tags
 *
 * Replaces @ mention patterns in text with MentionTag components.
 * Wraps content with TooltipProvider for tooltip support.
 */
export function TextWithMentions({
  text,
  references,
  tagSize = "sm",
  className,
}: TextWithMentionsProps) {
  if (references.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // Build a map of rawText -> reference for quick lookup
  const refMap = new Map<string, ParsedReference>();
  for (const ref of references) {
    refMap.set(ref.rawText, ref);
  }

  // Split text by mentions and rebuild with tags
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Find all mentions in order (using safe regex pattern with escaped quote support)
  // IMPORTANT: Must match the regex in instruction-parser.ts - single word only for unquoted mentions
  const mentionRegex = /@(?:"((?:[^"\\]|\\"){1,100})"|([A-Za-z0-9_-]{1,50}))(?=\s|$|[.,!?;:)])/g;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Check if we have a reference for this match
    const ref = refMap.get(match[0]);
    if (ref) {
      parts.push(
        <MentionTag
          key={`${match.index}-${ref.name}`}
          reference={ref}
          size={tagSize}
          showTooltip
        />
      );
    } else {
      // No reference found, just render as text
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // Single TooltipProvider wraps all tags
  return (
    <TooltipProvider>
      <span className={cn("whitespace-pre-wrap", className)}>{parts}</span>
    </TooltipProvider>
  );
}
