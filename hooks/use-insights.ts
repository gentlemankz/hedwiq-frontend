"use client";

import { useInsightsContext } from "@/contexts/insights-context";
import type { Insight, InsightType } from "@/types/insight";

/**
 * Return type for the useInsights hook
 */
interface UseInsightsReturn {
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

/**
 * Custom hook for accessing real-time insights from the Luframe agent.
 *
 * This hook is a thin wrapper around useInsightsContext that provides
 * access to shared insights state. Must be used within an InsightsProvider.
 *
 * @example
 * ```tsx
 * function InsightsPanel() {
 *   const { insights, insightsByType, insightCount } = useInsights();
 *
 *   return (
 *     <div>
 *       <p>Total insights: {insightCount}</p>
 *       {insights.map(insight => (
 *         <InsightCard key={insight.id} insight={insight} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useInsights(): UseInsightsReturn {
  return useInsightsContext();
}
