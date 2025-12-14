"use client";

import { useState, useCallback } from "react";
import { CustomVideoConference } from "@/components/participant";
import {
  TranscriptionSidebar,
  TranscriptionErrorBoundary,
} from "@/components/transcription";
import { AgendaProgress } from "@/components/agenda";
import { MeetingInfoHeader } from "@/components/meeting/meeting-info-header";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import { useDocumentsContext } from "@/contexts/documents-context";
import { AgendaProvider } from "@/contexts/agenda";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PanelRightClose, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /** Meeting name for display */
  meetingName?: string;
  /** Meeting scheduled time */
  meetingScheduledAt?: Date;
}

export function MeetingLayout({
  showTranscription: initialShowTranscription = true,
  agendaVersion,
  roomId,
  meetingName,
  meetingScheduledAt,
}: MeetingLayoutProps) {
  // Debug logging for room context
  if (DEBUG) {
    console.log("[MeetingLayout] Props:", {
      roomId,
      agendaVersion,
      meetingName,
      meetingScheduledAt,
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
        meetingName={meetingName}
        meetingScheduledAt={meetingScheduledAt}
      />
    </AgendaProvider>
  );
}

interface MeetingLayoutInnerProps {
  initialShowTranscription: boolean;
  roomId: string;
  meetingName?: string;
  meetingScheduledAt?: Date;
}

function MeetingLayoutInner({
  initialShowTranscription,
  roomId,
  meetingName,
  meetingScheduledAt,
}: MeetingLayoutInnerProps) {
  const [showSidebar, setShowSidebar] = useState(initialShowTranscription);
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

  // Handle insight click - just log in debug mode (insights shown inline in transcript)
  const handleInsightClick = useCallback((insight: Insight) => {
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
        <CustomVideoConference />
      </div>

      {/* Sidebar with meeting info header and transcript */}
      {showSidebar && (
        <div
          className={cn(
            "fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-background border-l",
            sidebarWidth
          )}
        >
          {/* Sidebar header with collapse button on left */}
          <div className="flex items-center justify-start px-1 py-1 border-b">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setShowSidebar(false)}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>

          {/* Main content area - split view when agenda exists */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {hasAgenda ? (
              <SplitSidebarContent
                onInsightClick={handleInsightClick}
                onDocumentReferenceClick={handleDocumentReferenceClick}
                meetingName={meetingName}
                meetingScheduledAt={meetingScheduledAt}
              />
            ) : (
              <TranscriptPanel
                onInsightClick={handleInsightClick}
                onDocumentReferenceClick={handleDocumentReferenceClick}
                meetingName={meetingName}
                meetingScheduledAt={meetingScheduledAt}
              />
            )}
          </div>
        </div>
      )}

      {/* Toggle button when sidebar is hidden */}
      {!showSidebar && (
        <div className="fixed right-4 top-4 z-50 flex gap-2">
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
// Transcript Panel with Meeting Info Header
// ============================================================================

interface TranscriptPanelProps {
  onInsightClick: (insight: Insight) => void;
  onDocumentReferenceClick: (reference: DocumentReference) => void;
  meetingName?: string;
  meetingScheduledAt?: Date;
}

/**
 * Transcript panel with meeting info header.
 * Shows meeting image, name, and date/time above the transcript.
 */
function TranscriptPanel({
  onInsightClick,
  onDocumentReferenceClick,
  meetingName,
  meetingScheduledAt,
}: TranscriptPanelProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Meeting Info Header */}
      <MeetingInfoHeader
        meetingName={meetingName}
        scheduledAt={meetingScheduledAt}
      />

      {/* Transcript */}
      <div className="flex-1 min-h-0">
        <TranscriptionErrorBoundary>
          <TranscriptionSidebar
            className="border-l-0 h-full"
            onInsightClick={onInsightClick}
            onDocumentReferenceClick={onDocumentReferenceClick}
          />
        </TranscriptionErrorBoundary>
      </div>
    </div>
  );
}

// ============================================================================
// Split Sidebar Content (with Agenda)
// ============================================================================

interface SplitSidebarContentProps {
  onInsightClick: (insight: Insight) => void;
  onDocumentReferenceClick: (reference: DocumentReference) => void;
  meetingName?: string;
  meetingScheduledAt?: Date;
}

function SplitSidebarContent({
  onInsightClick,
  onDocumentReferenceClick,
  meetingName,
  meetingScheduledAt,
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

      {/* Transcript Panel (right side) */}
      <ResizablePanel defaultSize={65} minSize={50}>
        <TranscriptPanel
          onInsightClick={onInsightClick}
          onDocumentReferenceClick={onDocumentReferenceClick}
          meetingName={meetingName}
          meetingScheduledAt={meetingScheduledAt}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
