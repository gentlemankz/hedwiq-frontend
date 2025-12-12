"use client";

import { useCallback, useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ListTodo, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftAgendaItem } from "@/types/agenda";
import { AGENDA_LIMITS } from "@/types/agenda";
import { SortableList } from "./sortable-list";
import { AddTopicDialog } from "./add-topic-dialog";

// ============================================================================
// Types
// ============================================================================

interface AgendaBuilderProps {
  /** Current list of draft agenda items */
  items: DraftAgendaItem[];
  /** Called when items change (add, update, delete, reorder) */
  onChange: (items: DraftAgendaItem[]) => void;
  /** Whether interactions are disabled (e.g., during save) */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for a draft agenda item
 */
function generateDraftItemId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Agenda builder component for creating and editing meeting agendas.
 *
 * Features:
 * - Add new topics via dialog
 * - Edit existing topics inline
 * - Delete topics
 * - Drag-and-drop reordering
 * - Validation with limits
 *
 * Used in the PreJoin screen to create agendas before joining a meeting.
 */
export function AgendaBuilder({
  items,
  onChange,
  disabled = false,
  className,
}: AgendaBuilderProps) {
  const canAddMore = items.length < AGENDA_LIMITS.MAX_ITEMS;

  /**
   * Calculate total estimated duration
   */
  const totalDuration = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.estimatedDuration || 0), 0);
  }, [items]);

  /**
   * Add a new item
   */
  const handleAddItem = useCallback(
    (newItem: Omit<DraftAgendaItem, "id">) => {
      if (!canAddMore) return;

      const item: DraftAgendaItem = {
        id: generateDraftItemId(),
        ...newItem,
      };

      onChange([...items, item]);
    },
    [items, onChange, canAddMore]
  );

  /**
   * Update an existing item
   */
  const handleUpdateItem = useCallback(
    (id: string, updates: Partial<Omit<DraftAgendaItem, "id">>) => {
      onChange(
        items.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        )
      );
    },
    [items, onChange]
  );

  /**
   * Delete an item
   */
  const handleDeleteItem = useCallback(
    (id: string) => {
      onChange(items.filter((item) => item.id !== id));
    },
    [items, onChange]
  );

  /**
   * Reorder items
   */
  const handleReorder = useCallback(
    (reorderedItems: DraftAgendaItem[]) => {
      onChange(reorderedItems);
    },
    [onChange]
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ListTodo className="size-4" />
          <span>
            {items.length} topic{items.length !== 1 ? "s" : ""}
            {items.length > 0 && totalDuration > 0 && (
              <span className="ml-1">
                ({totalDuration} min total)
              </span>
            )}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {items.length}/{AGENDA_LIMITS.MAX_ITEMS} max
        </span>
      </div>

      {/* Max items warning */}
      {!canAddMore && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Maximum {AGENDA_LIMITS.MAX_ITEMS} topics reached. Remove a topic to add more.
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <ListTodo className="mx-auto size-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">No agenda topics yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add topics to help structure your meeting and enable automatic progress tracking.
          </p>
        </div>
      )}

      {/* Sortable list of items */}
      {items.length > 0 && (
        <SortableList
          items={items}
          onReorder={handleReorder}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          disabled={disabled}
        />
      )}

      {/* Add topic button */}
      <AddTopicDialog
        onAdd={handleAddItem}
        disabled={disabled || !canAddMore}
      />

      {/* Info about automatic tracking */}
      {items.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0 mt-0.5" />
          <p>
            During the meeting, the AI will automatically track which topics are being
            discussed and update progress in real-time. Drag topics to reorder them.
          </p>
        </div>
      )}
    </div>
  );
}
