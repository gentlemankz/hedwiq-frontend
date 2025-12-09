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
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  AlertCircle,
  Maximize,
  ChevronsUp,
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
// Constants
// ============================================================================

/** Debounce delay for zoom slider (ms) */
const ZOOM_DEBOUNCE_MS = 50;

/** Default scale (100%) */
const DEFAULT_SCALE = 1.0;

/** Minimum scale allowed */
const MIN_SCALE = 0.5;

/** Maximum scale allowed */
const MAX_SCALE = 3.0;

// ============================================================================
// Types
// ============================================================================

interface PdfViewerProps {
  /** URL or File object for the PDF */
  file: string | File;
  /** Initial page number to scroll to */
  initialPage?: number;
  /** Bounding box for coordinate-based highlighting (top-left origin) */
  bbox?: BoundingBox;
  /** Text to highlight (fallback if no bbox) */
  highlightText?: string;
  /** Page number where the highlight should appear */
  highlightPage?: number;
  /** Callback when visible page changes (scroll-based) */
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
// Utilities
// ============================================================================

/**
 * Simple debounce function for zoom slider
 */
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Check if an error is a render cancellation error (expected during zoom/navigation)
 */
function isRenderCancellationError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const name = error.name || "";
  const message = error.message || "";
  return (
    name === "AbortException" ||
    name === "RenderingCancelledException" ||
    message.includes("TextLayer task cancelled") ||
    message.includes("rendering cancelled") ||
    message.includes("Rendering cancelled")
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * PDF Viewer component using react-pdf with support for:
 * - Scrollable multi-page view
 * - Bounding box highlighting
 * - Fuzzy text highlighting (fallback)
 * - Scroll-to-page navigation
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
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Per-page dimensions map - tracks dimensions for each page independently
  // This fixes the bug where page 1 dimensions were used for all pages
  const [pageDimensionsMap, setPageDimensionsMap] = useState<Map<number, PageDimensions>>(
    new Map()
  );

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastFittedWidthRef = useRef<number>(0);
  const userHasZoomedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const isScrollingToPageRef = useRef<boolean>(false);

  // First page dimensions for initial fit calculation (before all pages load)
  const firstPageDimensionsRef = useRef<PageDimensions | null>(null);

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

  /**
   * Calculate the scale needed to fit the PDF width to container.
   * Clamped to MAX 1.0 by default so we don't zoom in past 100% on initial load.
   * The "Fit to Width" button can override this for explicit user action.
   */
  const calculateFitToWidthScale = useCallback(
    (availableWidth: number, pageWidth: number, allowScaleUp = false) => {
      if (availableWidth > 0 && pageWidth > 0) {
        const padding = 48; // Account for page gaps
        const effectiveWidth = availableWidth - padding;
        const fitScale = effectiveWidth / pageWidth;

        // Clamp: min 0.5, max 1.0 for initial load (don't zoom past 100%)
        // If allowScaleUp is true (explicit user action), allow up to MAX_SCALE
        const maxScale = allowScaleUp ? MAX_SCALE : DEFAULT_SCALE;
        return Math.max(MIN_SCALE, Math.min(maxScale, fitScale));
      }
      return DEFAULT_SCALE;
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
        if (
          !userHasZoomedRef.current &&
          lastFittedWidthRef.current > 0 &&
          firstPageDimensionsRef.current &&
          firstPageDimensionsRef.current.width > 0
        ) {
          const widthDelta = Math.abs(newWidth - lastFittedWidthRef.current);
          if (widthDelta > 50) {
            // Don't scale up past 100% on auto-fit (allowScaleUp = false)
            const optimalScale = calculateFitToWidthScale(
              newWidth,
              firstPageDimensionsRef.current.width,
              false
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
    // Suppress render cancellation errors - expected when unmounting or changing scale
    if (isRenderCancellationError(err)) {
      return;
    }

    if (!isMountedRef.current) return;

    console.error("PDF load error:", err);
    const errorMessage = "Failed to load PDF document";
    setError(errorMessage);
    setIsLoading(false);
    onError?.(errorMessage);
  }, [onError]);

  /**
   * Handle page load success - stores per-page dimensions.
   * First page also triggers initial fit calculation.
   */
  const handlePageLoadSuccess = useCallback(
    (pageNum: number, page: { width: number; height: number }) => {
      if (!isMountedRef.current) return;

      // Store dimensions for this specific page
      setPageDimensionsMap((prev) => {
        const updated = new Map(prev);
        updated.set(pageNum, { width: page.width, height: page.height });
        return updated;
      });

      // For first page, also store in ref for resize observer and calculate initial fit
      if (pageNum === 1) {
        firstPageDimensionsRef.current = {
          width: page.width,
          height: page.height,
        };

        // Auto-fit to width on first page load (clamped to max 100%)
        if (lastFittedWidthRef.current === 0 && page.width > 0 && containerWidth > 0) {
          const optimalScale = calculateFitToWidthScale(containerWidth, page.width, false);
          setScale(optimalScale);
          lastFittedWidthRef.current = containerWidth;
        }
      }
    },
    [calculateFitToWidthScale, containerWidth]
  );

  /**
   * Handle page render errors (including TextLayer abort and RenderingCancelledException).
   * These are expected during zoom changes and should be suppressed.
   */
  const handlePageRenderError = useCallback((error: Error) => {
    // Suppress all render cancellation errors - expected during zoom/navigation
    if (isRenderCancellationError(error)) {
      return;
    }
    console.error("Page render error:", error);
  }, []);

  // ============================================================================
  // Scroll-based Page Tracking
  // ============================================================================

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || numPages === 0) return;

    const handleScroll = () => {
      // Skip tracking if we're programmatically scrolling to a page
      if (isScrollingToPageRef.current) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      let closestPage = 1;
      let closestDistance = Infinity;

      pageRefs.current.forEach((pageEl, pageNum) => {
        const pageRect = pageEl.getBoundingClientRect();
        const pageCenter = pageRect.top + pageRect.height / 2;
        const distance = Math.abs(pageCenter - containerCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = pageNum;
        }
      });

      if (closestPage !== currentPage) {
        setCurrentPage(closestPage);
        onPageChange?.(closestPage);
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [numPages, currentPage, onPageChange]);

  // ============================================================================
  // Scroll to Page
  // ============================================================================

  const scrollToPage = useCallback((pageNum: number) => {
    const pageEl = pageRefs.current.get(pageNum);
    if (pageEl && scrollContainerRef.current) {
      isScrollingToPageRef.current = true;
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(pageNum);

      // Reset the flag after scroll animation completes
      setTimeout(() => {
        isScrollingToPageRef.current = false;
      }, 500);
    }
  }, []);

  // Scroll to initial page or highlight page on mount
  useEffect(() => {
    if (numPages > 0 && !isLoading) {
      const targetPage = highlightPage || initialPage;
      if (targetPage > 1) {
        // Small delay to ensure pages are rendered
        setTimeout(() => scrollToPage(targetPage), 100);
      }
    }
  }, [numPages, isLoading, highlightPage, initialPage, scrollToPage]);

  // ============================================================================
  // Zoom
  // ============================================================================

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, MAX_SCALE));
    userHasZoomedRef.current = true;
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, MIN_SCALE));
    userHasZoomedRef.current = true;
  }, []);

  /**
   * Debounced scale setter to prevent rapid re-renders during slider drag.
   * This fixes the "TextLayer task cancelled" warnings during zoom.
   */
  const debouncedSetScale = useMemo(
    () => debounce((value: number) => setScale(value), ZOOM_DEBOUNCE_MS),
    []
  );

  const handleZoomChange = useCallback(
    (values: number[]) => {
      // Mark user has zoomed immediately (not debounced) to prevent auto-fit
      userHasZoomedRef.current = true;
      // Debounce the actual scale change to reduce re-renders
      debouncedSetScale(values[0]);
    },
    [debouncedSetScale]
  );

  // ============================================================================
  // Rotation
  // ============================================================================

  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // ============================================================================
  // Fit to Width
  // ============================================================================

  /**
   * Fit document to container width.
   * Unlike auto-fit on load, this explicit user action can scale UP past 100%.
   */
  const fitToWidth = useCallback(() => {
    const firstPageDims = firstPageDimensionsRef.current;
    if (containerWidth > 0 && firstPageDims && firstPageDims.width > 0) {
      // User explicitly clicked "Fit to Width" - allow scaling up (allowScaleUp = true)
      const optimalScale = calculateFitToWidthScale(containerWidth, firstPageDims.width, true);
      setScale(optimalScale);
      lastFittedWidthRef.current = containerWidth;
      // Reset user zoom flag so auto-fit resumes on layout changes
      userHasZoomedRef.current = false;
    }
  }, [containerWidth, calculateFitToWidthScale]);

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
        case "Home":
          e.preventDefault();
          scrollToPage(1);
          break;
        case "End":
          e.preventDefault();
          scrollToPage(numPages);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, fitToWidth, rotate, scrollToPage, numPages]);

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
   * Create custom text renderer for a specific page.
   * Only active when there's highlightText but no bbox.
   *
   * Uses multiple matching strategies since PDF text chunks are small:
   * 1. Exact substring match (chunk in highlight or highlight in chunk)
   * 2. Significant word matches (4+ char words)
   * 3. Bigram matching for multi-word phrases
   */
  const createTextRenderer = useCallback((pageNum: number) => {
    // Only use text highlighting when there's no bbox and we have text to highlight
    if (bbox || !highlightText || pageNum !== highlightPage) {
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
  }, [bbox, highlightText, highlightPage, normalizeText]);

  // ============================================================================
  // Bbox Highlighting (rotation-aware, per-page dimensions)
  // ============================================================================

  /**
   * Calculate bbox overlay styles for a specific page.
   *
   * IMPORTANT: PyMuPDF (backend) uses TOP-LEFT origin coordinates.
   * This means y0 is the TOP edge and y1 is the BOTTOM edge.
   *
   * We use PIXEL positioning with scale applied to ensure exact match
   * with the rendered Page component dimensions.
   *
   * Coordinates from backend (PyMuPDF):
   * - Origin: top-left corner of page
   * - x0, y0: top-left corner of bbox
   * - x1, y1: bottom-right corner of bbox
   * - Units: PDF points (72 DPI)
   */
  const calculateBboxStyle = useCallback(
    (pageNum: number): React.CSSProperties | null => {
      if (!bbox || pageNum !== highlightPage) {
        return null;
      }

      // Get dimensions for this specific page (not page 1!)
      const pageDims = pageDimensionsMap.get(pageNum);
      if (!pageDims || pageDims.width === 0 || pageDims.height === 0) {
        return null;
      }

      const pageWidth = pageDims.width;
      const pageHeight = pageDims.height;

      // Calculate pixel positions with scale applied
      // PyMuPDF uses top-left origin, so NO Y-inversion needed
      let left: number, top: number, width: number, height: number;

      // Transform coordinates based on rotation
      switch (rotation) {
        case 0:
          // No rotation: direct mapping (top-left origin)
          left = bbox.x0 * scale;
          top = bbox.y0 * scale;
          width = (bbox.x1 - bbox.x0) * scale;
          height = (bbox.y1 - bbox.y0) * scale;
          break;

        case 90:
          // 90° clockwise: x becomes y, y becomes (width - x)
          left = bbox.y0 * scale;
          top = (pageWidth - bbox.x1) * scale;
          width = (bbox.y1 - bbox.y0) * scale;
          height = (bbox.x1 - bbox.x0) * scale;
          break;

        case 180:
          // 180°: flip both axes
          left = (pageWidth - bbox.x1) * scale;
          top = (pageHeight - bbox.y1) * scale;
          width = (bbox.x1 - bbox.x0) * scale;
          height = (bbox.y1 - bbox.y0) * scale;
          break;

        case 270:
          // 270° clockwise (90° counter-clockwise)
          left = (pageHeight - bbox.y1) * scale;
          top = bbox.x0 * scale;
          width = (bbox.y1 - bbox.y0) * scale;
          height = (bbox.x1 - bbox.x0) * scale;
          break;

        default:
          left = bbox.x0 * scale;
          top = bbox.y0 * scale;
          width = (bbox.x1 - bbox.x0) * scale;
          height = (bbox.y1 - bbox.y0) * scale;
      }

      // Use pixel positioning - matches react-pdf's scaled rendering exactly
      return {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      };
    },
    [bbox, pageDimensionsMap, scale, rotation, highlightPage]
  );

  // ============================================================================
  // Page array for rendering
  // ============================================================================

  const pageNumbers = useMemo(() => {
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <TooltipProvider delayDuration={300}>
      <div ref={containerRef} className={cn("flex flex-col h-full", className)}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Page Indicator & Jump to Reference */}
          <div className="flex items-center gap-2">
            <span
              className="text-sm min-w-[70px] font-medium tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="sr-only">Page </span>
              {currentPage} / {numPages || "?"}
            </span>

            {highlightPage && currentPage !== highlightPage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => scrollToPage(highlightPage)}
                className="text-xs h-7 px-2"
                aria-label={`Jump to referenced content on page ${highlightPage}`}
              >
                <ChevronsUp className="size-3 mr-1" />
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
                  disabled={scale <= MIN_SCALE}
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
                min={MIN_SCALE}
                max={MAX_SCALE}
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
                  disabled={scale >= MAX_SCALE}
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

        {/* PDF Content - Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-muted/30"
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

          {/* PDF Document - All Pages */}
          <Document
            file={file}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={null}
            error={null}
            className={cn("flex flex-col items-center py-4 gap-4", isLoading && "hidden")}
          >
            {pageNumbers.map((pageNum) => {
              const bboxStyle = calculateBboxStyle(pageNum);
              return (
                <div
                  key={`page-wrapper-${pageNum}`}
                  ref={(el) => {
                    if (el) {
                      pageRefs.current.set(pageNum, el);
                    } else {
                      pageRefs.current.delete(pageNum);
                    }
                  }}
                  className="relative shadow-lg"
                  data-page={pageNum}
                >
                  <Page
                    pageNumber={pageNum}
                    scale={scale}
                    rotate={rotation}
                    onLoadSuccess={(page) => handlePageLoadSuccess(pageNum, page)}
                    onRenderError={handlePageRenderError}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    customTextRenderer={createTextRenderer(pageNum)}
                    className="bg-white"
                  />

                  {/* Bounding Box Highlight Overlay for this page */}
                  {bboxStyle && (
                    <div
                      className="absolute pointer-events-none rounded-[2px]"
                      style={{
                        ...bboxStyle,
                        background: "linear-gradient(to bottom, rgba(255, 235, 120, 0.45), rgba(255, 220, 100, 0.35))",
                        boxShadow: "0 0 0 1px rgba(255, 200, 50, 0.2)",
                      }}
                      aria-hidden="true"
                    />
                  )}

                  {/* Page number indicator */}
                  <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded">
                    {pageNum}
                  </div>
                </div>
              );
            })}
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
