/**
 * Document Types for Hedwiq Frontend
 *
 * These types match the backend schema and are used for document
 * reference feature in meeting transcriptions.
 *
 * Key Features:
 * - BoundingBox support for precise PDF highlighting
 * - Room-scoped document management
 * - Deduplication support for references
 */

/**
 * Status of document processing.
 */
export type DocumentStatus = "processing" | "ready" | "error";

/**
 * PDF coordinates for highlighting a region on a page.
 *
 * Coordinates are in PDF units (points), with origin at TOP-LEFT.
 * This matches PyMuPDF's coordinate system used by the backend.
 *
 * Coordinate System:
 * - Origin: top-left corner of the page
 * - X axis: increases left to right
 * - Y axis: increases top to bottom
 * - (x0, y0): top-left corner of the bounding box
 * - (x1, y1): bottom-right corner of the bounding box
 */
export interface BoundingBox {
  /** Left edge X coordinate (from left of page) */
  x0: number;
  /** Top edge Y coordinate (from top of page) */
  y0: number;
  /** Right edge X coordinate (from left of page) */
  x1: number;
  /** Bottom edge Y coordinate (from top of page) */
  y1: number;
}

/**
 * Metadata for an uploaded document.
 *
 * Documents are scoped to rooms and cleaned up after TTL expires.
 */
export interface UploadedDocument {
  /** Unique document identifier */
  id: string;
  /** Original filename */
  filename: string;
  /** Document title (extracted from PDF or filename) */
  title: string;
  /** Number of pages in the document */
  pageCount: number;
  /** Processing status */
  status: DocumentStatus;
  /** Unix timestamp when uploaded (milliseconds) */
  uploadedAt: number;
  /** User ID who uploaded the document */
  uploadedBy: string;
  /** LiveKit room ID for scoping */
  roomId: string;
}

/**
 * A reference from speech to document content.
 *
 * Created when the system detects that a speaker is referencing
 * content from an uploaded document.
 */
export interface DocumentReference {
  /** Unique reference identifier */
  id: string;
  /** ID of the referenced document */
  documentId: string;
  /** Section ID for deduplication */
  sectionId: string;
  /** Page number in the document (1-indexed) */
  pageNumber: number;
  /** Title of the section if available */
  sectionTitle?: string;
  /** Evidence span from the document (10-50 chars) */
  matchedText: string;
  /** Bounding box for coordinate-based highlighting */
  bbox?: BoundingBox;
  /** Brief explanation of why this is a match */
  context: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Reference to the transcript segment ID */
  transcriptRef: string;
  /** Unix timestamp when detected (milliseconds) */
  timestamp: number;
}

/**
 * A searchable segment of a document.
 *
 * Documents are split into segments for efficient retrieval.
 */
export interface DocumentSegment {
  /** Unique segment identifier */
  id: string;
  /** ID of the parent document */
  documentId: string;
  /** Page number where segment appears */
  pageNumber: number;
  /** Section title if detected */
  sectionTitle?: string;
  /** Segment text content */
  content: string;
  /** Bounding box for highlighting */
  bbox?: BoundingBox;
}

/**
 * Response from document upload API.
 */
export interface DocumentUploadResponse {
  documentId: string;
  title: string;
  pageCount: number;
  segmentCount?: number;
  status: DocumentStatus;
}

/**
 * Response from list documents API.
 */
export interface DocumentListResponse {
  documents: Array<{
    id: string;
    filename: string;
    title: string;
    pageCount: number;
    uploadedAt: number;
  }>;
  count: number;
  maxAllowed: number;
}

/**
 * Storage limits (must match backend).
 */
export const DOCUMENT_LIMITS = {
  MAX_DOCUMENTS_PER_ROOM: 10,
  MAX_FILE_SIZE_MB: 50,
  ALLOWED_MIME_TYPES: ["application/pdf"],
} as const;

/**
 * Document type display configuration.
 */
export const DOCUMENT_CONFIG = {
  pdf: {
    icon: "FileText",
    label: "PDF Document",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/50",
  },
} as const;
