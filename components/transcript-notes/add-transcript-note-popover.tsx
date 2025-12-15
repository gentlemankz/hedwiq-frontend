"use client";

import * as React from "react";
import { StickyNote, Send, X } from "lucide-react";
import { cn, getInitials, getHashedAvatar } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { TranscriptReference } from "@/types/transcript-note";

// ============================================================================
// Types
// ============================================================================

export interface AddTranscriptNotePopoverProps {
  /** Transcript entry information */
  transcriptId: string;
  participantIdentity: string;
  participantName: string;
  transcriptText: string;
  transcriptTimestamp: number;
  /** Callback when a note is added */
  onAddNote: (reference: TranscriptReference, content: string) => void;
  /** Whether there are already notes for this transcript */
  hasNotes?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_QUOTE_LENGTH = 100;

// ============================================================================
// Component
// ============================================================================

/**
 * A popover for adding notes linked to a specific transcription entry.
 * Shows the original quote and allows the user to write their note.
 */
export const AddTranscriptNotePopover = React.memo(
  function AddTranscriptNotePopover({
    transcriptId,
    participantIdentity,
    participantName,
    transcriptText,
    transcriptTimestamp,
    onAddNote,
    hasNotes = false,
    className,
  }: AddTranscriptNotePopoverProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [noteContent, setNoteContent] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Focus textarea when popover opens
    React.useEffect(() => {
      if (isOpen && textareaRef.current) {
        // Small delay to ensure popover is fully rendered
        const timer = setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [isOpen]);

    // Reset content when popover closes
    React.useEffect(() => {
      if (!isOpen) {
        setNoteContent("");
      }
    }, [isOpen]);

    // Truncate text for display
    const truncatedText =
      transcriptText.length > MAX_QUOTE_LENGTH
        ? `${transcriptText.slice(0, MAX_QUOTE_LENGTH)}...`
        : transcriptText;

    // Handle submit
    const handleSubmit = React.useCallback(() => {
      if (!noteContent.trim()) return;

      const reference: TranscriptReference = {
        transcriptId,
        participantIdentity,
        participantName,
        transcriptText,
        transcriptTimestamp,
      };

      onAddNote(reference, noteContent.trim());
      setNoteContent("");
      setIsOpen(false);
    }, [
      noteContent,
      transcriptId,
      participantIdentity,
      participantName,
      transcriptText,
      transcriptTimestamp,
      onAddNote,
    ]);

    // Handle keyboard shortcuts
    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        // Submit on Cmd/Ctrl + Enter
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          handleSubmit();
        }
        // Close on Escape
        if (e.key === "Escape") {
          setIsOpen(false);
        }
      },
      [handleSubmit]
    );

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "size-6 text-muted-foreground/50 hover:text-muted-foreground",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  hasNotes && "text-primary/60 opacity-100",
                  className
                )}
                aria-label="Add note from this speech"
              >
                <StickyNote className="size-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {hasNotes ? "Add another note" : "Add note from this speech"}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="left"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-primary" />
              <span className="text-sm font-medium">Add Note</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Quote Section */}
          <div className="p-3 bg-muted/30 border-b">
            <div className="flex gap-2">
              <Avatar className="size-5 shrink-0">
                <AvatarImage
                  src={getHashedAvatar(participantIdentity)}
                  alt={participantName}
                />
                <AvatarFallback className="text-[8px]">
                  {getInitials(participantName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">
                  {participantName}
                </p>
                <p className="text-xs text-muted-foreground/80 italic line-clamp-2">
                  &ldquo;{truncatedText}&rdquo;
                </p>
              </div>
            </div>
          </div>

          {/* Note Input */}
          <div className="p-3">
            <Textarea
              ref={textareaRef}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your note here..."
              className="min-h-[80px] text-sm resize-none border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-3 pt-0">
            <span className="text-[10px] text-muted-foreground/60">
              {noteContent.length > 0
                ? `${noteContent.length} characters`
                : "Cmd+Enter to save"}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleSubmit}
              disabled={!noteContent.trim()}
            >
              <Send className="size-3" />
              Add Note
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
