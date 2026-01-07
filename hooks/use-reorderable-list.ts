import { useCallback, useMemo } from "react";

/**
 * Generate a unique ID for list items
 */
let listItemIdCounter = 0;
export const generateListItemId = (prefix: string = "item") =>
  `${prefix}-${++listItemIdCounter}-${Date.now()}`;

/**
 * Global WeakMap to store stable IDs for objects without mutating them.
 * WeakMap allows garbage collection when objects are no longer referenced.
 */
const stableIdMap = new WeakMap<object, string>();

/**
 * Get or create a stable ID for an item using WeakMap (no mutation).
 */
function getOrCreateStableId<T extends object>(item: T, prefix: string): string {
  let id = stableIdMap.get(item);
  if (!id) {
    id = generateListItemId(prefix);
    stableIdMap.set(item, id);
  }
  return id;
}

/**
 * Hook to manage stable IDs for list items.
 *
 * Uses WeakMap to track IDs externally (no object mutation).
 * - On reorder: IDs follow the objects (stable) because same object = same ID
 * - On edit/add: New objects get fresh IDs
 * - On delete: IDs are cleaned up by garbage collection
 */
export function useStableItemIds<T extends object>(
  items: T[],
  prefix: string = "item"
): string[] {
  return useMemo(
    () => items.map((item) => getOrCreateStableId(item, prefix)),
    [items, prefix]
  );
}

/**
 * Hook providing reorder operations for a list.
 * Returns handlers for moving items up/down and deleting items.
 */
export function useReorderableList<T>(
  items: T[],
  onChange: (items: T[]) => void
) {
  /**
   * Move an item up in the list (swap with previous item)
   */
  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;

      const updatedItems = [...items];
      [updatedItems[index - 1], updatedItems[index]] = [
        updatedItems[index],
        updatedItems[index - 1],
      ];
      onChange(updatedItems);
    },
    [items, onChange]
  );

  /**
   * Move an item down in the list (swap with next item)
   */
  const moveDown = useCallback(
    (index: number) => {
      if (index >= items.length - 1) return;

      const updatedItems = [...items];
      [updatedItems[index], updatedItems[index + 1]] = [
        updatedItems[index + 1],
        updatedItems[index],
      ];
      onChange(updatedItems);
    },
    [items, onChange]
  );

  /**
   * Remove an item from the list by index
   */
  const removeAt = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) return;

      const updatedItems = items.filter((_, i) => i !== index);
      onChange(updatedItems);
    },
    [items, onChange]
  );

  /**
   * Check if an item can be moved up
   */
  const canMoveUp = useCallback((index: number) => index > 0, []);

  /**
   * Check if an item can be moved down
   */
  const canMoveDown = useCallback(
    (index: number) => index < items.length - 1,
    [items.length]
  );

  return {
    moveUp,
    moveDown,
    removeAt,
    canMoveUp,
    canMoveDown,
  };
}
