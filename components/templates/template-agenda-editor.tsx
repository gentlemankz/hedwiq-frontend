"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  GripVertical,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import { TEMPLATE_LIMITS, type TemplateAgendaItemInput, type PresenterRole } from "@/types/template";
import { useReorderableList, useStableItemIds } from "@/hooks/use-reorderable-list";

// Duration options for agenda items
const AGENDA_DURATION_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
];

const PRESENTER_ROLE_OPTIONS: { value: PresenterRole; label: string }[] = [
  { value: "host", label: "Host" },
  { value: "participant", label: "Participant" },
  { value: "anyone", label: "Anyone" },
];

interface AgendaItemFormData {
  title: string;
  description: string;
  estimatedDuration: number;
  isRequired: boolean;
  presenterRole?: PresenterRole;
}

const DEFAULT_ITEM: AgendaItemFormData = {
  title: "",
  description: "",
  estimatedDuration: 15,
  isRequired: false,
  presenterRole: undefined,
};

interface TemplateAgendaEditorProps {
  items: TemplateAgendaItemInput[];
  onChange: (items: TemplateAgendaItemInput[]) => void;
  error?: string;
  className?: string;
  maxItems?: number;
  /** When true, displays items in read-only mode without editing controls */
  readOnly?: boolean;
}


export function TemplateAgendaEditor({
  items,
  onChange,
  error,
  className,
  maxItems = TEMPLATE_LIMITS.MAX_AGENDA_ITEMS,
  readOnly = false,
}: TemplateAgendaEditorProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  // Get stable IDs for items using object identity (WeakMap-based)
  const itemIds = useStableItemIds(items, "agenda-item");

  // Use shared reorderable list hook for move operations
  const { moveUp: handleMoveUp, moveDown: handleMoveDown } = useReorderableList(items, onChange);
  const [formData, setFormData] = useState<AgendaItemFormData>(DEFAULT_ITEM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AgendaItemFormData, string>>>({});

  // Calculate total duration
  const totalDuration = useMemo(() => {
    return items.reduce((sum, item) => sum + item.estimatedDuration, 0);
  }, [items]);

  // Validate item form
  const validateForm = useCallback((data: AgendaItemFormData): boolean => {
    const errors: Partial<Record<keyof AgendaItemFormData, string>> = {};

    if (!data.title.trim()) {
      errors.title = "Title is required";
    } else if (data.title.length > TEMPLATE_LIMITS.MAX_ITEM_TITLE_LENGTH) {
      errors.title = `Title must be ${TEMPLATE_LIMITS.MAX_ITEM_TITLE_LENGTH} characters or less`;
    }

    if (data.description && data.description.length > TEMPLATE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH) {
      errors.description = `Description must be ${TEMPLATE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH} characters or less`;
    }

    if (data.estimatedDuration < 1 || data.estimatedDuration > 480) {
      errors.estimatedDuration = "Duration must be between 1 and 480 minutes";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, []);

  // Add new item
  const handleAddItem = useCallback(() => {
    if (!validateForm(formData)) return;

    const newItem: TemplateAgendaItemInput = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      estimatedDuration: formData.estimatedDuration,
      isRequired: formData.isRequired,
      presenterRole: formData.presenterRole,
    };

    onChange([...items, newItem]);
    setFormData(DEFAULT_ITEM);
    setFormErrors({});
    setIsAddDialogOpen(false);
  }, [formData, items, onChange, validateForm]);

  // Update existing item
  const handleUpdateItem = useCallback(() => {
    if (editingIndex === null || !validateForm(formData)) return;

    const updatedItems = [...items];
    updatedItems[editingIndex] = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      estimatedDuration: formData.estimatedDuration,
      isRequired: formData.isRequired,
      presenterRole: formData.presenterRole,
    };

    onChange(updatedItems);
    setFormData(DEFAULT_ITEM);
    setFormErrors({});
    setEditingIndex(null);
  }, [editingIndex, formData, items, onChange, validateForm]);

  // Delete item
  const handleDeleteItem = useCallback(() => {
    if (deleteIndex === null) return;

    const updatedItems = items.filter((_, i) => i !== deleteIndex);
    onChange(updatedItems);
    setDeleteIndex(null);
  }, [deleteIndex, items, onChange]);

  // Open edit dialog
  const handleEditClick = useCallback((index: number) => {
    const item = items[index];
    setFormData({
      title: item.title,
      description: item.description || "",
      estimatedDuration: item.estimatedDuration,
      isRequired: item.isRequired ?? false,
      presenterRole: item.presenterRole,
    });
    setFormErrors({});
    setEditingIndex(index);
  }, [items]);

  // Reset form and close dialogs
  const handleCloseDialog = useCallback(() => {
    setFormData(DEFAULT_ITEM);
    setFormErrors({});
    setIsAddDialogOpen(false);
    setEditingIndex(null);
  }, []);

  const canAddMore = items.length < maxItems;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Agenda Items</Label>
          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "item" : "items"} &middot; {totalDuration} min total
          </p>
        </div>
        {!readOnly && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAddMore}
                onClick={() => {
                  setFormData(DEFAULT_ITEM);
                  setFormErrors({});
                }}
              >
                <Plus className="mr-1 size-4" />
                Add Item
              </Button>
            </DialogTrigger>
            <AgendaItemDialog
              title="Add Agenda Item"
              description="Add a new item to the meeting agenda."
              formData={formData}
              formErrors={formErrors}
              onFormChange={setFormData}
              onSubmit={handleAddItem}
              onClose={handleCloseDialog}
              submitLabel="Add Item"
            />
          </Dialog>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No agenda items yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add at least one item to create your template
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={itemIds[index]}
              className="flex items-start gap-2 rounded-lg border bg-card p-3 group"
            >
              {/* Drag handle / order indicator */}
              <div className="flex flex-col items-center gap-0.5 pt-0.5">
                <GripVertical className="size-4 text-muted-foreground/50" />
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
              </div>

              {/* Item content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{item.title}</span>
                  {item.isRequired && (
                    <span className="shrink-0 text-xs text-orange-600 dark:text-orange-400">
                      Required
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {item.estimatedDuration} min
                  </span>
                  {item.presenterRole && (
                    <span className="capitalize">{item.presenterRole}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              {!readOnly && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-7">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditClick(index)}>
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                      onClick={() => setDeleteIndex(index)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Max items warning */}
      {!canAddMore && (
        <p className="text-xs text-muted-foreground">
          Maximum of {maxItems} agenda items reached
        </p>
      )}

      {/* Edit Dialog */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && handleCloseDialog()}>
        <AgendaItemDialog
          title="Edit Agenda Item"
          description="Update the agenda item details."
          formData={formData}
          formErrors={formErrors}
          onFormChange={setFormData}
          onSubmit={handleUpdateItem}
          onClose={handleCloseDialog}
          submitLabel="Save Changes"
        />
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agenda Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this agenda item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Agenda Item Dialog Component
// ============================================================================

interface AgendaItemDialogProps {
  title: string;
  description: string;
  formData: AgendaItemFormData;
  formErrors: Partial<Record<keyof AgendaItemFormData, string>>;
  onFormChange: (data: AgendaItemFormData) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
}

function AgendaItemDialog({
  title,
  description,
  formData,
  formErrors,
  onFormChange,
  onSubmit,
  onClose,
  submitLabel,
}: AgendaItemDialogProps) {
  const handleFieldChange = <K extends keyof AgendaItemFormData>(
    field: K,
    value: AgendaItemFormData[K]
  ) => {
    onFormChange({ ...formData, [field]: value });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="item-title">
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="item-title"
            value={formData.title}
            onChange={(e) => handleFieldChange("title", e.target.value)}
            placeholder="e.g., Status updates"
            className={cn(formErrors.title && "border-destructive")}
          />
          {formErrors.title && (
            <p className="text-xs text-destructive">{formErrors.title}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="item-description">Description</Label>
          <Textarea
            id="item-description"
            value={formData.description}
            onChange={(e) => handleFieldChange("description", e.target.value)}
            placeholder="Optional description or instructions"
            className={cn("min-h-[60px]", formErrors.description && "border-destructive")}
          />
          {formErrors.description && (
            <p className="text-xs text-destructive">{formErrors.description}</p>
          )}
        </div>

        {/* Duration and Presenter Role */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="item-duration">Duration</Label>
            <Select
              value={String(formData.estimatedDuration)}
              onValueChange={(v) => handleFieldChange("estimatedDuration", Number(v))}
            >
              <SelectTrigger id="item-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENDA_DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formErrors.estimatedDuration && (
              <p className="text-xs text-destructive">{formErrors.estimatedDuration}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-presenter">Presenter</Label>
            <Select
              value={formData.presenterRole || "none"}
              onValueChange={(v) =>
                handleFieldChange("presenterRole", v === "none" ? undefined : (v as PresenterRole))
              }
            >
              <SelectTrigger id="item-presenter">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                {PRESENTER_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Required toggle */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="item-required" className="cursor-pointer">
              Required Item
            </Label>
            <p className="text-xs text-muted-foreground">
              Mark this item as required for the meeting
            </p>
          </div>
          <Switch
            id="item-required"
            checked={formData.isRequired}
            onCheckedChange={(checked) => handleFieldChange("isRequired", checked)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSubmit}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================================
// Hook for managing agenda items state
// ============================================================================

export function useAgendaItems(initialItems: TemplateAgendaItemInput[] = []) {
  const [items, setItems] = useState<TemplateAgendaItemInput[]>(initialItems);

  const resetItems = useCallback((newItems: TemplateAgendaItemInput[] = []) => {
    setItems(newItems);
  }, []);

  return {
    items,
    setItems,
    resetItems,
  };
}
