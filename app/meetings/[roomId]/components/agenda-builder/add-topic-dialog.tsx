"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Clock, User } from "lucide-react";
import type { DraftAgendaItem } from "@/types/agenda";
import { AGENDA_LIMITS } from "@/types/agenda";

// ============================================================================
// Types
// ============================================================================

interface AddTopicDialogProps {
  /** Called when a new topic is added */
  onAdd: (item: Omit<DraftAgendaItem, "id">) => void;
  /** Whether the add button should be disabled */
  disabled?: boolean;
  /** Optional trigger button content */
  trigger?: React.ReactNode;
}

interface FormErrors {
  title?: string;
  description?: string;
  estimatedDuration?: string;
  presenter?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Dialog for adding a new agenda topic.
 * Includes validation for all fields.
 */
export function AddTopicDialog({
  onAdd,
  disabled = false,
  trigger,
}: AddTopicDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [presenter, setPresenter] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title input when dialog opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      // Small delay to ensure dialog is fully rendered
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /**
   * Reset form state
   */
  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setEstimatedDuration("");
    setPresenter("");
    setErrors({});
    setIsSubmitting(false);
  }, []);

  /**
   * Validate form inputs
   */
  const validateForm = useCallback((): FormErrors => {
    const newErrors: FormErrors = {};

    // Title validation
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < AGENDA_LIMITS.MIN_TITLE_LENGTH) {
      newErrors.title = "Title is required";
    } else if (trimmedTitle.length > AGENDA_LIMITS.MAX_TITLE_LENGTH) {
      newErrors.title = `Title must be ${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters or less`;
    }

    // Description validation (optional)
    if (description.length > AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH) {
      newErrors.description = `Description must be ${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
    }

    // Duration validation (optional)
    if (estimatedDuration.trim()) {
      const duration = parseInt(estimatedDuration, 10);
      if (isNaN(duration)) {
        newErrors.estimatedDuration = "Duration must be a number";
      } else if (
        duration < AGENDA_LIMITS.MIN_DURATION_MINUTES ||
        duration > AGENDA_LIMITS.MAX_DURATION_MINUTES
      ) {
        newErrors.estimatedDuration = `Duration must be between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES} minutes`;
      }
    }

    // Presenter validation (optional)
    if (presenter.length > AGENDA_LIMITS.MAX_PRESENTER_LENGTH) {
      newErrors.presenter = `Presenter must be ${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters or less`;
    }

    return newErrors;
  }, [title, description, estimatedDuration, presenter]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const formErrors = validateForm();
      if (Object.keys(formErrors).length > 0) {
        setErrors(formErrors);
        return;
      }

      setIsSubmitting(true);

      // Parse duration
      let duration: number | undefined;
      if (estimatedDuration.trim()) {
        duration = parseInt(estimatedDuration, 10);
      }

      onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        estimatedDuration: duration,
        presenter: presenter.trim() || undefined,
      });

      resetForm();
      setIsOpen(false);
    },
    [title, description, estimatedDuration, presenter, validateForm, onAdd, resetForm]
  );

  /**
   * Handle dialog close
   */
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetForm();
      }
      setIsOpen(open);
    },
    [resetForm]
  );

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.ctrlKey) {
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full"
          >
            <Plus className="mr-2 size-4" />
            Add Topic
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle>Add Agenda Topic</DialogTitle>
            <DialogDescription>
              Add a new topic to discuss during the meeting.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="topic-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="topic-title"
                ref={titleInputRef}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) {
                    setErrors((prev) => ({ ...prev, title: undefined }));
                  }
                }}
                placeholder="e.g., Q4 Planning Discussion"
                maxLength={AGENDA_LIMITS.MAX_TITLE_LENGTH}
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "title-error" : undefined}
              />
              {errors.title && (
                <p id="title-error" className="text-xs text-destructive">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Duration and Presenter in a row */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Estimated Duration */}
              <div className="grid gap-2">
                <Label htmlFor="topic-duration" className="flex items-center gap-1">
                  <Clock className="size-3" />
                  Duration (minutes)
                </Label>
                <Input
                  id="topic-duration"
                  type="number"
                  value={estimatedDuration}
                  onChange={(e) => {
                    setEstimatedDuration(e.target.value);
                    if (errors.estimatedDuration) {
                      setErrors((prev) => ({ ...prev, estimatedDuration: undefined }));
                    }
                  }}
                  placeholder="e.g., 15"
                  min={AGENDA_LIMITS.MIN_DURATION_MINUTES}
                  max={AGENDA_LIMITS.MAX_DURATION_MINUTES}
                  aria-invalid={!!errors.estimatedDuration}
                  aria-describedby={
                    errors.estimatedDuration ? "duration-error" : undefined
                  }
                />
                {errors.estimatedDuration && (
                  <p id="duration-error" className="text-xs text-destructive">
                    {errors.estimatedDuration}
                  </p>
                )}
              </div>

              {/* Presenter */}
              <div className="grid gap-2">
                <Label htmlFor="topic-presenter" className="flex items-center gap-1">
                  <User className="size-3" />
                  Presenter
                </Label>
                <Input
                  id="topic-presenter"
                  value={presenter}
                  onChange={(e) => {
                    setPresenter(e.target.value);
                    if (errors.presenter) {
                      setErrors((prev) => ({ ...prev, presenter: undefined }));
                    }
                  }}
                  placeholder="e.g., John Doe"
                  maxLength={AGENDA_LIMITS.MAX_PRESENTER_LENGTH}
                  aria-invalid={!!errors.presenter}
                  aria-describedby={errors.presenter ? "presenter-error" : undefined}
                />
                {errors.presenter && (
                  <p id="presenter-error" className="text-xs text-destructive">
                    {errors.presenter}
                  </p>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="topic-description">Description</Label>
              <Textarea
                id="topic-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) {
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
                placeholder="Brief description of what will be discussed..."
                maxLength={AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH}
                rows={3}
                className="resize-none"
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? "description-error" : undefined}
              />
              {errors.description && (
                <p id="description-error" className="text-xs text-destructive">
                  {errors.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {description.length}/{AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Plus className="mr-2 size-4" />
              Add Topic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
