"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRoomContext } from "@livekit/components-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getInitials, getHashedColor } from "@/lib/utils";
import { FileText, ChevronDown } from "lucide-react";
import { useInsights } from "@/hooks/use-insights";
import { InsightBadge } from "@/components/insights/insight-badge";
import type { Insight } from "@/types/insight";

// ============================================================================
// Constants
// ============================================================================

/** LiveKit transcription topic name */
const TRANSCRIPTION_TOPIC = "lk.transcription";

/** Maximum number of transcription entries to keep in memory */
const MAX_ENTRIES = 500;

/** Scroll threshold in pixels to determine if user is at bottom */
const SCROLL_THRESHOLD = 50;

// ============================================================================
// Custom Hooks
// ============================================================================

/**
 * Custom hook for auto-scroll behavior with manual scroll detection
 */
function useAutoScroll(deps: React.DependencyList) {
  const scrollContainerRef = useRef<Element | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when dependencies change
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScroll, ...deps]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight <
      SCROLL_THRESHOLD;
    setAutoScroll(isAtBottom);
  }, []);

  // Scroll to bottom and re-enable auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  // Ref callback to capture the scroll container element
  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      scrollContainerRef.current = node.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
    }
  }, []);

  return {
    autoScroll,
    handleScroll,
    scrollToBottom,
    setScrollContainer,
  };
}

// ============================================================================
// Types
// ============================================================================

interface TranscriptionEntry {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface TextStreamReader {
  info: {
    id: string;
    timestamp?: number;
    attributes?: Record<string, string>;
  };
  readAll: () => Promise<string>;
  [Symbol.asyncIterator]: () => AsyncIterator<string>;
}

interface ParticipantInfo {
  identity: string;
}

interface TranscriptionSidebarProps {
  className?: string;
  /** Callback when an insight is clicked */
  onInsightClick?: (insight: Insight) => void;
}

// ============================================================================
// Component
// ============================================================================

export function TranscriptionSidebar({
  className,
  onInsightClick,
}: TranscriptionSidebarProps) {
  const room = useRoomContext();
  const isMountedRef = useRef(true);

  // Use Map for O(1) entry lookups by segment ID
  const [entriesMap, setEntriesMap] = useState<Map<string, TranscriptionEntry>>(
    () => new Map()
  );

  // Get insights from the hook
  const { getInsightsForTranscript } = useInsights();

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Convert Map to sorted array and split into final/interim in single pass
  const { sortedEntries, finalEntries, interimEntries } = useMemo(() => {
    const sorted = Array.from(entriesMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
    const final: TranscriptionEntry[] = [];
    const interim: TranscriptionEntry[] = [];
    for (const entry of sorted) {
      (entry.isFinal ? final : interim).push(entry);
    }
    return { sortedEntries: sorted, finalEntries: final, interimEntries: interim };
  }, [entriesMap]);

  // Use custom auto-scroll hook
  const { autoScroll, handleScroll, scrollToBottom, setScrollContainer } =
    useAutoScroll([sortedEntries]);

  // Handle text stream from transcription agent
  const handleTextStream = useCallback(
    async (reader: TextStreamReader, participantInfo: ParticipantInfo) => {
      const attrs = reader.info.attributes ?? {};
      const segmentId = attrs["lk.segment_id"] || reader.info.id;
      const isFinal = attrs["lk.transcription_final"] === "true";
      const speakerIdentity =
        attrs["speaker_identity"]?.trim() || participantInfo.identity;
      const speakerName =
        attrs["speaker_name"]?.trim() || speakerIdentity || "Unknown";

      let text: string;
      try {
        text = await reader.readAll();
      } catch (err) {
        // Stream failed - silently ignore to prevent UI disruption
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to read transcription stream:", err);
        }
        return;
      }

      // Check if component is still mounted before updating state
      if (!isMountedRef.current) return;

      if (!text.trim()) return;

      const entry: TranscriptionEntry = {
        id: segmentId,
        participantIdentity: speakerIdentity,
        participantName: speakerName,
        text,
        timestamp: reader.info.timestamp ?? Date.now(),
        isFinal,
      };

      setEntriesMap((prev) => {
        const existing = prev.get(segmentId);

        // Only update if: new text is longer, or replacing interim with final
        if (existing && !isFinal && text.length <= existing.text.length) {
          return prev;
        }

        const updated = new Map(prev);
        updated.set(segmentId, entry);

        // Prune oldest entries if exceeding limit
        if (updated.size > MAX_ENTRIES) {
          const entriesByTime = Array.from(updated.entries()).sort(
            ([, a], [, b]) => a.timestamp - b.timestamp
          );
          const toRemove = entriesByTime.slice(0, updated.size - MAX_ENTRIES);
          toRemove.forEach(([id]) => updated.delete(id));
        }

        return updated;
      });
    },
    []
  );

  // Register text stream handler
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
    } catch {
      // Handler wasn't registered yet, ignore
    }

    try {
      room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, handleTextStream);
    } catch (err) {
      console.warn("Failed to register transcription stream handler:", err);
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
      } catch {
        // Already unregistered, ignore
      }
    };
  }, [room, handleTextStream]);

  return (
    <div
      className={cn(
        "relative h-full bg-background",
        className
      )}
      ref={setScrollContainer}
    >
      <ScrollArea className="h-full" onScrollCapture={handleScroll}>
        <div className="space-y-4 p-4">
          {finalEntries.length === 0 && interimEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <FileText className="mb-2 size-8 opacity-50" />
              <p className="text-sm">No transcriptions yet</p>
              <p className="text-xs">
                Transcriptions will appear here as people speak
              </p>
            </div>
          ) : (
            <>
              {/* Final transcriptions */}
              {finalEntries.map((entry) => (
                <TranscriptionMessage
                  key={entry.id}
                  entry={entry}
                  insights={getInsightsForTranscript(entry.id)}
                  onInsightClick={onInsightClick}
                />
              ))}

              {/* Interim transcriptions (multiple speakers supported) */}
              {interimEntries.map((entry) => (
                <TranscriptionMessage
                  key={entry.id}
                  entry={entry}
                  isInterim
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      {!autoScroll && sortedEntries.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg z-10"
          onClick={scrollToBottom}
        >
          <ChevronDown className="mr-1 size-4" />
          New messages
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface TranscriptionMessageProps {
  entry: TranscriptionEntry;
  isInterim?: boolean;
  /** Insights related to this transcript entry */
  insights?: Insight[];
  /** Callback when an insight badge is clicked */
  onInsightClick?: (insight: Insight) => void;
}

const TranscriptionMessage = React.memo(function TranscriptionMessage({
  entry,
  isInterim,
  insights = [],
  onInsightClick,
}: TranscriptionMessageProps) {
  return (
    <div className={cn("flex gap-3", isInterim && "opacity-60")}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback
          className={cn(
            "text-xs text-white",
            getHashedColor(entry.participantIdentity)
          )}
        >
          {getInitials(entry.participantName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium leading-none">
          {entry.participantName}
          {isInterim && (
            <span className="ml-2 text-xs text-muted-foreground italic">
              typing...
            </span>
          )}
        </p>
        <p className={cn("text-sm text-foreground", isInterim && "italic")}>
          {entry.text}
        </p>

        {/* Inline insight badges */}
        {insights.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {insights.map((insight) => (
              <InsightBadge
                key={insight.id}
                type={insight.type}
                content={insight.content}
                onClick={() => onInsightClick?.(insight)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
