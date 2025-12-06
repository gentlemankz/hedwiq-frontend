"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInsights } from "@/hooks/use-insights";
import { InsightCardList } from "./insight-card";
import type { Insight } from "@/types/insight";
import {
  Sparkles,
  ClipboardList,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

interface InsightsSummaryPanelProps {
  /** Additional CSS classes */
  className?: string;
  /** Handler when an insight is clicked */
  onInsightClick?: (insight: Insight) => void;
}

/**
 * A panel component that displays all insights from the meeting.
 *
 * Features:
 * - Tabs for filtering by category (All, Actions, Issues, Ideas)
 * - Real-time updates as insights are detected
 * - Count badges for each category
 * - Click to navigate to related transcript
 *
 * @example
 * ```tsx
 * <InsightsSummaryPanel
 *   onInsightClick={(insight) => scrollToTranscript(insight.transcriptRef)}
 * />
 * ```
 */
export function InsightsSummaryPanel({
  className,
  onInsightClick,
}: InsightsSummaryPanelProps) {
  const { insights, insightsByType, insightCount } = useInsights();
  const [activeTab, setActiveTab] = useState("all");

  // Calculate counts for each tab
  const actionCount = (insightsByType.action_item?.length || 0);
  const issuesCount =
    (insightsByType.problem?.length || 0) +
    (insightsByType.risk?.length || 0) +
    (insightsByType.open_question?.length || 0);
  const ideasCount =
    (insightsByType.idea?.length || 0) +
    (insightsByType.solution?.length || 0);

  // Get filtered insights for each tab
  const getFilteredInsights = (tab: string): Insight[] => {
    switch (tab) {
      case "actions":
        return insightsByType.action_item || [];
      case "issues":
        return [
          ...(insightsByType.problem || []),
          ...(insightsByType.risk || []),
          ...(insightsByType.open_question || []),
        ].sort((a, b) => b.timestamp - a.timestamp);
      case "ideas":
        return [
          ...(insightsByType.idea || []),
          ...(insightsByType.solution || []),
        ].sort((a, b) => b.timestamp - a.timestamp);
      default:
        return insights;
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-background",
        className
      )}
    >
      {/* Filter Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        <TabsList className="mx-4 mt-3 grid grid-cols-4 shrink-0">
          <TabsTrigger value="all" className="text-xs">
            All
            {insightCount > 0 && (
              <Badge variant="secondary" className="ml-1 size-5 p-0 justify-center">
                {insightCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">
            <ClipboardList className="size-3 mr-1" />
            Actions
            {actionCount > 0 && (
              <Badge variant="secondary" className="ml-1 size-5 p-0 justify-center">
                {actionCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs">
            <AlertTriangle className="size-3 mr-1" />
            Issues
            {issuesCount > 0 && (
              <Badge variant="secondary" className="ml-1 size-5 p-0 justify-center">
                {issuesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ideas" className="text-xs">
            <Lightbulb className="size-3 mr-1" />
            Ideas
            {ideasCount > 0 && (
              <Badge variant="secondary" className="ml-1 size-5 p-0 justify-center">
                {ideasCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-3">
          <div className="p-4 pt-0">
            <TabsContent value="all" className="mt-0">
              <InsightCardList
                insights={getFilteredInsights("all")}
                onInsightClick={onInsightClick}
                emptyMessage="No insights detected yet"
              />
            </TabsContent>

            <TabsContent value="actions" className="mt-0">
              <InsightCardList
                insights={getFilteredInsights("actions")}
                onInsightClick={onInsightClick}
                emptyMessage="No action items detected"
              />
            </TabsContent>

            <TabsContent value="issues" className="mt-0">
              <InsightCardList
                insights={getFilteredInsights("issues")}
                onInsightClick={onInsightClick}
                emptyMessage="No issues or risks detected"
              />
            </TabsContent>

            <TabsContent value="ideas" className="mt-0">
              <InsightCardList
                insights={getFilteredInsights("ideas")}
                onInsightClick={onInsightClick}
                emptyMessage="No ideas or solutions detected"
              />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

/**
 * A minimal insights indicator for showing in the toolbar.
 */
export function InsightsIndicator({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const { insightCount } = useInsights();

  if (insightCount === 0) {
    return null;
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn("gap-2", className)}
      onClick={onClick}
    >
      <Sparkles className="size-4" />
      <span>{insightCount} insights</span>
    </Button>
  );
}
