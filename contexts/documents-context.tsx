"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRoomContext } from "@livekit/components-react";
import type {
  UploadedDocument,
  DocumentReference,
  DocumentUploadResponse,
} from "@/types/document";

/** LiveKit topic for document references from the Luframe agent */
const DOCUMENT_REFERENCE_TOPIC = "luframe.document_reference";

/** Maximum number of references to keep in memory */
const MAX_REFERENCES = 200;

/** Deduplication TTL in milliseconds (5 minutes) */
const DEDUPE_TTL_MS = 5 * 60 * 1000;

/**
 * Interface for the text stream reader from LiveKit
 */
interface TextStreamReader {
  info: {
    id: string;
    timestamp?: number;
    attributes?: Record<string, string>;
  };
  readAll: () => Promise<string>;
}

/**
 * Interface for participant info from LiveKit
 */
interface ParticipantInfo {
  identity: string;
}

/**
 * Context value for documents
 */
interface DocumentsContextValue {
  /** All uploaded documents for this room */
  documents: UploadedDocument[];
  /** All document references, sorted by timestamp (newest first) */
  references: DocumentReference[];
  /** Whether a document upload is in progress */
  isUploading: boolean;
  /** Whether documents are being hydrated from backend */
  isHydrating: boolean;
  /** Error from hydration attempt (null if successful or not attempted) */
  hydrationError: string | null;
  /** Current upload error message */
  uploadError: string | null;
  /** Upload a new document */
  uploadDocument: (file: File, roomId: string) => Promise<DocumentUploadResponse>;
  /** Remove a document */
  removeDocument: (docId: string, roomId: string) => Promise<void>;
  /** Get references related to a specific transcript segment */
  getReferencesForTranscript: (transcriptRef: string) => DocumentReference[];
  /** Get a document by ID */
  getDocument: (docId: string) => UploadedDocument | undefined;
  /** Check if a specific document is currently being fetched */
  isDocumentLoading: (docId: string) => boolean;
  /** Total count of references */
  referenceCount: number;
  /** Total count of documents */
  documentCount: number;
  /** Clear upload error */
  clearUploadError: () => void;
  /** Add a document to state (for pre-join uploads) */
  addDocument: (doc: UploadedDocument) => void;
  /** Manually trigger document hydration */
  hydrateDocuments: () => Promise<void>;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

/**
 * Provider component that manages documents state and LiveKit stream subscription.
 * Wrap your meeting components with this provider to share documents state.
 *
 * @example
 * ```tsx
 * <DocumentsProvider>
 *   <MeetingLayout />
 * </DocumentsProvider>
 * ```
 */
interface DocumentsProviderProps {
  children: React.ReactNode;
  /** Initial documents (e.g., from pre-join upload) */
  initialDocuments?: UploadedDocument[];
}

export function DocumentsProvider({ children, initialDocuments = [] }: DocumentsProviderProps) {
  const room = useRoomContext();
  const isMountedRef = useRef(true);
  const [documents, setDocuments] = useState<UploadedDocument[]>(initialDocuments);
  const [references, setReferences] = useState<DocumentReference[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const hasHydratedRef = useRef(false);

  // Track documents currently being fetched (reactive for UI)
  const [fetchingDocumentIds, setFetchingDocumentIds] = useState<Set<string>>(new Set());

  // Deduplication cache: Map<fingerprint, timestamp>
  const dedupeCache = useRef<Map<string, number>>(new Map());

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Check if a document is currently being fetched
   */
  const isDocumentLoading = useCallback(
    (docId: string): boolean => {
      return fetchingDocumentIds.has(docId);
    },
    [fetchingDocumentIds]
  );

  /**
   * Fetch a single document by ID and add to state
   */
  const fetchAndAddDocument = useCallback(
    async (docId: string, roomId: string): Promise<UploadedDocument | null> => {
      // Prevent duplicate fetches (check current state)
      if (fetchingDocumentIds.has(docId)) {
        return null;
      }

      // Mark as fetching
      setFetchingDocumentIds((prev) => new Set(prev).add(docId));

      try {
        const response = await fetch(
          `/api/documents/${docId}?roomId=${encodeURIComponent(roomId)}`
        );

        if (!response.ok) {
          console.warn(`[DocumentsContext] Failed to fetch document ${docId}:`, response.status);
          return null;
        }

        const data = await response.json();

        const doc: UploadedDocument = {
          id: data.id,
          filename: data.filename,
          title: data.title,
          pageCount: data.pageCount,
          status: data.status || "ready",
          uploadedAt: data.uploadedAt,
          uploadedBy: data.uploadedBy,
          roomId: data.roomId,
        };

        if (isMountedRef.current) {
          setDocuments((prev) => {
            if (prev.some((d) => d.id === doc.id)) {
              return prev;
            }
            return [...prev, doc];
          });
        }

        return doc;
      } catch (err) {
        console.error(`[DocumentsContext] Error fetching document ${docId}:`, err);
        return null;
      } finally {
        // Remove from fetching set
        if (isMountedRef.current) {
          setFetchingDocumentIds((prev) => {
            const next = new Set(prev);
            next.delete(docId);
            return next;
          });
        }
      }
    },
    [fetchingDocumentIds]
  );

  /**
   * Hydrate documents from backend for this room.
   * Can be called manually to retry after failure.
   */
  const hydrateDocuments = useCallback(async () => {
    const roomId = room?.name;
    if (!roomId || !isMountedRef.current) return;

    setIsHydrating(true);
    setHydrationError(null);

    try {
      const response = await fetch(
        `/api/documents?roomId=${encodeURIComponent(roomId)}`
      );

      if (!response.ok) {
        const errorMsg = `Failed to load documents (HTTP ${response.status})`;
        console.warn("[DocumentsContext]", errorMsg);
        if (isMountedRef.current) {
          setHydrationError(errorMsg);
        }
        return;
      }

      const data = await response.json();

      if (!isMountedRef.current) return;

      // Merge with existing documents (don't overwrite local state)
      setDocuments((prev) => {
        const existingIds = new Set(prev.map((d) => d.id));
        const newDocs: UploadedDocument[] = data.documents
          .filter((d: { id: string }) => !existingIds.has(d.id))
          .map((d: {
            id: string;
            filename: string;
            title: string;
            pageCount: number;
            status: string;
            uploadedAt: number;
            uploadedBy: string;
            roomId: string;
          }) => ({
            id: d.id,
            filename: d.filename,
            title: d.title,
            pageCount: d.pageCount,
            status: d.status || "ready",
            uploadedAt: d.uploadedAt,
            uploadedBy: d.uploadedBy,
            roomId: d.roomId,
          }));

        if (newDocs.length > 0) {
          console.log(`[DocumentsContext] Hydrated ${newDocs.length} documents from backend:`,
            newDocs.map(d => ({ id: d.id, title: d.title }))
          );
          return [...prev, ...newDocs];
        }
        console.log(`[DocumentsContext] Hydration complete, no new documents. Existing: ${prev.length}`);
        return prev;
      });

      // Clear any previous error on success
      if (isMountedRef.current) {
        setHydrationError(null);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Network error";
      console.error("[DocumentsContext] Error hydrating documents:", err);
      if (isMountedRef.current) {
        setHydrationError(errorMsg);
      }
    } finally {
      // Always mark as attempted to prevent infinite retry loops
      hasHydratedRef.current = true;
      if (isMountedRef.current) {
        setIsHydrating(false);
      }
    }
  }, [room?.name]);

  // Hydrate documents on mount when room is available
  useEffect(() => {
    if (room?.name && !hasHydratedRef.current) {
      hydrateDocuments();
    }
  }, [room?.name, hydrateDocuments]);

  /**
   * Clean old entries from deduplication cache
   */
  const cleanDedupeCache = useCallback(() => {
    const now = Date.now();
    dedupeCache.current.forEach((timestamp, key) => {
      if (now - timestamp > DEDUPE_TTL_MS) {
        dedupeCache.current.delete(key);
      }
    });
  }, []);

  /**
   * Check if a reference is a duplicate
   */
  const isDuplicate = useCallback(
    (fingerprint: string): boolean => {
      cleanDedupeCache();
      return dedupeCache.current.has(fingerprint);
    },
    [cleanDedupeCache]
  );

  /**
   * Add a fingerprint to the dedupe cache
   */
  const addToDedupeCache = useCallback((fingerprint: string) => {
    dedupeCache.current.set(fingerprint, Date.now());
  }, []);

  /**
   * Handle incoming document reference stream from the agent
   */
  const handleReferenceStream = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (reader: TextStreamReader, _participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        const data = JSON.parse(rawJson);
        const attrs = reader.info.attributes ?? {};

        // Create reference object from received data
        const reference: DocumentReference = {
          id: data.id || reader.info.id,
          documentId: data.document_id || attrs["document_id"],
          sectionId: data.section_id || attrs["section_id"],
          pageNumber: parseInt(
            attrs["page_number"] || String(data.page_number || 1)
          ),
          sectionTitle: data.section_title,
          matchedText: data.matched_text,
          bbox: data.bbox,
          context: data.context,
          confidence: parseFloat(
            attrs["confidence"] || String(data.confidence || 0.8)
          ),
          transcriptRef: data.transcript_ref,
          timestamp: data.timestamp || Date.now(),
        };

        // Validate required fields
        if (!reference.documentId || !reference.sectionId || !reference.context) {
          console.warn("[DocumentsContext] Received invalid document reference:", data);
          return;
        }

        console.log("[DocumentsContext] Received document reference:", {
          documentId: reference.documentId,
          pageNumber: reference.pageNumber,
          sectionTitle: reference.sectionTitle,
        });

        // Create deduplication fingerprint
        const fingerprint = `${reference.transcriptRef}:${reference.sectionId}`;

        // Check for duplicate
        if (isDuplicate(fingerprint)) {
          console.debug("Duplicate reference skipped:", fingerprint);
          return;
        }

        // Add to dedupe cache
        addToDedupeCache(fingerprint);

        setReferences((prev) => {
          // Also dedupe by ID
          if (prev.some((r) => r.id === reference.id)) {
            return prev;
          }

          // Add new reference at the beginning (newest first)
          const updated = [reference, ...prev];

          // Trim to max size
          return updated.slice(0, MAX_REFERENCES);
        });

        // Fetch document metadata if we don't have it yet
        const roomId = room?.name;
        if (roomId && reference.documentId) {
          // Check if document exists in current state
          setDocuments((currentDocs) => {
            const docExists = currentDocs.some((d) => d.id === reference.documentId);
            if (!docExists) {
              console.log(`[DocumentsContext] Document ${reference.documentId} not in local state, fetching...`);
              // Fetch document in background (don't await)
              fetchAndAddDocument(reference.documentId, roomId)
                .then((doc) => {
                  if (doc) {
                    console.log(`[DocumentsContext] Successfully fetched document: ${doc.id}`);
                  } else {
                    console.warn(`[DocumentsContext] Document ${reference.documentId} not found in backend`);
                  }
                })
                .catch((err) => {
                  console.warn(`[DocumentsContext] Failed to fetch document ${reference.documentId}:`, err);
                });
            }
            return currentDocs; // Don't modify state here
          });
        }
      } catch (err) {
        console.error("Failed to parse document reference:", err);
      }
    },
    [isDuplicate, addToDedupeCache, room?.name, fetchAndAddDocument]
  );

  // Register text stream handler
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(DOCUMENT_REFERENCE_TOPIC);
    } catch {
      // Handler wasn't registered yet, ignore
    }

    try {
      room.registerTextStreamHandler(DOCUMENT_REFERENCE_TOPIC, handleReferenceStream);
      console.log(`[DocumentsContext] Registered handler for topic: ${DOCUMENT_REFERENCE_TOPIC}`);
    } catch (err) {
      console.warn("[DocumentsContext] Failed to register document reference handler:", err);
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(DOCUMENT_REFERENCE_TOPIC);
      } catch {
        // Already unregistered, ignore
      }
    };
  }, [room, handleReferenceStream]);

  /**
   * Upload a new document
   */
  const uploadDocument = useCallback(
    async (file: File, roomId: string): Promise<DocumentUploadResponse> => {
      setIsUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("roomId", roomId);

        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        }

        const result: DocumentUploadResponse = await response.json();

        // Add to local state
        const newDocument: UploadedDocument = {
          id: result.documentId,
          filename: file.name,
          title: result.title,
          pageCount: result.pageCount,
          status: result.status || "ready",
          uploadedAt: Date.now(),
          uploadedBy: "current-user", // Will be set by backend
          roomId,
        };

        setDocuments((prev) => [...prev, newDocument]);

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Upload failed";
        setUploadError(errorMessage);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  /**
   * Add a document to state (for pre-join uploads)
   */
  const addDocument = useCallback((doc: UploadedDocument) => {
    setDocuments((prev) => {
      // Don't add if already exists
      if (prev.some((d) => d.id === doc.id)) {
        return prev;
      }
      return [...prev, doc];
    });
  }, []);

  /**
   * Remove a document
   */
  const removeDocument = useCallback(
    async (docId: string, roomId: string): Promise<void> => {
      try {
        const response = await fetch(
          `/api/documents/${docId}?roomId=${encodeURIComponent(roomId)}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Delete failed");
        }

        // Remove from local state
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        setReferences((prev) => prev.filter((r) => r.documentId !== docId));
      } catch (err) {
        console.error("Failed to delete document:", err);
        throw err;
      }
    },
    []
  );

  /**
   * Get references related to a specific transcript segment
   */
  const getReferencesForTranscript = useCallback(
    (transcriptRef: string): DocumentReference[] => {
      return references.filter((r) => r.transcriptRef === transcriptRef);
    },
    [references]
  );

  /**
   * Get a document by ID
   */
  const getDocument = useCallback(
    (docId: string): UploadedDocument | undefined => {
      return documents.find((d) => d.id === docId);
    },
    [documents]
  );

  /**
   * Clear upload error
   */
  const clearUploadError = useCallback(() => {
    setUploadError(null);
  }, []);

  const value = useMemo(
    () => ({
      documents,
      references,
      isUploading,
      isHydrating,
      hydrationError,
      uploadError,
      uploadDocument,
      addDocument,
      removeDocument,
      getReferencesForTranscript,
      getDocument,
      isDocumentLoading,
      referenceCount: references.length,
      documentCount: documents.length,
      clearUploadError,
      hydrateDocuments,
    }),
    [
      documents,
      references,
      isUploading,
      isHydrating,
      hydrationError,
      uploadError,
      uploadDocument,
      addDocument,
      removeDocument,
      getReferencesForTranscript,
      getDocument,
      isDocumentLoading,
      clearUploadError,
      hydrateDocuments,
    ]
  );

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
}

/**
 * Hook to access documents from context.
 * Must be used within a DocumentsProvider.
 *
 * @throws Error if used outside of DocumentsProvider
 */
export function useDocumentsContext(): DocumentsContextValue {
  const context = useContext(DocumentsContext);
  if (!context) {
    throw new Error(
      "useDocumentsContext must be used within a DocumentsProvider"
    );
  }
  return context;
}
