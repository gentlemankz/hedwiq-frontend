"use client";

import { useState, useCallback } from "react";
import { VideoConference } from "@livekit/components-react";
import {
  TranscriptionSidebar,
  TranscriptionErrorBoundary,
} from "@/components/transcription";
import {
  InsightsSummaryPanel,
  InsightsIndicator,
} from "@/components/insights";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, X, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInsights } from "@/hooks/use-insights";
import type { Insight } from "@/types/insight";

interface MeetingLayoutProps {
  showTranscription?: boolean;
}

type SidebarTab = "transcript" | "insights";

export function MeetingLayout({
  showTranscription: initialShowTranscription = true,
}: MeetingLayoutProps) {
  const [showSidebar, setShowSidebar] = useState(initialShowTranscription);
  const [activeTab, setActiveTab] = useState<SidebarTab>("transcript");
  const { insightCount } = useInsights();

  // Handle insight click - switch to insights tab
  const handleInsightClick = useCallback((insight: Insight) => {
    setActiveTab("insights");
    // Could also scroll to the insight or highlight it
    console.log("Insight clicked:", insight);
  }, []);

  return (
    <div className="flex h-full">
      {/* Main video area */}
      <div className={cn("flex-1 transition-all", showSidebar && "mr-96")}>
        <VideoConference />
      </div>

      {/* Combined sidebar with tabs */}
      {showSidebar && (
        <div className="fixed right-0 top-0 bottom-0 w-96 z-50 flex flex-col bg-background border-l">
          {/* Sidebar header with tabs */}
          <div className="border-b">
            <div className="flex items-center justify-between px-4 py-2">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as SidebarTab)}
                className="flex-1"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="transcript" className="gap-2">
                    <FileText className="size-4" />
                    Transcript
                  </TabsTrigger>
                  <TabsTrigger value="insights" className="gap-2">
                    <Sparkles className="size-4" />
                    Insights
                    {insightCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 size-5 p-0 justify-center text-xs"
                      >
                        {insightCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 ml-2"
                onClick={() => setShowSidebar(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "transcript" ? (
              <TranscriptionErrorBoundary>
                <TranscriptionSidebar
                  className="border-l-0 h-full"
                  onInsightClick={handleInsightClick}
                />
              </TranscriptionErrorBoundary>
            ) : (
              <InsightsSummaryPanel
                className="border-l-0 h-full"
                onInsightClick={handleInsightClick}
              />
            )}
          </div>
        </div>
      )}

      {/* Toggle button when sidebar is hidden */}
      {!showSidebar && (
        <div className="fixed right-4 top-4 z-50 flex gap-2">
          {/* Show insights indicator if there are insights */}
          <InsightsIndicator
            onClick={() => {
              setShowSidebar(true);
              setActiveTab("insights");
            }}
          />

          {/* Main toggle button */}
          <Button
            variant="secondary"
            size="sm"
            className="shadow-lg"
            onClick={() => setShowSidebar(true)}
          >
            <PanelRightClose className="mr-2 size-4" />
            Open Panel
          </Button>
        </div>
      )}
    </div>
  );
}
