"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENDA_CONSTANTS } from "@/types/agenda";
import type { AgendaItem } from "@/types/agenda";

// ============================================================================
// Types
// ============================================================================

interface AgendaItemFormProps {
  /** Callback when a new item is added */
  onAdd: (item: Omit<AgendaItem, "id" | "order">) => void;
  /** Disable the form */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Form for adding a new agenda item.
 * Includes title (required), description (optional), and time estimate (optional).
 */
export function AgendaItemForm({
  onAdd,
  disabled = false,
  className,
}: AgendaItemFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>("");
  const [leadBy, setLeadBy] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // Validate title
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError("Title is required");
        return;
      }

      if (trimmedTitle.length > AGENDA_CONSTANTS.MAX_TITLE_LENGTH) {
        setError(`Title must be ${AGENDA_CONSTANTS.MAX_TITLE_LENGTH} characters or less`);
        return;
      }

      // Validate description
      const trimmedDescription = description.trim();
      if (trimmedDescription.length > AGENDA_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
        setError(`Description must be ${AGENDA_CONSTANTS.MAX_DESCRIPTION_LENGTH} characters or less`);
        return;
      }

      // Validate time estimate
      let minutes: number | undefined;
      if (estimatedMinutes) {
        minutes = parseInt(estimatedMinutes, 10);
        if (isNaN(minutes) || minutes < 1 || minutes > AGENDA_CONSTANTS.MAX_ITEM_MINUTES) {
          setError(`Time estimate must be between 1 and ${AGENDA_CONSTANTS.MAX_ITEM_MINUTES} minutes`);
          return;
        }
      }

      // Create new item
      onAdd({
        title: trimmedTitle,
        description: trimmedDescription || undefined,
        estimatedMinutes: minutes,
        leadBy: leadBy.trim() || undefined,
      });

      // Reset form
      setTitle("");
      setDescription("");
      setEstimatedMinutes("");
      setLeadBy("");
      setIsExpanded(false);
    },
    [title, description, estimatedMinutes, leadBy, onAdd]
  );

  const handleCancel = useCallback(() => {
    setTitle("");
    setDescription("");
    setEstimatedMinutes("");
    setLeadBy("");
    setError(null);
    setIsExpanded(false);
  }, []);

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        disabled={disabled}
        className={cn("w-full", className)}
      >
        <Plus className="mr-2 size-4" />
        Add Agenda Item
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-3", className)}>
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {/* Title Field */}
        <div className="space-y-2">
          <Label htmlFor="agenda-title">
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="agenda-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Technical Requirements Review"
            maxLength={AGENDA_CONSTANTS.MAX_TITLE_LENGTH}
            disabled={disabled}
            autoFocus
          />
        </div>

        {/* Description Field */}
        <div className="space-y-2">
          <Label htmlFor="agenda-description">Description (optional)</Label>
          <Textarea
            id="agenda-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what will be discussed"
            maxLength={AGENDA_CONSTANTS.MAX_DESCRIPTION_LENGTH}
            rows={2}
            disabled={disabled}
          />
        </div>

        {/* Time and Lead By Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="agenda-time">Time Estimate (min)</Label>
            <Input
              id="agenda-time"
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder={String(AGENDA_CONSTANTS.DEFAULT_ITEM_MINUTES)}
              min={1}
              max={AGENDA_CONSTANTS.MAX_ITEM_MINUTES}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agenda-lead">Led By (optional)</Label>
            <Input
              id="agenda-lead"
              value={leadBy}
              onChange={(e) => setLeadBy(e.target.value)}
              placeholder="e.g., John"
              disabled={disabled}
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={disabled}
          >
            <X className="mr-1 size-4" />
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={disabled}>
            <Plus className="mr-1 size-4" />
            Add Item
          </Button>
        </div>
      </div>
    </form>
  );
}
