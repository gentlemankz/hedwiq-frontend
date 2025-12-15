"use client";

import * as React from "react";
import { Quote, Trash2, Edit2, Check, X, Clock } from "lucide-react";
import { cn, getInitials, getHashedAvatar, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TranscriptNote } from "@/types/transcript-note";

// ============================================================================
// Types
// ============================================================================

export interface TranscriptNoteCardProps {
  /** The transcript note to display */
  note: TranscriptNote;
  /** Callback when note is updated */
  onUpdate?: (id: string, content: string) => void;
  /** Callback when note is deleted */
  onDelete?: (id: string) => void;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_QUOTE_LENGTH = 80;

// ============================================================================
// Component
// ============================================================================

/**
 * A card component that displays a transcript-linked note.
 * Shows the original speech quote and the user's note with edit/delete actions.
 */
export const TranscriptNoteCard = React.memo(function TranscriptNoteCard({
  note,
  onUpdate,
  onDelete,
  className,
}: TranscriptNoteCardProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(note.content);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const { reference } = note;

  // Truncate quote for display
  const truncatedQuote =
    reference.transcriptText.length > MAX_QUOTE_LENGTH
      ? `${reference.transcriptText.slice(0, MAX_QUOTE_LENGTH)}...`
      : reference.transcriptText;

  // Format timestamp
  const timeAgo = formatRelativeTime(note.createdAt);

  // Focus textarea when editing starts
  React.useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Reset edit content when note changes
  React.useEffect(() => {
    setEditContent(note.content);
  }, [note.content]);

  // Handle save
  const handleSave = React.useCallback(() => {
    if (!editContent.trim()) return;
    onUpdate?.(note.id, editContent.trim());
    setIsEditing(false);
  }, [note.id, editContent, onUpdate]);

  // Handle cancel
  const handleCancel = React.useCallback(() => {
    setEditContent(note.content);
    setIsEditing(false);
  }, [note.content]);

  // Handle keyboard shortcuts in edit mode
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-3 space-y-2 transition-colors",
        "hover:border-border/80",
        className
      )}
    >
      {/* Quote Section - shows the original speech */}
      <div className="flex gap-2 p-2 rounded-md bg-muted/40">
        <Quote className="size-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Avatar className="size-4">
              <AvatarImage
                src={getHashedAvatar(reference.participantIdentity)}
                alt={reference.participantName}
              />
              <AvatarFallback className="text-[6px]">
                {getInitials(reference.participantName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-medium text-muted-foreground">
              {reference.participantName}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/80 italic leading-relaxed">
            &ldquo;{truncatedQuote}&rdquo;
          </p>
        </div>
      </div>

      {/* Note Content */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] text-sm resize-none"
          />
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleCancel}
            >
              <X className="size-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              onClick={handleSave}
              disabled={!editContent.trim()}
            >
              <Check className="size-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {note.content}
          </p>
        </div>
      )}

      {/* Footer with timestamp and actions */}
      {!isEditing && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Clock className="size-3" />
            <span>{timeAgo}</span>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground/60 hover:text-foreground"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Edit note
                </TooltipContent>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground/60 hover:text-destructive"
                    onClick={() => onDelete(note.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Delete note
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
