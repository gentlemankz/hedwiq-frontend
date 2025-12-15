"use client";

import { useState, useEffect, useCallback } from "react";
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
}

/**
 * List of past meetings with pagination.
 */
export function PastMeetingsList({
  initialMeetings = [],
  pageSize = 10,
  emptyMessage = "No past meetings yet. Start a meeting to see it here after it ends.",
}: PastMeetingsListProps) {
  const [meetings, setMeetings] = useState<MeetingHistorySummary[]>(initialMeetings);
  const [isLoading, setIsLoading] = useState(initialMeetings.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch meetings from API
   */
  const fetchMeetings = useCallback(
    async (loadMore = false) => {
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

        const response = await fetch(
          `/api/meetings/history?limit=${pageSize}&offset=${currentOffset}`
        );

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
        console.error("Failed to fetch past meetings:", err);
        setError(err instanceof Error ? err.message : "Failed to load meetings");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [offset, pageSize]
  );

  // Initial load
  useEffect(() => {
    if (initialMeetings.length === 0) {
      fetchMeetings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
