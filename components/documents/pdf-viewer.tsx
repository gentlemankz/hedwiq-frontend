"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoundingBox } from "@/types/document";

// Import react-pdf styles
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker - use local worker for offline/restricted deployments
// Worker file is copied to public/ during build via postinstall script
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ============================================================================
// Types
// ============================================================================

interface PdfViewerProps {
  /** URL or File object for the PDF */
  file: string | File;
  /** Initial page number to display */
  initialPage?: number;
  /** Bounding box for coordinate-based highlighting */
  bbox?: BoundingBox;
  /** Text to highlight (fallback if no bbox) */
  highlightText?: string;
  /** Page number where the highlight should appear */
  highlightPage?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Callback when document loads */
  onDocumentLoad?: (numPages: number) => void;
  /** Callback when document fails to load */
  onError?: (error: string) => void;
  /** Custom class name */
  className?: string;
}

interface PageDimensions {
  width: number;
  height: number;
}

// ============================================================================
// Component
// ============================================================================

/**
 * PDF Viewer component using react-pdf with support for:
 * - Bounding box highlighting
 * - Fuzzy text highlighting (fallback)
 * - Page navigation
 * - Zoom controls
 * - Rotation
 */
export function PdfViewer({
  file,
  initialPage = 1,
  bbox,
  highlightText,
  highlightPage,
  onPageChange,
  onDocumentLoad,
  onError,
  className,
}: PdfViewerProps) {
  // State
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageDimensions, setPageDimensions] = useState<PageDimensions | null>(
    null
  );

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // Document Load Handlers
  // ============================================================================

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setIsLoading(false);
      setError(null);
      onDocumentLoad?.(numPages);
    },
    [onDocumentLoad]
  );

  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error("PDF load error:", err);
    const errorMessage = "Failed to load PDF document";
    setError(errorMessage);
    setIsLoading(false);
    onError?.(errorMessage);
  }, [onError]);

  const handlePageLoadSuccess = useCallback(
    (page: { width: number; height: number }) => {
      setPageDimensions({
        width: page.width,
        height: page.height,
      });
    },
    []
  );

  // ============================================================================
  // Navigation
  // ============================================================================

  const goToPage = useCallback(
    (page: number) => {
      const newPage = Math.max(1, Math.min(page, numPages));
      setCurrentPage(newPage);
      onPageChange?.(newPage);
    },
    [numPages, onPageChange]
  );

  const goToPrevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const goToHighlightPage = useCallback(() => {
    if (highlightPage) {
      goToPage(highlightPage);
    }
  }, [highlightPage, goToPage]);

  // ============================================================================
  // Zoom
  // ============================================================================

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleZoomChange = useCallback((values: number[]) => {
    setScale(values[0]);
  }, []);

  // ============================================================================
  // Rotation
  // ============================================================================

  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // ============================================================================
  // Fuzzy Text Highlighting
  // ============================================================================

  /**
   * Normalize text for fuzzy matching (lowercase, collapse whitespace, remove punctuation)
   */
  const normalizeText = useCallback((text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Remove punctuation
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  /**
   * Custom text renderer for highlighting matched text in the text layer.
   * Only active when there's highlightText but no bbox.
   *
   * Uses multiple matching strategies since PDF text chunks are small:
   * 1. Exact substring match (chunk in highlight or highlight in chunk)
   * 2. Significant word matches (4+ char words)
   * 3. Bigram matching for multi-word phrases
   */
  const customTextRenderer = useMemo(() => {
    // Only use text highlighting when there's no bbox and we have text to highlight
    if (bbox || !highlightText || currentPage !== highlightPage) {
      return undefined;
    }

    const normalizedHighlight = normalizeText(highlightText);

    // Extract significant words (4+ chars, excluding common stop words)
    const stopWords = new Set(["this", "that", "with", "from", "have", "been", "were", "they", "their", "what", "when", "where", "which", "will", "would", "could", "should", "there", "these", "those", "about", "after", "before", "between", "into", "through", "during", "under", "over"]);
    const significantWords = normalizedHighlight
      .split(" ")
      .filter((word) => word.length >= 4 && !stopWords.has(word));

    // Create bigrams for phrase matching
    const words = normalizedHighlight.split(" ").filter((w) => w.length >= 2);
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }

    return function textRenderer({
      str,
    }: {
      str: string;
      itemIndex: number;
    }): string {
      const normalizedStr = normalizeText(str);

      // Skip very short chunks
      if (normalizedStr.length < 2) {
        return str;
      }

      // Strategy 1: Check if chunk is part of highlight text (handles small chunks)
      if (normalizedStr.length >= 3 && normalizedHighlight.includes(normalizedStr)) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      // Strategy 2: Check if highlight text is part of chunk (handles large chunks)
      if (normalizedStr.includes(normalizedHighlight)) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      // Strategy 3: Bigram matching (phrase continuity)
      const hasBigramMatch = bigrams.some((bigram) =>
        normalizedStr.includes(bigram)
      );
      if (hasBigramMatch) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      // Strategy 4: Significant word matching (weaker signal)
      const matchedWords = significantWords.filter((word) =>
        normalizedStr.includes(word)
      );

      // Require at least one significant word match, and it should be substantial
      if (matchedWords.length > 0 && matchedWords.some((w) => w.length >= 5)) {
        return `<mark class="pdf-highlight-partial">${str}</mark>`;
      }

      return str;
    };
  }, [bbox, highlightText, highlightPage, currentPage, normalizeText]);

  // ============================================================================
  // Bbox Highlighting (rotation-aware)
  // ============================================================================

  // Position highlight overlay when bbox is available
  useEffect(() => {
    if (
      !bbox ||
      !pageDimensions ||
      !highlightRef.current ||
      currentPage !== highlightPage
    ) {
      if (highlightRef.current) {
        highlightRef.current.style.display = "none";
      }
      return;
    }

    const overlay = highlightRef.current;

    // Original bbox coordinates (PDF space: origin at bottom-left)
    let left: number, top: number, width: number, height: number;

    const pageWidth = pageDimensions.width;
    const pageHeight = pageDimensions.height;

    // Transform coordinates based on rotation
    // PDF coordinates have origin at bottom-left, screen at top-left
    switch (rotation) {
      case 0:
        // No rotation: standard transform
        left = bbox.x0 * scale;
        width = (bbox.x1 - bbox.x0) * scale;
        top = (pageHeight - bbox.y1) * scale;
        height = (bbox.y1 - bbox.y0) * scale;
        break;

      case 90:
        // 90° clockwise: x -> y, y -> (width - x)
        left = (pageHeight - bbox.y1) * scale;
        width = (bbox.y1 - bbox.y0) * scale;
        top = bbox.x0 * scale;
        height = (bbox.x1 - bbox.x0) * scale;
        break;

      case 180:
        // 180°: flip both axes
        left = (pageWidth - bbox.x1) * scale;
        width = (bbox.x1 - bbox.x0) * scale;
        top = bbox.y0 * scale;
        height = (bbox.y1 - bbox.y0) * scale;
        break;

      case 270:
        // 270° clockwise (90° counter-clockwise): y -> x, x -> (height - y)
        left = bbox.y0 * scale;
        width = (bbox.y1 - bbox.y0) * scale;
        top = (pageWidth - bbox.x1) * scale;
        height = (bbox.x1 - bbox.x0) * scale;
        break;

      default:
        // Fallback to no rotation
        left = bbox.x0 * scale;
        width = (bbox.x1 - bbox.x0) * scale;
        top = (pageHeight - bbox.y1) * scale;
        height = (bbox.y1 - bbox.y0) * scale;
    }

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.display = "block";
  }, [bbox, pageDimensions, scale, rotation, currentPage, highlightPage]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-2 border-b bg-background">
        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="size-8"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm min-w-[80px] text-center">
            {currentPage} / {numPages || "?"}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="size-8"
          >
            <ChevronRight className="size-4" />
          </Button>
          {highlightPage && currentPage !== highlightPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goToHighlightPage}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Go to ref (p.{highlightPage})
            </Button>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="size-8"
          >
            <ZoomOut className="size-4" />
          </Button>
          <div className="w-24">
            <Slider
              value={[scale]}
              min={0.5}
              max={3}
              step={0.1}
              onValueChange={handleZoomChange}
            />
          </div>
          <span className="text-xs text-muted-foreground min-w-[40px]">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={zoomIn}
            disabled={scale >= 3}
            className="size-8"
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={rotate}
            className="size-8"
          >
            <RotateCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/30 flex justify-center p-4"
      >
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Loading document...
              </span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertCircle className="size-8" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* PDF Document */}
        <Document
          file={file}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={null}
          error={null}
          className={cn(isLoading && "hidden")}
        >
          <div className="relative shadow-lg">
            <Page
              pageNumber={currentPage}
              scale={scale}
              rotate={rotation}
              onLoadSuccess={handlePageLoadSuccess}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              customTextRenderer={customTextRenderer}
              className="bg-white"
            />

            {/* Bounding Box Highlight Overlay */}
            {bbox && currentPage === highlightPage && (
              <div
                ref={highlightRef}
                className="absolute pointer-events-none bg-yellow-300/40 border-2 border-yellow-500 rounded-sm animate-pulse"
                style={{ display: "none" }}
                aria-hidden="true"
              />
            )}
          </div>
        </Document>
      </div>

      {/* Custom Styles for Text Highlighting */}
      <style jsx global>{`
        .pdf-highlight {
          background-color: rgba(234, 179, 8, 0.4);
          padding: 0 2px;
          border-radius: 2px;
        }
        .pdf-highlight-partial {
          background-color: rgba(234, 179, 8, 0.25);
          padding: 0 1px;
          border-radius: 1px;
        }
      `}</style>
    </div>
  );
}
