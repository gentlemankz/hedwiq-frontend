import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client for server-side operations.
 * Uses the service role key for admin operations like storage uploads.
 *
 * Note: This is NOT using @supabase/ssr because we're using Better Auth
 * for authentication. This client is specifically for Storage operations.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get a signed URL for downloading a file from Supabase Storage.
 * This is useful for private buckets where direct URLs don't work.
 *
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Upload a file to Supabase Storage.
 *
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param file - The file to upload (Buffer or Blob)
 * @param options - Upload options
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: Buffer | Blob,
  options?: {
    contentType?: string;
    upsert?: boolean;
  }
): Promise<{ path: string } | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: options?.contentType || "application/pdf",
      upsert: options?.upsert || false,
    });

  if (error) {
    console.error("Error uploading file:", error);
    return null;
  }

  return { path: data.path };
}

/**
 * Download a file from Supabase Storage.
 *
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 */
export async function downloadFile(
  bucket: string,
  path: string
): Promise<Blob | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error) {
    console.error("Error downloading file:", error);
    return null;
  }

  return data;
}

/**
 * Result of a file deletion operation
 */
export interface DeleteFilesResult {
  /** Whether the operation succeeded (file deleted or already gone) */
  success: boolean;
  /** Whether the file was actually deleted (false if already gone) */
  deleted: boolean;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Delete a file from Supabase Storage.
 * Treats "not found" as success since the goal is to ensure the file doesn't exist.
 *
 * @param bucket - The storage bucket name
 * @param paths - Array of file paths to delete
 * @returns Detailed result including whether file was actually deleted
 */
export async function deleteFiles(
  bucket: string,
  paths: string[]
): Promise<DeleteFilesResult> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .remove(paths);

  if (error) {
    // Check for "not found" errors - treat as success (file already gone)
    const errorMessage = error.message?.toLowerCase() || "";
    const isNotFound =
      errorMessage.includes("not found") ||
      errorMessage.includes("object not found") ||
      errorMessage.includes("does not exist") ||
      error.message?.includes("404");

    if (isNotFound) {
      console.log("[Storage] File already deleted or not found:", paths);
      return { success: true, deleted: false };
    }

    console.error("Error deleting files:", error);
    return { success: false, deleted: false, error: error.message };
  }

  // Supabase returns empty array if files didn't exist
  const actuallyDeleted = data && data.length > 0;

  return { success: true, deleted: actuallyDeleted };
}
