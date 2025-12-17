"use client";

import { useMemo, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderColorDot } from "./folder-color-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderClosed, Plus } from "lucide-react";
import type { Folder } from "@/types/folder";

// ============================================================================
// Constants
// ============================================================================

/** Special value for the "New Folder" option */
const NEW_FOLDER_VALUE = "__new_folder__";

// ============================================================================
// Types
// ============================================================================

interface FolderSelectProps {
  /** Currently selected folder ID */
  value: string | null | undefined;
  /** Callback when selection changes */
  onChange: (folderId: string | null) => void;
  /** List of available folders (should be pre-sorted by API) */
  folders: Folder[];
  /** Loading state */
  loading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder text when no folder selected */
  placeholder?: string;
  /** Whether to show the "New Folder" option */
  showNewFolderOption?: boolean;
  /** Callback when "New Folder" is selected */
  onNewFolder?: () => void;
  /** Label for the select (for accessibility) */
  "aria-label"?: string;
  /** ID for the select element */
  id?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A dropdown select component for choosing a meeting folder.
 *
 * Features:
 * - Shows folder list with color indicators
 * - Displays default folder badge
 * - Optional "New Folder" action
 * - Loading skeleton state
 * - Keyboard accessible
 * - Validates folder selection against available folders
 */
export function FolderSelect({
  value,
  onChange,
  folders,
  loading = false,
  disabled = false,
  placeholder = "Select folder",
  showNewFolderOption = false,
  onNewFolder,
  "aria-label": ariaLabel,
  id,
}: FolderSelectProps) {
  // Create a Set for O(1) folder ID validation
  const validFolderIds = useMemo(
    () => new Set(folders.map((f) => f.id)),
    [folders]
  );

  // Find the selected folder for display
  const selectedFolder = useMemo(
    () => (value ? folders.find((f) => f.id === value) : undefined),
    [folders, value]
  );

  // Memoized change handler with validation
  const handleValueChange = useCallback(
    (newValue: string) => {
      if (newValue === NEW_FOLDER_VALUE) {
        onNewFolder?.();
        return;
      }
      // Validate that the selected folder ID exists in the user's folders
      if (newValue && !validFolderIds.has(newValue)) {
        console.warn(`Invalid folder ID selected: ${newValue}`);
        return;
      }
      onChange(newValue || null);
    },
    [onChange, onNewFolder, validFolderIds]
  );

  if (loading) {
    return <Skeleton className="h-10 w-full" />;
  }

  // Handle empty folders list gracefully
  if (folders.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
          <SelectValue placeholder="No folders available" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__" disabled>
            No folders available
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Normalize value for Select component (empty string = no selection)
  const selectValue = value ?? "";

  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder}>
          {selectedFolder ? (
            <div className="flex items-center gap-2">
              <FolderColorDot color={selectedFolder.color} size="sm" />
              <span className="truncate">{selectedFolder.name}</span>
            </div>
          ) : value ? (
            // Fallback if folder not found but value exists (stale ID)
            <div className="flex items-center gap-2 text-muted-foreground">
              <FolderClosed className="size-4" />
              <span>{placeholder}</span>
            </div>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {folders.map((folder) => (
          <SelectItem key={folder.id} value={folder.id}>
            <div className="flex items-center gap-2">
              <FolderColorDot color={folder.color} size="sm" />
              <span className="truncate">{folder.name}</span>
              {folder.isDefault && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Default
                </span>
              )}
            </div>
          </SelectItem>
        ))}
        {showNewFolderOption && onNewFolder && (
          <>
            <div className="my-1 h-px bg-border" />
            <SelectItem value={NEW_FOLDER_VALUE}>
              <div className="flex items-center gap-2 text-primary">
                <Plus className="size-4" />
                <span>New Folder</span>
              </div>
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
