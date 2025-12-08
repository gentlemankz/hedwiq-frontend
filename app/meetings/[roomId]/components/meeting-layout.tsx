"use client";

import { useState, useCallback } from "react";
import { VideoConference, useRoomContext } from "@livekit/components-react";
import {
  TranscriptionSidebar,
  TranscriptionErrorBoundary,
} from "@/components/transcription";
import {
  InsightsSummaryPanel,
  InsightsIndicator,
} from "@/components/insights";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import { useDocumentsContext } from "@/contexts/documents-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, X, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInsights } from "@/hooks/use-insights";
import type { Insight } from "@/types/insight";
import type { DocumentReference } from "@/types/document";

interface MeetingLayoutProps {
  showTranscription?: boolean;
}

type SidebarTab = "transcript" | "insights";

export function MeetingLayout({
  showTranscription: initialShowTranscription = true,
}: MeetingLayoutProps) {
  const room = useRoomContext();
  const [showSidebar, setShowSidebar] = useState(initialShowTranscription);
  const [activeTab, setActiveTab] = useState<SidebarTab>("transcript");
  const { insightCount } = useInsights();
  const { getDocument, isHydrating, isDocumentLoading, documentCount } = useDocumentsContext();

  // Document reference viewer state
  const [selectedReference, setSelectedReference] =
    useState<DocumentReference | null>(null);

  // Get room ID from LiveKit room name
  const roomId = room?.name || "";

  // Handle insight click - switch to insights tab
  const handleInsightClick = useCallback((insight: Insight) => {
    setActiveTab("insights");
    // Could also scroll to the insight or highlight it
    console.log("Insight clicked:", insight);
  }, []);

  // Handle document reference click - open viewer modal
  const handleDocumentReferenceClick = useCallback(
    (reference: DocumentReference) => {
      // Debug logging to help track document reference issues
      const doc = getDocument(reference.documentId);
      console.log("[DocumentViewer] Reference clicked:", {
        documentId: reference.documentId,
        documentFound: !!doc,
        documentCount,
        isHydrating,
      });
      if (!doc) {
        console.warn(
          `[DocumentViewer] Document not found for ID: ${reference.documentId}. ` +
          `Available docs: ${documentCount}. Still hydrating: ${isHydrating}`
        );
      }
      setSelectedReference(reference);
    },
    [getDocument, documentCount, isHydrating]
  );

  // Close document viewer
  const handleCloseDocumentViewer = useCallback(() => {
    setSelectedReference(null);
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

          {/* Tab content - both components always mounted, visibility controlled by CSS */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <div
              className={cn(
                "absolute inset-0",
                activeTab !== "transcript" && "invisible"
              )}
            >
              <TranscriptionErrorBoundary>
                <TranscriptionSidebar
                  className="border-l-0 h-full"
                  onInsightClick={handleInsightClick}
                  onDocumentReferenceClick={handleDocumentReferenceClick}
                />
              </TranscriptionErrorBoundary>
            </div>
            <div
              className={cn(
                "absolute inset-0",
                activeTab !== "insights" && "invisible"
              )}
            >
              <InsightsSummaryPanel
                className="border-l-0 h-full"
                onInsightClick={handleInsightClick}
              />
            </div>
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

      {/* Document viewer modal */}
      <DocumentViewerModal
        reference={selectedReference}
        document={
          selectedReference ? getDocument(selectedReference.documentId) ?? null : null
        }
        roomId={roomId}
        open={!!selectedReference}
        onClose={handleCloseDocumentViewer}
        isLoadingDocument={
          !!selectedReference &&
          !getDocument(selectedReference.documentId) &&
          (isHydrating || isDocumentLoading(selectedReference.documentId))
        }
      />
    </div>
  );
}
