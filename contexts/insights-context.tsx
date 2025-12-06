"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRoomContext } from "@livekit/components-react";
import type { Insight, InsightType } from "@/types/insight";

/** LiveKit topic for insights from the Hedwiq agent */
const INSIGHT_TOPIC = "hedwiq.insight";

/** Maximum number of insights to keep in memory */
const MAX_INSIGHTS = 100;

/**
 * Interface for the text stream reader from LiveKit
 */
interface TextStreamReader {
  info: {
    id: string;
    timestamp?: number;
    attributes?: Record<string, string>;
  };
  readAll: () => Promise<string>;
}

/**
 * Interface for participant info from LiveKit
 */
interface ParticipantInfo {
  identity: string;
}

/**
 * Context value for insights
 */
interface InsightsContextValue {
  /** All insights, sorted by timestamp (newest first) */
  insights: Insight[];
  /** Insights grouped by type */
  insightsByType: Partial<Record<InsightType, Insight[]>>;
  /** Total count of insights */
  insightCount: number;
  /** Get insights related to a specific transcript segment */
  getInsightsForTranscript: (transcriptRef: string) => Insight[];
  /** Clear all insights */
  clearInsights: () => void;
}

const InsightsContext = createContext<InsightsContextValue | null>(null);

/**
 * Provider component that manages insights state and LiveKit stream subscription.
 * Wrap your meeting components with this provider to share insights state.
 *
 * @example
 * ```tsx
 * <InsightsProvider>
 *   <MeetingLayout />
 * </InsightsProvider>
 * ```
 */
export function InsightsProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext();
  const isMountedRef = useRef(true);
  const [insights, setInsights] = useState<Insight[]>([]);

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Handle incoming insight stream from the agent
   */
  const handleInsightStream = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (reader: TextStreamReader, _participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        const data = JSON.parse(rawJson);
        const attrs = reader.info.attributes ?? {};

        // Create insight object from received data
        const insight: Insight = {
          id: data.id || reader.info.id,
          type: data.type || attrs["insight_type"],
          content: data.content,
          speaker: data.speaker || attrs["speaker"],
          speakerName: data.speakerName || data.speaker_name || data.speaker,
          confidence: parseFloat(
            attrs["confidence"] || String(data.confidence || 0.8)
          ),
          transcriptRef: data.transcriptRef || data.transcript_ref,
          timestamp: data.timestamp || reader.info.timestamp || Date.now(),
        };

        // Validate required fields
        if (!insight.type || !insight.content) {
          console.warn("Received invalid insight:", data);
          return;
        }

        setInsights((prev) => {
          // Check for duplicates by ID
          if (prev.some((i) => i.id === insight.id)) {
            return prev;
          }

          // Add new insight at the beginning (newest first)
          const updated = [insight, ...prev];

          // Trim to max size
          return updated.slice(0, MAX_INSIGHTS);
        });
      } catch (err) {
        console.error("Failed to parse insight:", err);
      }
    },
    []
  );

  // Register text stream handler
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(INSIGHT_TOPIC);
    } catch {
      // Handler wasn't registered yet, ignore
    }

    try {
      room.registerTextStreamHandler(INSIGHT_TOPIC, handleInsightStream);
    } catch (err) {
      console.warn("Failed to register insight stream handler:", err);
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(INSIGHT_TOPIC);
      } catch {
        // Already unregistered, ignore
      }
    };
  }, [room, handleInsightStream]);

  /**
   * Group insights by type for filtering
   */
  const insightsByType = useMemo(() => {
    return insights.reduce(
      (acc, insight) => {
        if (!acc[insight.type]) {
          acc[insight.type] = [];
        }
        acc[insight.type]!.push(insight);
        return acc;
      },
      {} as Partial<Record<InsightType, Insight[]>>
    );
  }, [insights]);

  /**
   * Get insights related to a specific transcript segment
   */
  const getInsightsForTranscript = useCallback(
    (transcriptRef: string): Insight[] => {
      return insights.filter((i) => i.transcriptRef === transcriptRef);
    },
    [insights]
  );

  /**
   * Clear all insights
   */
  const clearInsights = useCallback(() => {
    setInsights([]);
  }, []);

  const value = useMemo(
    () => ({
      insights,
      insightsByType,
      insightCount: insights.length,
      getInsightsForTranscript,
      clearInsights,
    }),
    [insights, insightsByType, getInsightsForTranscript, clearInsights]
  );

  return (
    <InsightsContext.Provider value={value}>
      {children}
    </InsightsContext.Provider>
  );
}

/**
 * Hook to access insights from context.
 * Must be used within an InsightsProvider.
 *
 * @throws Error if used outside of InsightsProvider
 */
export function useInsightsContext(): InsightsContextValue {
  const context = useContext(InsightsContext);
  if (!context) {
    throw new Error("useInsightsContext must be used within an InsightsProvider");
  }
  return context;
}
