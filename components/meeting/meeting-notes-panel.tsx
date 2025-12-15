"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ============================================================================
// Types
// ============================================================================

export interface MeetingNotesPanelProps {
  /** Meeting title to display in the header */
  meetingTitle?: string;
  /** Controlled expanded state */
  isExpanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Current notes content */
  notes?: string;
  /** Callback when notes change */
  onNotesChange?: (notes: string) => void;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Height when expanded (in pixels) - provides comfortable editing space */
const EXPANDED_HEIGHT = 400;
/** Height when collapsed - just enough for the grabber bar */
const COLLAPSED_HEIGHT = 28;

// ============================================================================
// Component
// ============================================================================

/**
 * A bottom sheet-style notes panel for taking meeting notes.
 *
 * Supports both controlled and uncontrolled modes:
 * - Controlled: Pass `isExpanded`, `onExpandedChange`, `notes`, `onNotesChange`
 * - Uncontrolled: Component manages its own state
 *
 * For persistence, use with the `useNotesPanel` hook.
 *
 * @example
 * ```tsx
 * // Controlled mode with useNotesPanel hook
 * const { notes, setNotes, isExpanded, setExpanded } = useNotesPanel({
 *   storageKey: roomId,
 * });
 *
 * <MeetingNotesPanel
 *   meetingTitle="Weekly Sync"
 *   isExpanded={isExpanded}
 *   onExpandedChange={setExpanded}
 *   notes={notes}
 *   onNotesChange={setNotes}
 * />
 * ```
 */
export const MeetingNotesPanel = React.memo(function MeetingNotesPanel({
  meetingTitle = "Meeting Notes",
  isExpanded: controlledExpanded,
  onExpandedChange,
  notes: controlledNotes,
  onNotesChange,
  className,
}: MeetingNotesPanelProps) {
  // Internal state for uncontrolled usage (only initialized if needed)
  const [internalExpanded, setInternalExpanded] = React.useState(false);
  const [internalNotes, setInternalNotes] = React.useState("");

  // Determine if we're in controlled mode
  const isControlled = controlledExpanded !== undefined;
  const isNotesControlled = controlledNotes !== undefined;

  // Use controlled or internal state
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;
  const currentNotes = isNotesControlled ? controlledNotes : internalNotes;

  // Stable callback using refs to avoid recreating on every render
  const onExpandedChangeRef = React.useRef(onExpandedChange);
  const onNotesChangeRef = React.useRef(onNotesChange);

  React.useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  React.useEffect(() => {
    onNotesChangeRef.current = onNotesChange;
  }, [onNotesChange]);

  // Stable handlers that don't change reference
  const handleSetExpanded = React.useCallback((value: boolean) => {
    if (onExpandedChangeRef.current) {
      onExpandedChangeRef.current(value);
    } else {
      setInternalExpanded(value);
    }
  }, []);

  const handleSetNotes = React.useCallback((value: string) => {
    if (onNotesChangeRef.current) {
      onNotesChangeRef.current(value);
    } else {
      setInternalNotes(value);
    }
  }, []);

  // Toggle handler
  const handleToggle = React.useCallback(() => {
    handleSetExpanded(!isExpanded);
  }, [handleSetExpanded, isExpanded]);

  // Keyboard handler for accessibility
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  // Handle textarea change
  const handleNotesChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleSetNotes(e.target.value);
    },
    [handleSetNotes]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col bg-background/95 backdrop-blur-sm border-t border-border",
        "transition-[height] duration-200 ease-out",
        className
      )}
      style={{
        height: isExpanded ? EXPANDED_HEIGHT + COLLAPSED_HEIGHT : COLLAPSED_HEIGHT,
      }}
    >
      {/* Grabber Handle */}
      <div
        className={cn(
          "flex items-center justify-center h-7 cursor-pointer group",
          "hover:bg-muted/50 transition-colors"
        )}
        onClick={handleToggle}
        role="button"
        aria-label={isExpanded ? "Collapse notes panel" : "Expand notes panel"}
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-10 h-1 rounded-full bg-muted-foreground/30 transition-colors",
              "group-hover:bg-muted-foreground/50"
            )}
          />
          {!isExpanded && (
            <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors flex items-center gap-1">
              <ChevronUp className="h-3 w-3" />
              Click to open notes
            </span>
          )}
        </div>
      </div>

      {/* Content Area - only render when expanded for performance */}
      {isExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden px-4 pb-3">
          {/* Header */}
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                {meetingTitle}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handleSetExpanded(false)}
              aria-label="Collapse notes"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Notes Content */}
          <div className="flex-1 overflow-y-auto py-2">
            <Textarea
              value={currentNotes}
              onChange={handleNotesChange}
              placeholder="Start typing your meeting notes here...

• Key discussion points
• Action items
• Decisions made
• Follow-ups needed"
              className={cn(
                "min-h-full resize-none border-0 bg-transparent p-0",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted-foreground/50 text-sm leading-relaxed"
              )}
            />
          </div>

          {/* Footer with character count */}
          {currentNotes.length > 0 && (
            <div className="flex justify-end pt-1 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground/50">
                {currentNotes.length.toLocaleString()} characters
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
