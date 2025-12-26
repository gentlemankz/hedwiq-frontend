// Server-side Supabase utilities
export {
  createServerSupabaseClient,
  getSignedUrl,
  uploadFile,
  downloadFile,
  deleteFiles,
  type DeleteFilesResult,
} from "./server";

// Client-side Supabase utilities
export { createBrowserSupabaseClient } from "./client";

// Storage bucket constants
export const STORAGE_BUCKETS = {
  /** Bucket for meeting documents (PDFs) */
  DOCUMENTS: "meeting-documents",
} as const;

// Storage path helpers
export const STORAGE_PATHS = {
  /**
   * Generate a storage path for a document.
   * Format: {roomId}/{documentId}.pdf
   */
  document: (roomId: string, documentId: string) =>
    `${roomId}/${documentId}.pdf`,
} as const;
