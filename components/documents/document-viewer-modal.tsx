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
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentReference, UploadedDocument } from "@/types/document";

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
}

/**
 * Modal component for viewing document references.
 *
 * Displays the referenced document with context about the match.
 * Uses native browser PDF rendering via iframe.
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
}: DocumentViewerModalProps) {
  if (!reference || !document) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {/* Use key to reset inner component state when reference changes */}
      <DocumentViewerContent
        key={reference.id}
        reference={reference}
        document={document}
        roomId={roomId}
      />
    </Dialog>
  );
}

/**
 * Inner content component that holds the stateful logic.
 * Using key={reference.id} on this component ensures state resets
 * when switching between different references.
 */
interface DocumentViewerContentProps {
  reference: DocumentReference;
  document: UploadedDocument;
  roomId: string;
}

function DocumentViewerContent({
  reference,
  document,
  roomId,
}: DocumentViewerContentProps) {
  // State is now scoped to this component and resets via key prop
  const [currentPage, setCurrentPage] = useState(reference.pageNumber);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build PDF URL with page fragment
  const getPdfUrl = useCallback(
    (page?: number) => {
      const baseUrl = `/api/documents/${reference.documentId}/pdf?roomId=${encodeURIComponent(roomId)}`;
      // Add page fragment for PDF viewers that support it
      return page ? `${baseUrl}#page=${page}` : baseUrl;
    },
    [reference.documentId, roomId]
  );

  const pdfUrl = getPdfUrl(currentPage);

  // Navigation handlers
  const goToPrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
    setIsLoading(true);
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, document.pageCount));
    setIsLoading(true);
  }, [document.pageCount]);

  const goToReferencedPage = useCallback(() => {
    setCurrentPage(reference.pageNumber);
    setIsLoading(true);
  }, [reference.pageNumber]);

  // Handle iframe load events
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setError("Failed to load document");
  }, []);

  // Open in new tab
  const openInNewTab = useCallback(() => {
    const url = getPdfUrl();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [getPdfUrl]);

  return (
    <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
      {/* Header */}
      <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileText className="size-5 text-blue-600" />
              <span className="truncate">{document.title}</span>
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {document.filename} &middot; {document.pageCount} pages
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openInNewTab}
            className="flex-shrink-0"
          >
            <ExternalLink className="size-4 mr-2" />
            Open in Tab
          </Button>
        </div>
      </DialogHeader>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Reference info sidebar */}
        <div className="w-72 border-r flex-shrink-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Reference details */}
              <div>
                <h3 className="text-sm font-medium mb-2">Reference Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Page:</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 ml-2 text-blue-600"
                      onClick={goToReferencedPage}
                    >
                      Page {reference.pageNumber}
                    </Button>
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
        </div>

        {/* PDF viewer area */}
        <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
          {/* PDF iframe */}
          <div className="flex-1 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Loading document...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="size-8" />
                  <span className="text-sm">{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setIsLoading(true);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {pdfUrl && (
              <iframe
                key={`${reference.documentId}-${currentPage}`}
                src={pdfUrl}
                className="w-full h-full border-0"
                title={`${document.title} - Page ${currentPage}`}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            )}
          </div>

          {/* Page navigation */}
          <div className="flex items-center justify-center gap-4 py-3 border-t bg-background">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="size-4 mr-1" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm">
                Page{" "}
                <span className="font-medium">{currentPage}</span> of{" "}
                <span className="font-medium">{document.pageCount}</span>
              </span>
              {currentPage !== reference.pageNumber && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToReferencedPage}
                  className={cn(
                    "text-xs h-7 px-2",
                    "text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  )}
                >
                  Go to ref (p.{reference.pageNumber})
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= document.pageCount}
            >
              Next
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
