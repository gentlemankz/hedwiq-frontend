"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  AlertCircle,
  Maximize,
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
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lastFittedWidthRef = useRef<number>(0);
  const userHasZoomedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // Auto-fit calculation helper (stable reference via ref for ResizeObserver)
  // ============================================================================

  const pageDimensionsRef = useRef<PageDimensions | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    pageDimensionsRef.current = pageDimensions;
  }, [pageDimensions]);

  const calculateFitToWidthScale = useCallback(
    (availableWidth: number, pageWidth: number) => {
      if (availableWidth > 0 && pageWidth > 0) {
        const padding = 40;
        const effectiveWidth = availableWidth - padding;
        const optimalScale = effectiveWidth / pageWidth;
        return Math.max(0.5, Math.min(2.0, optimalScale));
      }
      return 1.0;
    },
    []
  );

  // ============================================================================
  // Container Resize Observer with auto-fit on significant changes
  // ============================================================================

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        setContainerWidth(newWidth);

        // Re-fit when container width changes significantly (sidebar/fullscreen toggle)
        // Skip if user has manually zoomed to respect their preference
        // This runs in the ResizeObserver callback, which is an external system subscription
        if (
          !userHasZoomedRef.current &&
          lastFittedWidthRef.current > 0 &&
          pageDimensionsRef.current &&
          pageDimensionsRef.current.width > 0
        ) {
          const widthDelta = Math.abs(newWidth - lastFittedWidthRef.current);
          if (widthDelta > 50) {
            const optimalScale = calculateFitToWidthScale(
              newWidth,
              pageDimensionsRef.current.width
            );
            setScale(optimalScale);
            lastFittedWidthRef.current = newWidth;
          }
        }
      }
    });

    resizeObserver.observe(container);
    // Initial measurement
    setContainerWidth(container.clientWidth);

    return () => resizeObserver.disconnect();
  }, [calculateFitToWidthScale]);

  // ============================================================================
  // Document Load Handlers
  // ============================================================================

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      if (!isMountedRef.current) return;

      setNumPages(numPages);
      setIsLoading(false);
      setError(null);
      onDocumentLoad?.(numPages);
    },
    [onDocumentLoad]
  );

  const handleDocumentLoadError = useCallback((err: Error) => {
    // Suppress AbortException - this is expected when unmounting
    if (err?.name === "AbortException" || err?.message?.includes("cancelled")) {
      return;
    }

    if (!isMountedRef.current) return;

    console.error("PDF load error:", err);
    const errorMessage = "Failed to load PDF document";
    setError(errorMessage);
    setIsLoading(false);
    onError?.(errorMessage);
  }, [onError]);

  const handlePageLoadSuccess = useCallback(
    (page: { width: number; height: number }) => {
      if (!isMountedRef.current) return;

      setPageDimensions({
        width: page.width,
        height: page.height,
      });

      // Auto-fit to width on first page load
      if (lastFittedWidthRef.current === 0 && page.width > 0 && containerWidth > 0) {
        const optimalScale = calculateFitToWidthScale(containerWidth, page.width);
        setScale(optimalScale);
        lastFittedWidthRef.current = containerWidth;
      }
    },
    [calculateFitToWidthScale, containerWidth]
  );

  // Handle page render errors (including TextLayer abort)
  const handlePageRenderError = useCallback((error: Error) => {
    // Suppress AbortException - this is expected when unmounting or changing pages
    if (error?.name === "AbortException" || error?.message?.includes("TextLayer task cancelled")) {
      return;
    }
    console.error("Page render error:", error);
  }, []);

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
    userHasZoomedRef.current = true;
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
    userHasZoomedRef.current = true;
  }, []);

  const handleZoomChange = useCallback((values: number[]) => {
    setScale(values[0]);
    userHasZoomedRef.current = true;
  }, []);

  // ============================================================================
  // Rotation
  // ============================================================================

  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // ============================================================================
  // Fit to Width
  // ============================================================================

  const fitToWidth = useCallback(() => {
    if (containerWidth > 0 && pageDimensions && pageDimensions.width > 0) {
      const optimalScale = calculateFitToWidthScale(containerWidth, pageDimensions.width);
      setScale(optimalScale);
      lastFittedWidthRef.current = containerWidth;
      // Reset user zoom flag so auto-fit resumes on layout changes
      userHasZoomedRef.current = false;
    }
  }, [containerWidth, pageDimensions, calculateFitToWidthScale]);

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Don't trigger if user is interacting with form elements or editable content
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest('[role="textbox"]') ||
        target.closest('[role="listbox"]') ||
        target.closest('[role="combobox"]') ||
        target.closest('[role="slider"]') ||
        target.closest('[role="spinbutton"]') ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goToPrevPage();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNextPage();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          fitToWidth();
          break;
        case "r":
        case "R":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            rotate();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevPage, goToNextPage, zoomIn, zoomOut, fitToWidth, rotate]);

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
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex flex-col h-full", className)}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Page Navigation */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                  className="size-8"
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Previous page (←)</p>
              </TooltipContent>
            </Tooltip>

            <span
              className="text-sm min-w-[70px] text-center font-medium tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="sr-only">Page </span>
              {currentPage} / {numPages || "?"}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToNextPage}
                  disabled={currentPage >= numPages}
                  className="size-8"
                  aria-label="Go to next page"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Next page (→)</p>
              </TooltipContent>
            </Tooltip>

            {highlightPage && currentPage !== highlightPage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={goToHighlightPage}
                className="ml-2 text-xs h-7 px-2"
                aria-label={`Jump to referenced content on page ${highlightPage}`}
              >
                Jump to ref (p.{highlightPage})
              </Button>
            )}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Zoom and view controls">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={zoomOut}
                  disabled={scale <= 0.5}
                  className="size-8"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Zoom out (-)</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-32 px-1">
              <Slider
                value={[scale]}
                min={0.5}
                max={3}
                step={0.05}
                onValueChange={handleZoomChange}
                className="cursor-pointer"
                aria-label="Zoom level"
              />
            </div>

            <span
              className="text-xs text-muted-foreground min-w-[45px] text-center tabular-nums"
              aria-live="polite"
            >
              <span className="sr-only">Zoom level: </span>
              {Math.round(scale * 100)}%
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={zoomIn}
                  disabled={scale >= 3}
                  className="size-8"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Zoom in (+)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fitToWidth}
                  className="size-8"
                  aria-label="Fit document to container width"
                >
                  <Maximize className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Fit to width (0)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={rotate}
                  className="size-8"
                  aria-label="Rotate document 90 degrees"
                >
                  <RotateCw className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Rotate (R)</p>
              </TooltipContent>
            </Tooltip>
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
                key={`page-${currentPage}-${file}`}
                pageNumber={currentPage}
                scale={scale}
                rotate={rotation}
                onLoadSuccess={handlePageLoadSuccess}
                onRenderError={handlePageRenderError}
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
    </TooltipProvider>
  );
}
