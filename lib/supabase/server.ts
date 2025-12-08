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
 * Delete a file from Supabase Storage.
 *
 * @param bucket - The storage bucket name
 * @param paths - Array of file paths to delete
 */
export async function deleteFiles(
  bucket: string,
  paths: string[]
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.storage
    .from(bucket)
    .remove(paths);

  if (error) {
    console.error("Error deleting files:", error);
    return false;
  }

  return true;
}
