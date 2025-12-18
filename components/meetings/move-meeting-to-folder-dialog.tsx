"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderSelect } from "@/components/folders";
import { Loader2, FolderInput, AlertCircle } from "lucide-react";
import type { Folder } from "@/types/folder";

// ============================================================================
// Types
// ============================================================================

interface MoveMeetingToFolderDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Meeting IDs to move */
  meetingIds: string[];
  /** Meeting titles for display (same order as meetingIds) */
  meetingTitles?: string[];
  /** Current folder ID of the meeting(s) - used to pre-select in dropdown */
  currentFolderId?: string | null;
  /** Available folders for selection */
  folders: Folder[];
  /** Folders loading state */
  foldersLoading?: boolean;
  /** Callback when meetings are moved successfully */
  onMoved: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Dialog for moving one or more meetings to a different folder.
 * Supports both single and bulk move operations.
 */
export function MoveMeetingToFolderDialog({
  open,
  onOpenChange,
  meetingIds,
  meetingTitles = [],
  currentFolderId,
  folders,
  foldersLoading = false,
  onMoved,
}: MoveMeetingToFolderDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialSuccess, setPartialSuccess] = useState<{
    moved: number;
    total: number;
  } | null>(null);

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);

  // Clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isBulkMove = meetingIds.length > 1;
  const dialogTitle = isBulkMove
    ? `Move ${meetingIds.length} Meetings`
    : "Move Meeting";
  const dialogDescription = isBulkMove
    ? `Select a folder to move ${meetingIds.length} selected meetings.`
    : meetingTitles[0]
    ? `Move "${meetingTitles[0]}" to a different folder.`
    : "Select a folder to move this meeting.";

  // Sync selectedFolderId with currentFolderId when dialog opens or props change
  useEffect(() => {
    if (open) {
      setSelectedFolderId(currentFolderId ?? null);
      setError(null);
      setPartialSuccess(null);
    }
  }, [open, currentFolderId]);

  // Handle dialog open/close state
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Move meetings to selected folder
  const handleMove = async () => {
    // Guard against empty meetingIds
    if (meetingIds.length === 0) {
      setError("No meetings selected");
      return;
    }

    if (!selectedFolderId) {
      setError("Please select a folder");
      return;
    }

    // Skip if moving to the same folder (single meeting only)
    if (selectedFolderId === currentFolderId && meetingIds.length === 1) {
      setError("Meeting is already in this folder");
      return;
    }

    setIsMoving(true);
    setError(null);
    setPartialSuccess(null);

    try {
      // Use bulk API for efficiency
      const response = await fetch("/api/meetings/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingIds,
          folderId: selectedFolderId,
        }),
      });

      // Check if component is still mounted before updating state
      if (!mountedRef.current) return;

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to move meetings");
      }

      const data = await response.json();

      // Check for partial success and inform user
      if (data.movedCount < meetingIds.length) {
        if (mountedRef.current) {
          setPartialSuccess({
            moved: data.movedCount,
            total: meetingIds.length,
          });
        }
        // Still call onMoved to refresh the list
        onMoved();
        // Don't close dialog so user can see the warning
        return;
      }

      onMoved();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to move meetings:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to move meetings");
      }
    } finally {
      if (mountedRef.current) {
        setIsMoving(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="size-5" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="folder-select">Destination Folder</Label>
            <FolderSelect
              id="folder-select"
              value={selectedFolderId}
              onChange={setSelectedFolderId}
              folders={folders}
              loading={foldersLoading}
              disabled={isMoving || partialSuccess !== null}
              placeholder="Select a folder"
              aria-label="Select destination folder"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {partialSuccess && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>
                  Only {partialSuccess.moved} of {partialSuccess.total} meetings
                  were moved. Some meetings may not belong to you or no longer
                  exist.
                </span>
              </div>
            )}
          </div>

          {/* Preview of meetings being moved (for bulk) */}
          {isBulkMove && meetingTitles.length > 0 && (
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Meetings to move:</Label>
              <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/50 p-2">
                <ul className="space-y-1 text-sm">
                  {meetingTitles.slice(0, 10).map((title, i) => (
                    <li key={meetingIds[i]} className="truncate">
                      {title}
                    </li>
                  ))}
                  {meetingTitles.length > 10 && (
                    <li className="text-muted-foreground">
                      ...and {meetingTitles.length - 10} more
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {partialSuccess ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isMoving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleMove}
                disabled={isMoving || !selectedFolderId}
              >
                {isMoving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Moving...
                  </>
                ) : (
                  `Move${isBulkMove ? ` ${meetingIds.length} Meetings` : ""}`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
