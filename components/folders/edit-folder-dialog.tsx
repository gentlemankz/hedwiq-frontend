"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderColorDot } from "./folder-color-dot";
import { FOLDER_COLORS, FOLDER_LIMITS, type Folder } from "@/types/folder";

// ============================================================================
// Constants
// ============================================================================

/** Default color when folder has no color set */
const DEFAULT_COLOR = FOLDER_COLORS[0].value;

// ============================================================================
// Types
// ============================================================================

interface EditFolderDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** The folder to edit */
  folder: Folder;
  /** Callback when folder is successfully updated */
  onFolderUpdated?: (folder: Folder) => void;
  /** Function to update the folder */
  updateFolder: (
    id: string,
    updates: { name?: string; color?: string | null }
  ) => Promise<Folder | null>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A dialog for editing folder name and color.
 * Includes mounted check to prevent state updates after unmount.
 */
export function EditFolderDialog({
  open,
  onOpenChange,
  folder,
  onFolderUpdated,
  updateFolder,
}: EditFolderDialogProps) {
  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Get the effective color (folder color or default)
  const getEffectiveColor = useCallback(
    (folderColor: string | null) => folderColor || DEFAULT_COLOR,
    []
  );

  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string>(() => getEffectiveColor(folder.color));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when folder changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(folder.name);
      setColor(getEffectiveColor(folder.color));
      setError(null);
    }
  }, [open, folder, getEffectiveColor]);

  const handleSubmit = async () => {
    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Folder name is required");
      return;
    }

    if (trimmedName.length > FOLDER_LIMITS.MAX_NAME_LENGTH) {
      setError(`Folder name must be ${FOLDER_LIMITS.MAX_NAME_LENGTH} characters or less`);
      return;
    }

    // Check if anything changed - use consistent comparison
    const originalColor = getEffectiveColor(folder.color);
    const nameChanged = trimmedName !== folder.name;
    const colorChanged = color !== originalColor;

    if (!nameChanged && !colorChanged) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updates: { name?: string; color?: string | null } = {};
      if (nameChanged) updates.name = trimmedName;
      if (colorChanged) updates.color = color;

      const updatedFolder = await updateFolder(folder.id, updates);

      // Check if component is still mounted before updating state
      if (!mountedRef.current) return;

      if (updatedFolder) {
        onFolderUpdated?.(updatedFolder);
        onOpenChange(false);
      } else {
        setError("Failed to update folder. Please try again.");
      }
    } catch (err) {
      // Check if component is still mounted before updating state
      if (!mountedRef.current) return;

      console.error("Failed to update folder:", err);
      setError(err instanceof Error ? err.message : "Failed to update folder");
    } finally {
      // Check if component is still mounted before updating state
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5" />
            Edit Folder
          </DialogTitle>
          <DialogDescription>
            Update the folder name or color.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Folder Name */}
          <div className="grid gap-2">
            <Label htmlFor="edit-folder-name">Folder Name</Label>
            <Input
              id="edit-folder-name"
              placeholder="e.g., Project Alpha"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              maxLength={FOLDER_LIMITS.MAX_NAME_LENGTH}
              disabled={isSubmitting || folder.isDefault}
            />
            {folder.isDefault && (
              <p className="text-xs text-muted-foreground">
                The default folder cannot be renamed.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Folder Color */}
          <div className="grid gap-2">
            <Label htmlFor="edit-folder-color">Color</Label>
            <Select value={color} onValueChange={setColor} disabled={isSubmitting}>
              <SelectTrigger id="edit-folder-color">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <FolderColorDot color={color} />
                    {FOLDER_COLORS.find((c) => c.value === color)?.name || "Select color"}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FOLDER_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <FolderColorDot color={c.value} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || folder.isDefault}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
