"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  UploadedDocument,
  DocumentUploadResponse,
} from "@/types/document";
import { DOCUMENT_LIMITS } from "@/types/document";

// ============================================================================
// Types
// ============================================================================

interface DocumentUploadProps {
  /** Room ID to upload documents for */
  roomId: string;
  /** Called when document is successfully uploaded */
  onUploadComplete?: (doc: UploadedDocument) => void;
  /** Called when upload fails */
  onUploadError?: (error: string) => void;
  /** Current list of uploaded documents */
  uploadedDocuments?: UploadedDocument[];
  /** Called when a document is removed */
  onRemoveDocument?: (docId: string) => void;
  /** Maximum documents allowed */
  maxDocuments?: number;
  /** Disable the upload functionality */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

interface UploadState {
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  file?: File;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate file before upload
 */
function validateFile(file: File): string | null {
  // Check file type
  if (!(DOCUMENT_LIMITS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Only PDF files are supported";
  }

  // Check file size
  const maxSizeBytes = DOCUMENT_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `File too large (max ${DOCUMENT_LIMITS.MAX_FILE_SIZE_MB}MB)`;
  }

  return null;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Document upload component for pre-join and in-meeting document uploads.
 *
 * Features:
 * - Drag and drop support
 * - File type validation (PDF only)
 * - File size validation
 * - Upload progress indication
 * - List of uploaded documents
 * - Document removal
 */
export function DocumentUpload({
  roomId,
  onUploadComplete,
  onUploadError,
  uploadedDocuments = [],
  onRemoveDocument,
  maxDocuments = DOCUMENT_LIMITS.MAX_DOCUMENTS_PER_ROOM,
  disabled = false,
  className,
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const canUpload = uploadedDocuments.length < maxDocuments && !disabled;

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!canUpload) return;

      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setUploadState({
          status: "error",
          progress: 0,
          error: validationError,
          file,
        });
        onUploadError?.(validationError);
        return;
      }

      // Start upload
      setUploadState({
        status: "uploading",
        progress: 10,
        file,
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomId", roomId);

      // Simulate progress (actual progress would need XHR)
      // Declare outside try so it can be cleared in finally
      const progressInterval = setInterval(() => {
        setUploadState((prev) => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90),
        }));
      }, 200);

      try {
        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }

        const result: DocumentUploadResponse = await response.json();

        // Success
        setUploadState({
          status: "success",
          progress: 100,
          file,
        });

        // Create document object for callback
        const doc: UploadedDocument = {
          id: result.documentId,
          filename: file.name,
          title: result.title,
          pageCount: result.pageCount,
          status: "ready",
          uploadedAt: Date.now(),
          uploadedBy: "current-user",
          roomId,
        };

        onUploadComplete?.(doc);

        // Reset after success
        setTimeout(() => {
          setUploadState({ status: "idle", progress: 0 });
        }, 2000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setUploadState({
          status: "error",
          progress: 0,
          error: errorMessage,
          file,
        });
        onUploadError?.(errorMessage);
      } finally {
        // Always clear the interval to prevent timer leak
        clearInterval(progressInterval);
      }
    },
    [canUpload, roomId, onUploadComplete, onUploadError]
  );

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      // Reset input
      event.target.value = "";
    },
    [handleFileSelect]
  );

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (!canUpload) return;

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [canUpload, handleFileSelect]
  );

  /**
   * Trigger file input click
   */
  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setUploadState({ status: "idle", progress: 0 });
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        className={cn(
          "relative rounded-lg border-2 border-dashed p-6 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          !canUpload && "opacity-50 cursor-not-allowed",
          uploadState.status === "uploading" && "pointer-events-none"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleInputChange}
          className="hidden"
          disabled={!canUpload}
        />

        {/* Upload Status */}
        {uploadState.status === "uploading" && (
          <div className="space-y-3 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Uploading {uploadState.file?.name}
              </p>
              <Progress value={uploadState.progress} className="h-2 w-full" />
              <p className="text-xs text-muted-foreground">
                Processing document...
              </p>
            </div>
          </div>
        )}

        {uploadState.status === "success" && (
          <div className="space-y-2 text-center">
            <CheckCircle2 className="mx-auto size-8 text-green-500" />
            <p className="text-sm font-medium text-green-600">
              {uploadState.file?.name} uploaded successfully!
            </p>
          </div>
        )}

        {uploadState.status === "error" && (
          <div className="space-y-3 text-center">
            <AlertCircle className="mx-auto size-8 text-destructive" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                {uploadState.error}
              </p>
              <Button variant="outline" size="sm" onClick={clearError}>
                Try Again
              </Button>
            </div>
          </div>
        )}

        {uploadState.status === "idle" && (
          <div className="space-y-3 text-center">
            <Upload className="mx-auto size-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragging
                  ? "Drop your PDF here"
                  : "Drag and drop a PDF file"}
              </p>
              <p className="text-xs text-muted-foreground">
                or click to browse (max {DOCUMENT_LIMITS.MAX_FILE_SIZE_MB}MB)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleButtonClick}
              disabled={!canUpload}
            >
              Select PDF
            </Button>
          </div>
        )}
      </div>

      {/* Document Limit Warning */}
      {uploadedDocuments.length >= maxDocuments && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Maximum {maxDocuments} documents per meeting. Remove a document to
            upload more.
          </AlertDescription>
        </Alert>
      )}

      {/* Uploaded Documents List */}
      {uploadedDocuments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Uploaded Documents ({uploadedDocuments.length}/{maxDocuments})
          </p>
          <div className="space-y-2">
            {uploadedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-md border bg-card p-3"
              >
                <FileText className="size-5 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.pageCount} page{doc.pageCount !== 1 ? "s" : ""}
                  </p>
                </div>
                {onRemoveDocument && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => onRemoveDocument(doc.id)}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Remove document</span>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
