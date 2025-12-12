"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import type { DraftAgendaItem } from "@/types/agenda";
import { AgendaItem } from "./agenda-item";

// ============================================================================
// Types
// ============================================================================

interface SortableListProps {
  /** List of items to render */
  items: DraftAgendaItem[];
  /** Called when items are reordered */
  onReorder: (items: DraftAgendaItem[]) => void;
  /** Called when an item is updated */
  onUpdateItem: (id: string, updates: Partial<Omit<DraftAgendaItem, "id">>) => void;
  /** Called when an item is deleted */
  onDeleteItem: (id: string) => void;
  /** Whether interactions are disabled */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Sortable list of agenda items using @dnd-kit.
 * Supports drag-and-drop reordering with keyboard accessibility.
 */
export function SortableList({
  items,
  onReorder,
  onUpdateItem,
  onDeleteItem,
  disabled = false,
}: SortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure sensors for both pointer and keyboard interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance to start dragging
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /**
   * Handle drag start
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  /**
   * Handle drag end
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);

      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(items, oldIndex, newIndex);
          onReorder(reordered);
        }
      }
    },
    [items, onReorder]
  );

  /**
   * Handle drag cancel
   */
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Find the active item for the drag overlay
  const activeItem = activeId ? items.find((item) => item.id === activeId) : null;

  // Get item IDs for SortableContext
  const itemIds = items.map((item) => item.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item, index) => (
            <AgendaItem
              key={item.id}
              item={item}
              index={index + 1}
              onUpdate={onUpdateItem}
              onDelete={onDeleteItem}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>

      {/* Drag overlay for visual feedback */}
      <DragOverlay>
        {activeItem ? (
          <div className="rounded-md border bg-card shadow-lg opacity-90">
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {items.findIndex((item) => item.id === activeItem.id) + 1}
                </span>
                <span className="font-medium">{activeItem.title}</span>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
