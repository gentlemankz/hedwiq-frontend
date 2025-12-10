"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GripVertical,
  X,
  Clock,
  User,
  AlertCircle,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENDA_CONSTANTS } from "@/types/agenda";
import type { AgendaItem } from "@/types/agenda";
import { AgendaItemForm } from "./agenda-item-form";

// ============================================================================
// Types
// ============================================================================

interface AgendaCreatorProps {
  /** Current agenda items */
  items: AgendaItem[];
  /** Callback when items change */
  onItemsChange: (items: AgendaItem[]) => void;
  /** Maximum items allowed */
  maxItems?: number;
  /** Disable all interactions */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for agenda items
 */
function generateId(): string {
  return `agenda-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Agenda creator component for PreJoin screen.
 * Allows users to create, edit, reorder, and delete agenda items.
 *
 * Features:
 * - Add/remove agenda items
 * - Title, description, time estimate, and lead fields
 * - Drag-and-drop reordering (simplified with up/down buttons)
 * - Validation and limits
 */
export function AgendaCreator({
  items,
  onItemsChange,
  maxItems = AGENDA_CONSTANTS.MAX_AGENDA_ITEMS,
  disabled = false,
  className,
}: AgendaCreatorProps) {
  // Track dragging state for potential future drag-and-drop
  const [, setDraggedIndex] = useState<number | null>(null);

  /**
   * Add a new agenda item
   */
  const handleAddItem = useCallback(
    (newItem: Omit<AgendaItem, "id" | "order">) => {
      if (items.length >= maxItems) return;

      const item: AgendaItem = {
        ...newItem,
        id: generateId(),
        order: items.length,
      };

      onItemsChange([...items, item]);
    },
    [items, maxItems, onItemsChange]
  );

  /**
   * Remove an agenda item
   */
  const handleRemoveItem = useCallback(
    (index: number) => {
      const newItems = items
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, order: i }));
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  /**
   * Move an item up in the list
   */
  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newItems = [...items];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      onItemsChange(newItems.map((item, i) => ({ ...item, order: i })));
    },
    [items, onItemsChange]
  );

  /**
   * Move an item down in the list
   */
  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === items.length - 1) return;
      const newItems = [...items];
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      onItemsChange(newItems.map((item, i) => ({ ...item, order: i })));
    },
    [items, onItemsChange]
  );

  /**
   * Calculate total estimated time
   */
  const totalEstimatedMinutes = items.reduce(
    (total, item) => total + (item.estimatedMinutes || AGENDA_CONSTANTS.DEFAULT_ITEM_MINUTES),
    0
  );

  const canAddMore = items.length < maxItems && !disabled;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Items List */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Agenda Items ({items.length}/{maxItems})
            </p>
            {totalEstimatedMinutes > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" />
                Est. {totalEstimatedMinutes} min total
              </p>
            )}
          </div>

          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "group flex items-start gap-2 rounded-md border bg-card p-3",
                  "hover:border-muted-foreground/50 transition-colors"
                )}
                draggable={!disabled}
                onDragStart={() => setDraggedIndex(index)}
                onDragEnd={() => setDraggedIndex(null)}
              >
                {/* Drag Handle / Order Number */}
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <div
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full",
                      "bg-primary/10 text-xs font-medium text-primary"
                    )}
                  >
                    {index + 1}
                  </div>
                  <GripVertical
                    className={cn(
                      "size-4 text-muted-foreground/50 cursor-grab",
                      disabled && "cursor-not-allowed opacity-50"
                    )}
                  />
                </div>

                {/* Item Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium leading-tight truncate">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {item.estimatedMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {item.estimatedMinutes} min
                      </span>
                    )}
                    {item.leadBy && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.leadBy}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => handleMoveUp(index)}
                    disabled={disabled || index === 0}
                    title="Move up"
                  >
                    <span className="text-xs">&#9650;</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => handleMoveDown(index)}
                    disabled={disabled || index === items.length - 1}
                    title="Move down"
                  >
                    <span className="text-xs">&#9660;</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveItem(index)}
                    disabled={disabled}
                    title="Remove item"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <ListTodo className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No agenda items yet</p>
          <p className="text-xs text-muted-foreground">
            Add items to help structure your meeting
          </p>
        </div>
      )}

      {/* Add Item Form */}
      {canAddMore && <AgendaItemForm onAdd={handleAddItem} disabled={disabled} />}

      {/* Max Items Warning */}
      {items.length >= maxItems && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Maximum {maxItems} agenda items allowed. Remove an item to add more.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
