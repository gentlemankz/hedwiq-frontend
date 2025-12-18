"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { PastMeetingCard } from "./past-meeting-card";
import { MoveMeetingToFolderDialog } from "./move-meeting-to-folder-dialog";
import {
  History,
  Loader2,
  RefreshCw,
  CheckSquare,
  X,
  FolderInput,
} from "lucide-react";
import type {
  MeetingHistorySummary,
  MeetingHistoryListResponse,
} from "@/types/meeting-history";
import type { Folder } from "@/types/folder";

interface PastMeetingsListProps {
  /** Initial meetings from server (optional) */
  initialMeetings?: MeetingHistorySummary[];
  /** Number of meetings to show per page */
  pageSize?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Filter by folder ID (optional) */
  folderId?: string | null;
  /** Whether to enable bulk selection mode */
  enableBulkActions?: boolean;
  /** Folders for move dialog - if not provided, will fetch internally */
  folders?: Folder[];
  /** Folders loading state */
  foldersLoading?: boolean;
  /** Callback when folders need refresh (e.g., after move) */
  onFoldersRefresh?: () => void;
}

/**
 * List of past meetings with pagination.
 *
 * Can be used in two modes:
 * 1. With explicit folder props (folders, foldersLoading, onFoldersRefresh)
 * 2. With internal folder management (fetches folders itself)
 */
export function PastMeetingsList({
  initialMeetings = [],
  pageSize = 10,
  emptyMessage = "No past meetings yet. Start a meeting to see it here after it ends.",
  folderId,
  enableBulkActions = true,
  folders: propFolders,
  foldersLoading: propFoldersLoading,
  onFoldersRefresh,
}: PastMeetingsListProps) {
  const [meetings, setMeetings] = useState<MeetingHistorySummary[]>(initialMeetings);
  const [isLoading, setIsLoading] = useState(initialMeetings.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // AbortController ref for request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [meetingToMove, setMeetingToMove] = useState<MeetingHistorySummary | null>(null);

  // Internal folder state (used when props not provided)
  const [internalFolders, setInternalFolders] = useState<Folder[]>([]);
  const [internalFoldersLoading, setInternalFoldersLoading] = useState(false);

  // Use props if provided, otherwise use internal state
  const folders = propFolders ?? internalFolders;
  const foldersLoading = propFoldersLoading ?? internalFoldersLoading;

  // Fetch folders internally if not provided via props
  const fetchFoldersInternal = useCallback(async () => {
    if (propFolders !== undefined) return; // Skip if using prop folders

    setInternalFoldersLoading(true);
    try {
      const response = await fetch("/api/folders?includeCounts=true");
      if (response.ok) {
        const data = await response.json();
        setInternalFolders(data.folders);
      }
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    } finally {
      setInternalFoldersLoading(false);
    }
  }, [propFolders]);

  // Fetch folders on mount if using internal state
  useEffect(() => {
    if (propFolders === undefined && enableBulkActions) {
      fetchFoldersInternal();
    }
  }, [propFolders, enableBulkActions, fetchFoldersInternal]);

  // Refresh folders - use prop callback or internal fetch
  const refreshFolders = useCallback(() => {
    if (onFoldersRefresh) {
      onFoldersRefresh();
    } else {
      fetchFoldersInternal();
    }
  }, [onFoldersRefresh, fetchFoldersInternal]);

  // Selected meetings data - only compute when dialog is open
  const selectedMeetings = useMemo(
    () => moveDialogOpen ? meetings.filter((m) => selectedIds.has(m.id)) : [],
    [meetings, selectedIds, moveDialogOpen]
  );

  /**
   * Fetch meetings from API with proper cancellation support
   */
  const fetchMeetings = useCallback(
    async (loadMore = false, signal?: AbortSignal) => {
      // Use functional update to get latest offset value and avoid stale closure
      let currentOffset = 0;
      if (loadMore) {
        // Read the current offset from state via ref pattern
        currentOffset = offset + pageSize;
      }

      try {
        if (loadMore) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
          setError(null);
          currentOffset = 0;
        }

        // Build URL with proper encoding for folderId filter
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(currentOffset),
        });
        if (folderId !== undefined) {
          params.set("folderId", folderId === null ? "null" : folderId);
        }

        const response = await fetch(`/api/meetings/history?${params.toString()}`, {
          signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load meetings");
        }

        const data: MeetingHistoryListResponse = await response.json();

        if (loadMore) {
          setMeetings((prev) => [...prev, ...data.meetings]);
        } else {
          setMeetings(data.meetings);
        }

        setOffset(currentOffset);
        setHasMore(data.pagination.hasMore);
      } catch (err) {
        // Ignore abort errors - they're expected on cleanup
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch past meetings:", err);
        setError(err instanceof Error ? err.message : "Failed to load meetings");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [offset, pageSize, folderId]
  );

  // Initial load and refetch when folderId changes
  useEffect(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset state and refetch when folderId changes
    setMeetings([]);
    setOffset(0);
    setHasMore(false);
    setIsLoading(true);
    // FIXED: Reset selection state when folder changes to avoid stale selections
    setSelectedIds(new Set());
    setSelectionMode(false);
    fetchMeetings(false, controller.signal);

    // Cleanup: abort on unmount or when folderId changes
    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, pageSize]);

  const handleRefresh = () => {
    setOffset(0);
    setSelectedIds(new Set());
    setSelectionMode(false);
    fetchMeetings(false);
  };

  const handleLoadMore = () => {
    fetchMeetings(true);
  };

  // Selection handlers
  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exit selection mode - clear selections
      setSelectedIds(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  const toggleMeetingSelection = (meetingId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(meetingId);
      } else {
        next.delete(meetingId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(meetings.map((m) => m.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Move handlers
  const handleMoveToFolder = (meeting: MeetingHistorySummary) => {
    setMeetingToMove(meeting);
    setMoveDialogOpen(true);
  };

  const handleBulkMove = () => {
    if (selectedIds.size > 0) {
      setMeetingToMove(null); // Bulk mode
      setMoveDialogOpen(true);
    }
  };

  const handleMovedSuccess = () => {
    // Refresh list and folder counts
    handleRefresh();
    refreshFolders();
    setMeetingToMove(null);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="mr-2 size-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Empty state
  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <History className="mx-auto size-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  // Determine meeting IDs and titles for move dialog
  const moveDialogMeetingIds = meetingToMove
    ? [meetingToMove.id]
    : Array.from(selectedIds);
  const moveDialogMeetingTitles = meetingToMove
    ? [meetingToMove.title]
    : selectedMeetings.map((m) => m.title);
  const moveDialogCurrentFolderId = meetingToMove?.folderId ?? null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Selection mode toggle and actions */}
          {enableBulkActions && (
            <>
              {selectionMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectionMode}
                  >
                    <X className="mr-2 size-4" />
                    Cancel
                  </Button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedIds.size} selected
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkMove}
                      >
                        <FolderInput className="mr-2 size-4" />
                        Move
                      </Button>
                    </>
                  )}
                  {selectedIds.size < meetings.length && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAll}
                    >
                      Select All
                    </Button>
                  )}
                  {selectedIds.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                    >
                      Clear
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectionMode}
                >
                  <CheckSquare className="mr-2 size-4" />
                  Select
                </Button>
              )}
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      {/* Select all checkbox when in selection mode */}
      {selectionMode && meetings.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={selectedIds.size === meetings.length}
            onCheckedChange={(checked) =>
              checked ? selectAll() : clearSelection()
            }
            aria-label="Select all meetings"
          />
          <span className="text-sm text-muted-foreground">
            Select all ({meetings.length})
          </span>
        </div>
      )}

      {/* Meetings grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {meetings.map((meeting) => (
          <PastMeetingCard
            key={meeting.id}
            meeting={meeting}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(meeting.id)}
            onSelectionChange={(selected) =>
              toggleMeetingSelection(meeting.id, selected)
            }
            onMoveToFolder={enableBulkActions ? handleMoveToFolder : undefined}
          />
        ))}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}

      {/* Move to folder dialog */}
      <MoveMeetingToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        meetingIds={moveDialogMeetingIds}
        meetingTitles={moveDialogMeetingTitles}
        currentFolderId={moveDialogCurrentFolderId}
        folders={folders}
        foldersLoading={foldersLoading}
        onMoved={handleMovedSuccess}
      />
    </div>
  );
}
