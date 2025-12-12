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
import { AgendaProgress } from "@/components/agenda";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import { useDocumentsContext } from "@/contexts/documents-context";
import { AgendaProvider } from "@/contexts/agenda";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FileText, Sparkles, X, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInsights } from "@/hooks/use-insights";
import { useAgenda } from "@/hooks/use-agenda";
import type { Insight } from "@/types/insight";
import type { DocumentReference } from "@/types/document";

/** Enable debug logging (disabled in production) */
const DEBUG = process.env.NODE_ENV === "development";

interface MeetingLayoutProps {
  showTranscription?: boolean;
  /** Agenda version for cache invalidation */
  agendaVersion?: number;
  /** Room ID (passed from parent to avoid race condition with room context) */
  roomId: string;
}

type SidebarTab = "transcript" | "insights";

export function MeetingLayout({
  showTranscription: initialShowTranscription = true,
  agendaVersion,
  roomId,
}: MeetingLayoutProps) {
  // Debug logging for room context
  if (DEBUG) {
    console.log("[MeetingLayout] Props:", {
      roomId,
      agendaVersion,
    });
  }

  return (
    <AgendaProvider
      roomId={roomId}
      agendaVersion={agendaVersion}
    >
      <MeetingLayoutInner
        initialShowTranscription={initialShowTranscription}
        roomId={roomId}
      />
    </AgendaProvider>
  );
}

interface MeetingLayoutInnerProps {
  initialShowTranscription: boolean;
  roomId: string;
}

function MeetingLayoutInner({
  initialShowTranscription,
  roomId,
}: MeetingLayoutInnerProps) {
  const [showSidebar, setShowSidebar] = useState(initialShowTranscription);
  const [activeTab, setActiveTab] = useState<SidebarTab>("transcript");
  const { insightCount } = useInsights();
  const { hasAgenda, agenda, isLoading, error } = useAgenda();
  const { getDocument, isHydrating, isDocumentLoading, documentCount } =
    useDocumentsContext();

  // Debug logging for agenda state
  if (DEBUG) {
    console.log("[MeetingLayout] Agenda state:", {
      hasAgenda,
      agendaId: agenda?.id,
      itemCount: agenda?.items?.length,
      isLoading,
      error,
      roomId,
    });
  }

  // Document reference viewer state
  const [selectedReference, setSelectedReference] =
    useState<DocumentReference | null>(null);

  // Handle insight click - switch to insights tab
  const handleInsightClick = useCallback((insight: Insight) => {
    setActiveTab("insights");
    if (DEBUG) {
      console.log("Insight clicked:", insight);
    }
  }, []);

  // Handle document reference click - open viewer modal
  const handleDocumentReferenceClick = useCallback(
    (reference: DocumentReference) => {
      const doc = getDocument(reference.documentId);
      if (DEBUG) {
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
      }
      setSelectedReference(reference);
    },
    [getDocument, documentCount, isHydrating]
  );

  // Close document viewer
  const handleCloseDocumentViewer = useCallback(() => {
    setSelectedReference(null);
  }, []);

  // Sidebar width: wider when agenda is shown (520px), normal otherwise (384px = w-96)
  const sidebarWidth = hasAgenda ? "w-[520px]" : "w-96";

  return (
    <div className="flex h-full">
      {/* Main video area */}
      <div
        className={cn(
          "flex-1 transition-all",
          showSidebar && (hasAgenda ? "mr-[520px]" : "mr-96")
        )}
      >
        <VideoConference />
      </div>

      {/* Combined sidebar with tabs */}
      {showSidebar && (
        <div
          className={cn(
            "fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-background border-l",
            sidebarWidth
          )}
        >
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

          {/* Main content area - split view when agenda exists */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {hasAgenda ? (
              <SplitSidebarContent
                activeTab={activeTab}
                onInsightClick={handleInsightClick}
                onDocumentReferenceClick={handleDocumentReferenceClick}
              />
            ) : (
              <SinglePanelContent
                activeTab={activeTab}
                onInsightClick={handleInsightClick}
                onDocumentReferenceClick={handleDocumentReferenceClick}
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

      {/* Document viewer modal */}
      <DocumentViewerModal
        reference={selectedReference}
        document={
          selectedReference
            ? getDocument(selectedReference.documentId) ?? null
            : null
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

// ============================================================================
// Shared Tab Content (extracted to reduce duplication)
// ============================================================================

interface TabContentProps {
  activeTab: SidebarTab;
  onInsightClick: (insight: Insight) => void;
  onDocumentReferenceClick: (reference: DocumentReference) => void;
}

/**
 * Shared content panel for transcript and insights tabs.
 * Extracted from Split/Single panel variants to eliminate duplication.
 */
function TabContent({
  activeTab,
  onInsightClick,
  onDocumentReferenceClick,
}: TabContentProps) {
  return (
    <div className="h-full relative">
      {/* Transcript tab content */}
      <div
        className={cn(
          "absolute inset-0",
          activeTab !== "transcript" && "invisible"
        )}
      >
        <TranscriptionErrorBoundary>
          <TranscriptionSidebar
            className="border-l-0 h-full"
            onInsightClick={onInsightClick}
            onDocumentReferenceClick={onDocumentReferenceClick}
          />
        </TranscriptionErrorBoundary>
      </div>

      {/* Insights tab content */}
      <div
        className={cn(
          "absolute inset-0",
          activeTab !== "insights" && "invisible"
        )}
      >
        <InsightsSummaryPanel
          className="border-l-0 h-full"
          onInsightClick={onInsightClick}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Split Sidebar Content (with Agenda)
// ============================================================================

interface SplitSidebarContentProps {
  activeTab: SidebarTab;
  onInsightClick: (insight: Insight) => void;
  onDocumentReferenceClick: (reference: DocumentReference) => void;
}

function SplitSidebarContent({
  activeTab,
  onInsightClick,
  onDocumentReferenceClick,
}: SplitSidebarContentProps) {
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Agenda Panel (left side) */}
      <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
        <div className="h-full border-r">
          <AgendaProgress className="h-full" />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Transcript/Insights Panel (right side) */}
      <ResizablePanel defaultSize={65} minSize={50}>
        <TabContent
          activeTab={activeTab}
          onInsightClick={onInsightClick}
          onDocumentReferenceClick={onDocumentReferenceClick}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// ============================================================================
// Single Panel Content (no Agenda)
// ============================================================================

interface SinglePanelContentProps {
  activeTab: SidebarTab;
  onInsightClick: (insight: Insight) => void;
  onDocumentReferenceClick: (reference: DocumentReference) => void;
}

function SinglePanelContent({
  activeTab,
  onInsightClick,
  onDocumentReferenceClick,
}: SinglePanelContentProps) {
  return (
    <TabContent
      activeTab={activeTab}
      onInsightClick={onInsightClick}
      onDocumentReferenceClick={onDocumentReferenceClick}
    />
  );
}
