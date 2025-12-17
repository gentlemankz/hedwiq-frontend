"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PastMeetingCard } from "./past-meeting-card";
import { History, Loader2, RefreshCw } from "lucide-react";
import type {
  MeetingHistorySummary,
  MeetingHistoryListResponse,
} from "@/types/meeting-history";

interface PastMeetingsListProps {
  /** Initial meetings from server (optional) */
  initialMeetings?: MeetingHistorySummary[];
  /** Number of meetings to show per page */
  pageSize?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Filter by folder ID (optional) */
  folderId?: string | null;
}

/**
 * List of past meetings with pagination.
 */
export function PastMeetingsList({
  initialMeetings = [],
  pageSize = 10,
  emptyMessage = "No past meetings yet. Start a meeting to see it here after it ends.",
  folderId,
}: PastMeetingsListProps) {
  const [meetings, setMeetings] = useState<MeetingHistorySummary[]>(initialMeetings);
  const [isLoading, setIsLoading] = useState(initialMeetings.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // AbortController ref for request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

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
    fetchMeetings(false, controller.signal);

    // Cleanup: abort on unmount or when folderId changes
    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, pageSize]);

  const handleRefresh = () => {
    setOffset(0);
    fetchMeetings(false);
  };

  const handleLoadMore = () => {
    fetchMeetings(true);
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

  return (
    <div className="space-y-4">
      {/* Refresh button */}
      <div className="flex justify-end">
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

      {/* Meetings grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {meetings.map((meeting) => (
          <PastMeetingCard key={meeting.id} meeting={meeting} />
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
    </div>
  );
}
