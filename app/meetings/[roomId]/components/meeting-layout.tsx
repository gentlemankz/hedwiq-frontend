"use client";

import { useState, useCallback, useEffect } from "react";
import { CustomVideoConference } from "@/components/participant";
import {
  TranscriptionSidebar,
  TranscriptionErrorBoundary,
  type TranscriptionEntry,
} from "@/components/transcription";
import { AgendaProgress } from "@/components/agenda";
import { MeetingInfoHeader } from "@/components/meeting/meeting-info-header";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import { useDocumentsContext } from "@/contexts/documents-context";
import { useMeetingPersistence } from "@/contexts/meeting-persistence-context";
import { useInsightsContext } from "@/contexts/insights-context";
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
import { useBlockNotes } from "@/hooks/use-block-notes";
import type { Insight } from "@/types/insight";
import type { DocumentReference } from "@/types/document";
import type { TranscriptReference } from "@/types/transcript-note";

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
  const { getDocument, isHydrating, isDocumentLoading, documentCount, references } =
    useDocumentsContext();
  const { insights } = useInsightsContext();
  const persistence = useMeetingPersistence();

  // Block-based notes management
  const {
    blocks,
    transcriptNotes,
    addTextBlock,
    updateTextBlock,
    deleteBlock,
    moveBlock,
    addTranscriptNote,
    updateTranscriptNote,
    deleteTranscriptNote,
    hasNotesForTranscript,
  } = useBlockNotes({ storageKey: roomId });

  // Persist insights when they change
  useEffect(() => {
    if (persistence?.isEnabled && insights.length > 0) {
      persistence.queueInsights(insights);
    }
  }, [persistence, insights]);

  // Persist document references when they change
  useEffect(() => {
    if (persistence?.isEnabled && references.length > 0) {
      persistence.queueDocumentReferences(references);
    }
  }, [persistence, references]);

  // Persist notes when they change
  useEffect(() => {
    if (persistence?.isEnabled && (blocks.length > 0 || Object.keys(transcriptNotes).length > 0)) {
      persistence.saveNotes(blocks, transcriptNotes);
    }
  }, [persistence, blocks, transcriptNotes]);

  // Handle transcription updates for persistence
  const handleTranscriptionUpdate = useCallback(
    (entries: TranscriptionEntry[]) => {
      if (persistence?.isEnabled) {
        // Convert from TranscriptionEntry to the format expected by persistence
        const formattedEntries = entries.map((e) => ({
          id: e.id,
          speakerIdentity: e.participantIdentity,
          speakerName: e.participantName,
          text: e.text,
          timestamp: e.timestamp,
          isFinal: e.isFinal,
        }));
        persistence.queueTranscription(formattedEntries);
      }
    },
    [persistence]
  );

  // Handle adding a note from transcript
  const handleAddNote = useCallback(
    (reference: TranscriptReference, content: string) => {
      addTranscriptNote(reference, content);
      if (DEBUG) {
        console.log("[MeetingLayout] Added transcript note:", {
          transcriptId: reference.transcriptId,
          content,
        });
      }
    },
    [addTranscriptNote]
  );

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
        <CustomVideoConference
          meetingTitle={meetingName || "Meeting Notes"}
          roomId={roomId}
          blocks={blocks}
          transcriptNotes={transcriptNotes}
          onAddTextBlock={addTextBlock}
          onUpdateTextBlock={updateTextBlock}
          onDeleteBlock={deleteBlock}
          onMoveBlock={moveBlock}
          onUpdateTranscriptNote={updateTranscriptNote}
          onDeleteTranscriptNote={deleteTranscriptNote}
        />
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
                onAddNote={handleAddNote}
                hasNotesForTranscript={hasNotesForTranscript}
                onTranscriptionUpdate={handleTranscriptionUpdate}
              />
            ) : (
              <TranscriptPanel
                onInsightClick={handleInsightClick}
                onDocumentReferenceClick={handleDocumentReferenceClick}
                meetingName={meetingName}
                meetingScheduledAt={meetingScheduledAt}
                onAddNote={handleAddNote}
                hasNotesForTranscript={hasNotesForTranscript}
                onTranscriptionUpdate={handleTranscriptionUpdate}
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
  onAddNote?: (reference: TranscriptReference, content: string) => void;
  hasNotesForTranscript?: (transcriptId: string) => boolean;
  onTranscriptionUpdate?: (entries: TranscriptionEntry[]) => void;
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
  onAddNote,
  hasNotesForTranscript,
  onTranscriptionUpdate,
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
            onAddNote={onAddNote}
            hasNotesForTranscript={hasNotesForTranscript}
            onTranscriptionUpdate={onTranscriptionUpdate}
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
  onAddNote?: (reference: TranscriptReference, content: string) => void;
  hasNotesForTranscript?: (transcriptId: string) => boolean;
  onTranscriptionUpdate?: (entries: TranscriptionEntry[]) => void;
}

function SplitSidebarContent({
  onInsightClick,
  onDocumentReferenceClick,
  meetingName,
  meetingScheduledAt,
  onAddNote,
  hasNotesForTranscript,
  onTranscriptionUpdate,
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
          onAddNote={onAddNote}
          hasNotesForTranscript={hasNotesForTranscript}
          onTranscriptionUpdate={onTranscriptionUpdate}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
