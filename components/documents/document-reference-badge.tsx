"use client";

import { cn } from "@/lib/utils";
import { FileText, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DocumentReference } from "@/types/document";

interface DocumentReferenceBadgeProps {
  /** The document reference data */
  reference: DocumentReference;
  /** Document title for display */
  documentTitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Click handler to open document viewer */
  onClick?: () => void;
  /** Whether to show the page number */
  showPageNumber?: boolean;
}

/**
 * A badge component that displays a document reference.
 *
 * Shows the document title and page number, with full context in tooltip.
 * Used inline with transcript entries to indicate referenced documents.
 *
 * @example
 * ```tsx
 * <DocumentReferenceBadge
 *   reference={reference}
 *   documentTitle="Q4 Financial Report"
 *   onClick={() => openDocumentViewer(reference)}
 * />
 * ```
 */
export function DocumentReferenceBadge({
  reference,
  documentTitle,
  className,
  onClick,
  showPageNumber = true,
}: DocumentReferenceBadgeProps) {
  const displayTitle = documentTitle || `Document`;
  const truncatedTitle =
    displayTitle.length > 20
      ? `${displayTitle.slice(0, 17)}...`
      : displayTitle;

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
              "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
              "border border-blue-200 dark:border-blue-800",
              className
            )}
            type="button"
          >
            <FileText className="size-3" />
            <span className="max-w-[100px] truncate">{truncatedTitle}</span>
            {showPageNumber && (
              <span className="text-blue-500 dark:text-blue-400">
                p.{reference.pageNumber}
              </span>
            )}
            <ExternalLink className="size-2.5 opacity-60" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium text-sm">{displayTitle}</p>
            {reference.sectionTitle && (
              <p className="text-xs text-muted-foreground">
                {reference.sectionTitle}
              </p>
            )}
            <p className="text-sm">{reference.context}</p>
            {reference.matchedText && (
              <p className="text-xs italic text-muted-foreground border-l-2 border-blue-300 pl-2">
                &quot;{reference.matchedText}&quot;
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Page {reference.pageNumber} &middot;{" "}
              {Math.round(reference.confidence * 100)}% match
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * A minimal icon-only version of the document reference badge.
 */
export function DocumentReferenceBadgeIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center size-5 rounded-full",
        "bg-blue-50 dark:bg-blue-950/50",
        className
      )}
    >
      <FileText className="size-3 text-blue-700 dark:text-blue-300" />
    </div>
  );
}
