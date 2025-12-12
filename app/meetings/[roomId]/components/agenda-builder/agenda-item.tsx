"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftAgendaItem } from "@/types/agenda";
import { AGENDA_LIMITS } from "@/types/agenda";
import {
  getAgendaFieldErrors,
  hasAgendaFieldErrors,
  type AgendaItemFieldErrors,
} from "@/lib/validation/agenda";

// ============================================================================
// Types
// ============================================================================

interface AgendaItemProps {
  /** The agenda item data */
  item: DraftAgendaItem;
  /** Called when item is updated */
  onUpdate: (id: string, updates: Partial<Omit<DraftAgendaItem, "id">>) => void;
  /** Called when item is deleted */
  onDelete: (id: string) => void;
  /** Whether the item is disabled (e.g., during save) */
  disabled?: boolean;
  /** Index for display (1-based) */
  index: number;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A single agenda item with inline editing, drag handle, and delete.
 * Uses @dnd-kit/sortable for drag-and-drop functionality.
 */
export function AgendaItem({
  item,
  onUpdate,
  onDelete,
  disabled = false,
  index,
}: AgendaItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // Edit form state - initialized from item values when entering edit mode
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPresenter, setEditPresenter] = useState("");
  const [errors, setErrors] = useState<AgendaItemFieldErrors>({});

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sortable hook for drag-and-drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Focus title input when entering edit mode
  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  /**
   * Enter edit mode - initialize edit form state from current item values
   */
  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    // Initialize edit state from current item values
    setEditTitle(item.title);
    setEditDescription(item.description || "");
    setEditDuration(item.estimatedDuration?.toString() || "");
    setEditPresenter(item.presenter || "");
    setIsEditing(true);
    setErrors({});
  }, [disabled, item.title, item.description, item.estimatedDuration, item.presenter]);

  /**
   * Cancel editing and reset values
   */
  const handleCancelEdit = useCallback(() => {
    setEditTitle(item.title);
    setEditDescription(item.description || "");
    setEditDuration(item.estimatedDuration?.toString() || "");
    setEditPresenter(item.presenter || "");
    setIsEditing(false);
    setErrors({});
  }, [item]);

  /**
   * Save changes - uses centralized validation
   */
  const handleSaveEdit = useCallback(() => {
    // Validate all fields using centralized validation
    const fieldErrors = getAgendaFieldErrors({
      title: editTitle,
      description: editDescription,
      estimatedDuration: editDuration,
      presenter: editPresenter,
    });

    if (hasAgendaFieldErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }

    // Parse duration (already validated)
    let duration: number | undefined;
    if (editDuration.trim()) {
      duration = parseInt(editDuration, 10);
    }

    onUpdate(item.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      estimatedDuration: duration,
      presenter: editPresenter.trim() || undefined,
    });

    setIsEditing(false);
    setErrors({});
  }, [item.id, editTitle, editDescription, editDuration, editPresenter, onUpdate]);

  /**
   * Handle keyboard events in edit mode
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  /**
   * Handle delete confirmation
   */
  const handleDelete = useCallback(() => {
    if (disabled) return;
    onDelete(item.id);
  }, [disabled, item.id, onDelete]);

  /**
   * Toggle expanded state for details
   */
  const toggleExpanded = useCallback(() => {
    if (!isEditing) {
      setIsExpanded((prev) => !prev);
    }
  }, [isEditing]);

  const hasDetails = item.description || item.estimatedDuration || item.presenter;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-md border bg-card transition-all",
        isDragging && "opacity-50 shadow-lg z-50",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 p-3">
        {/* Drag handle */}
        <button
          type="button"
          className={cn(
            "cursor-grab touch-none text-muted-foreground hover:text-foreground transition-colors",
            isDragging && "cursor-grabbing"
          )}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>

        {/* Index badge */}
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {index}
        </span>

        {/* Content */}
        {isEditing ? (
          <div className="flex-1 space-y-2">
            {/* Title input */}
            <div>
              <Input
                ref={titleInputRef}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  if (errors.title) {
                    setErrors((prev) => ({ ...prev, title: undefined }));
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Topic title"
                maxLength={AGENDA_LIMITS.MAX_TITLE_LENGTH}
                aria-invalid={!!errors.title}
                className={cn(errors.title && "border-destructive")}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            {/* Optional fields */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground shrink-0" />
                  <Input
                    value={editDuration}
                    onChange={(e) => {
                      setEditDuration(e.target.value);
                      if (errors.estimatedDuration) {
                        setErrors((prev) => ({ ...prev, estimatedDuration: undefined }));
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Duration (min)"
                    type="number"
                    min={AGENDA_LIMITS.MIN_DURATION_MINUTES}
                    max={AGENDA_LIMITS.MAX_DURATION_MINUTES}
                    aria-invalid={!!errors.estimatedDuration}
                    className={cn("h-8", errors.estimatedDuration && "border-destructive")}
                  />
                </div>
                {errors.estimatedDuration && (
                  <p className="text-xs text-destructive pl-6">{errors.estimatedDuration}</p>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <Input
                    value={editPresenter}
                    onChange={(e) => {
                      setEditPresenter(e.target.value);
                      if (errors.presenter) {
                        setErrors((prev) => ({ ...prev, presenter: undefined }));
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Presenter"
                    maxLength={AGENDA_LIMITS.MAX_PRESENTER_LENGTH}
                    aria-invalid={!!errors.presenter}
                    className={cn("h-8", errors.presenter && "border-destructive")}
                  />
                </div>
                {errors.presenter && (
                  <p className="text-xs text-destructive pl-6">{errors.presenter}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <Textarea
                value={editDescription}
                onChange={(e) => {
                  setEditDescription(e.target.value);
                  if (errors.description) {
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
                placeholder="Description (optional)"
                maxLength={AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH}
                rows={2}
                aria-invalid={!!errors.description}
                className={cn("resize-none", errors.description && "border-destructive")}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-destructive">{errors.description}</p>
              )}
            </div>

            {/* Edit actions */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
              >
                <X className="mr-1 size-3" />
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSaveEdit}>
                <Check className="mr-1 size-3" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Display mode */}
            <div
              className="flex-1 cursor-pointer"
              onClick={toggleExpanded}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && toggleExpanded()}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.title}</span>
                {hasDetails && (
                  <span className="text-muted-foreground">
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </span>
                )}
              </div>

              {/* Inline metadata */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {item.estimatedDuration && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {item.estimatedDuration} min
                  </span>
                )}
                {item.presenter && (
                  <span className="flex items-center gap-1">
                    <User className="size-3" />
                    {item.presenter}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={handleStartEdit}
                aria-label="Edit item"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                onClick={handleDelete}
                aria-label="Delete item"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Expanded details */}
      {!isEditing && isExpanded && item.description && (
        <div className="border-t px-3 py-2 text-sm text-muted-foreground">
          {item.description}
        </div>
      )}
    </div>
  );
}
