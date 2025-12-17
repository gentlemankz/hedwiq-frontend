"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
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
import { FolderColorDot } from "./folder-color-dot";
import type { Folder } from "@/types/folder";

// ============================================================================
// Types
// ============================================================================

interface DeleteFolderDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** The folder to delete */
  folder: Folder;
  /** Callback when folder is successfully deleted */
  onFolderDeleted?: () => void;
  /** Function to delete the folder */
  deleteFolder: (id: string) => Promise<boolean>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A confirmation dialog for deleting a folder.
 * Shows warning about meetings being moved to default folder.
 * Includes mounted check to prevent state updates after unmount.
 */
export function DeleteFolderDialog({
  open,
  onOpenChange,
  folder,
  onFolderDeleted,
  deleteFolder,
}: DeleteFolderDialogProps) {
  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset error when dialog closes
  useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const success = await deleteFolder(folder.id);

      // Check if component is still mounted before updating state
      if (!mountedRef.current) return;

      if (success) {
        onFolderDeleted?.();
        onOpenChange(false);
      } else {
        setError("Failed to delete folder. Please try again.");
      }
    } catch (err) {
      // Check if component is still mounted before updating state
      if (!mountedRef.current) return;

      console.error("Failed to delete folder:", err);
      setError(err instanceof Error ? err.message : "Failed to delete folder");
    } finally {
      // Check if component is still mounted before updating state
      if (mountedRef.current) {
        setIsDeleting(false);
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError(null);
    }
    onOpenChange(newOpen);
  };

  // Cannot delete default folder
  if (folder.isDefault) {
    return (
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Cannot Delete Default Folder
            </AlertDialogTitle>
            <AlertDialogDescription>
              The default folder &quot;{folder.name}&quot; cannot be deleted.
              Meetings without a folder assignment are automatically placed here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const meetingCount = folder.meetingCount ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-destructive" />
            Delete Folder
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Are you sure you want to delete this folder?
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                <FolderColorDot color={folder.color} size="md" />
                <span className="font-medium">{folder.name}</span>
              </div>
              {meetingCount > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950 p-3 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                  <p className="text-sm">
                    <strong>{meetingCount}</strong> meeting{meetingCount !== 1 ? "s" : ""}{" "}
                    in this folder will be moved to the default folder.
                  </p>
                </div>
              )}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 size-4" />
                Delete Folder
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
