"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ExternalLink,
  FileText,
  AlertCircle,
  Maximize2,
  Minimize2,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfViewer } from "./pdf-viewer";
import type { DocumentReference, UploadedDocument } from "@/types/document";

// ============================================================================
// Types
// ============================================================================

interface DocumentViewerModalProps {
  /** The document reference to display */
  reference: DocumentReference | null;
  /** The document metadata */
  document: UploadedDocument | null;
  /** Room ID for API access */
  roomId: string;
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Whether document metadata is still loading */
  isLoadingDocument?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal component for viewing document references.
 *
 * Displays the referenced document with context about the match.
 * Uses react-pdf for PDF rendering with bbox highlighting.
 *
 * @example
 * ```tsx
 * <DocumentViewerModal
 *   reference={selectedReference}
 *   document={getDocument(selectedReference.documentId)}
 *   roomId={roomId}
 *   open={!!selectedReference}
 *   onClose={() => setSelectedReference(null)}
 * />
 * ```
 */
export function DocumentViewerModal({
  reference,
  document,
  roomId,
  open,
  onClose,
  isLoadingDocument = false,
}: DocumentViewerModalProps) {
  // Don't render dialog if we have no reference (nothing to show)
  if (!reference) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {isLoadingDocument ? (
        // Loading state while document metadata is being fetched
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Loading document...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Fetching document metadata
              </p>
            </div>
          </div>
        </DialogContent>
      ) : !document ? (
        // Error state when document can't be found
        <DialogContent className="max-w-md" showCloseButton={false}>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertCircle className="size-8 text-destructive" />
            <div className="text-center">
              <p className="font-medium">Document not found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The referenced document could not be loaded.
                <br />
                Document ID: <code className="text-xs">{reference.documentId}</code>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      ) : (
        // Normal content when document is available
        <DocumentViewerContent
          key={reference.id}
          reference={reference}
          document={document}
          roomId={roomId}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

// ============================================================================
// Inner Content Component
// ============================================================================

interface DocumentViewerContentProps {
  reference: DocumentReference;
  document: UploadedDocument;
  roomId: string;
  onClose: () => void;
}

function DocumentViewerContent({
  reference,
  document,
  roomId,
  onClose,
}: DocumentViewerContentProps) {
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [numPages, setNumPages] = useState<number>(document.pageCount || 0);

  // Build PDF URL
  const pdfUrl = `/api/documents/${reference.documentId}/pdf?roomId=${encodeURIComponent(roomId)}`;

  // Handle document load
  const handleDocumentLoad = useCallback((pages: number) => {
    setNumPages(pages);
    setError(null);
  }, []);

  // Handle document error
  const handleDocumentError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  // Open in new tab
  const openInNewTab = useCallback(() => {
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }, [pdfUrl]);

  // Toggle expanded view
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Toggle sidebar collapsed state
  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        "flex flex-col p-0 gap-0 transition-all duration-200",
        isExpanded
          ? "w-[95vw] !max-w-[95vw] h-[95vh]"
          : "w-[90vw] !max-w-[90vw] h-[85vh]"
      )}
    >
      {/* Header */}
      <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileText className="size-5 text-blue-600" />
              <span className="truncate">{document.title}</span>
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {document.filename} &middot; {numPages || document.pageCount} pages
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="size-8"
              title={isSidebarCollapsed ? "Show details" : "Hide details"}
              aria-label={isSidebarCollapsed ? "Show reference details panel" : "Hide reference details panel"}
              aria-pressed={!isSidebarCollapsed}
            >
              {isSidebarCollapsed ? (
                <PanelLeft className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleExpanded}
              className="size-8"
              title={isExpanded ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isExpanded ? "Exit fullscreen mode" : "Enter fullscreen mode"}
              aria-pressed={isExpanded}
            >
              {isExpanded ? (
                <Minimize2 className="size-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="size-4" aria-hidden="true" />
              )}
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={openInNewTab}
              aria-label="Open document in new browser tab"
            >
              <ExternalLink className="size-4 mr-2" aria-hidden="true" />
              Open in Tab
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8"
              title="Close (Esc)"
              aria-label="Close document viewer"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </DialogHeader>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Reference info sidebar - collapsible, conditionally rendered for accessibility */}
        <div
          className={cn(
            "border-r flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
            isSidebarCollapsed
              ? "w-0 border-r-0"
              : isExpanded
                ? "w-72"
                : "w-64"
          )}
          aria-hidden={isSidebarCollapsed}
        >
          {/* Only render content when sidebar is visible to prevent focus trapping */}
          {!isSidebarCollapsed && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Reference details */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Reference Details</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Page:</span>
                      <span className="ml-2 font-medium">
                        Page {reference.pageNumber}
                      </span>
                    </div>

                    {reference.sectionTitle && (
                      <div>
                        <span className="text-muted-foreground block">
                          Section:
                        </span>
                        <span className="font-medium">
                          {reference.sectionTitle}
                        </span>
                      </div>
                    )}

                    <div>
                      <span className="text-muted-foreground block">
                        Confidence:
                      </span>
                      <Badge
                        variant={
                          reference.confidence >= 0.9
                            ? "default"
                            : reference.confidence >= 0.7
                            ? "secondary"
                            : "outline"
                        }
                        className="mt-1"
                      >
                        {Math.round(reference.confidence * 100)}% match
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Context/rationale */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Why Referenced</h3>
                  <p className="text-sm text-muted-foreground">
                    {reference.context}
                  </p>
                </div>

                {/* Matched text */}
                {reference.matchedText && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium mb-2">
                        Matched Content
                      </h3>
                      <blockquote className="text-sm italic border-l-2 border-blue-300 pl-3 text-muted-foreground">
                        &quot;{reference.matchedText}&quot;
                      </blockquote>
                    </div>
                  </>
                )}

                {/* Bbox info (for debugging/future use) */}
                {reference.bbox && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                        Location Data
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        x: {Math.round(reference.bbox.x0)}-
                        {Math.round(reference.bbox.x1)}, y:{" "}
                        {Math.round(reference.bbox.y0)}-
                        {Math.round(reference.bbox.y1)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* PDF viewer area */}
        <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
          {error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-destructive">
                <AlertCircle className="size-8" />
                <span className="text-sm">{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setError(null)}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <PdfViewer
              file={pdfUrl}
              initialPage={reference.pageNumber}
              bbox={reference.bbox}
              highlightText={reference.matchedText}
              highlightPage={reference.pageNumber}
              onDocumentLoad={handleDocumentLoad}
              onError={handleDocumentError}
              className="flex-1"
            />
          )}
        </div>
      </div>
    </DialogContent>
  );
}
