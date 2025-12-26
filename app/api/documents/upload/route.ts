import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { uploadFile, STORAGE_BUCKETS, STORAGE_PATHS } from "@/lib/supabase";
import { validateRoomAccess } from "@/lib/db/room-access";
import { eq, and, count } from "drizzle-orm";
import { reportStorageChange } from "@/lib/polar/usage";

// Security constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = ["application/pdf"];
const MAX_FILENAME_LENGTH = 255;
const MAX_DOCUMENTS_PER_ROOM = 10;
const DANGEROUS_PATTERNS = [
  /\.\./, // Path traversal
  /[<>:"|?*]/, // Windows forbidden chars
  /[\x00-\x1f]/, // Control characters
];

/**
 * Sanitize filename to prevent path traversal and other attacks.
 */
function sanitizeFilename(filename: string): string {
  // Remove path components
  let safe = filename.split(/[/\\]/).pop() || "document";

  // Remove dangerous characters
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Ensure it ends with .pdf
  if (!safe.toLowerCase().endsWith(".pdf")) {
    safe += ".pdf";
  }

  // Limit length
  if (safe.length > MAX_FILENAME_LENGTH) {
    safe = safe.slice(0, MAX_FILENAME_LENGTH - 4) + ".pdf";
  }

  return safe;
}

/**
 * Validate that the file content appears to be a PDF.
 */
function isPdfContent(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 5));
  // PDF magic bytes: %PDF-
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/**
 * Check if filename contains dangerous patterns.
 */
function hasDangerousPattern(filename: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Generate a unique document ID
 */
function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract title from filename (removes extension and cleans up)
 */
function extractTitle(filename: string): string {
  // Remove .pdf extension
  let title = filename.replace(/\.pdf$/i, "");
  // Replace underscores and hyphens with spaces
  title = title.replace(/[_-]/g, " ");
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title || "Untitled Document";
}

export async function POST(request: NextRequest) {
  // 1. Verify authentication
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const roomId = formData.get("roomId") as string | null;

    // 2. Basic validation
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    // 3. Validate room ID format
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
      return NextResponse.json(
        { error: "Invalid room ID format" },
        { status: 400 }
      );
    }

    // 4. Validate room access (user must have accessed the room page first)
    // This prevents privilege escalation via arbitrary roomId in uploads
    const accessError = await validateRoomAccess(session.user.id, roomId);
    if (accessError) {
      return NextResponse.json(
        { error: accessError },
        { status: 403 }
      );
    }

    // 5. File type validation (MIME type)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // 6. File size validation
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // 6. Filename validation
    if (file.name.length > MAX_FILENAME_LENGTH) {
      return NextResponse.json({ error: "Filename too long" }, { status: 400 });
    }

    // 7. Check for dangerous patterns in filename
    if (hasDangerousPattern(file.name)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // 8. Check document limit for room
    const existingDocs = await db
      .select({ count: count() })
      .from(document)
      .where(eq(document.roomId, roomId));

    if (existingDocs[0]?.count >= MAX_DOCUMENTS_PER_ROOM) {
      return NextResponse.json(
        { error: `Maximum ${MAX_DOCUMENTS_PER_ROOM} documents per room` },
        { status: 400 }
      );
    }

    // 9. Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.name);

    // 10. Read file content and validate PDF magic bytes
    const fileBuffer = await file.arrayBuffer();
    if (!isPdfContent(fileBuffer)) {
      return NextResponse.json(
        { error: "File content is not a valid PDF" },
        { status: 400 }
      );
    }

    // 11. Generate document ID and storage path
    const documentId = generateDocumentId();
    const storagePath = STORAGE_PATHS.document(roomId, documentId);
    const title = extractTitle(sanitizedFilename);

    // 12. Upload to Supabase Storage
    const uploadResult = await uploadFile(
      STORAGE_BUCKETS.DOCUMENTS,
      storagePath,
      Buffer.from(fileBuffer),
      { contentType: "application/pdf", upsert: false }
    );

    if (!uploadResult) {
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    // 13. Create database record
    // Note: pageCount will be updated by the agent service after processing
    await db.insert(document).values({
      id: documentId,
      roomId,
      filename: sanitizedFilename,
      title,
      pageCount: 0, // Will be updated after processing
      fileSize: file.size,
      storagePath: `${STORAGE_BUCKETS.DOCUMENTS}/${storagePath}`,
      status: "ready", // Set to ready since file is uploaded
      uploadedBy: session.user.id,
    });

    // 13.5 Report storage usage to Polar for billing
    // IMPORTANT: Isolated with timeout to prevent usage API issues from failing the upload
    // The file is already stored and DB row created at this point, so we must succeed
    try {
      const usagePromise = reportStorageChange(session.user.id, file.size, {
        documentId,
        fileName: sanitizedFilename,
        action: "upload",
      });

      // 5 second timeout to prevent hanging on slow/unavailable usage API
      const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ success: false, error: "Usage reporting timeout" }), 5000)
      );

      const usageResult = await Promise.race([usagePromise, timeoutPromise]);

      if (!usageResult.success) {
        // Log error but don't fail upload - document is already stored
        console.error("[Document Upload] Failed to report storage usage:", usageResult.error);
      }
    } catch (usageError) {
      // Isolate usage reporting errors - upload succeeded, just log the billing failure
      console.error("[Document Upload] Usage reporting error (upload succeeded):", usageError);
    }

    // 14. Forward to agent service for processing (embeddings, etc.)
    // This is critical for document reference detection to work
    const agentServiceUrl = process.env.AGENT_SERVICE_URL;
    if (agentServiceUrl) {
      console.log(`[Document Upload] Notifying agent at ${agentServiceUrl}/documents/process`);

      try {
        const agentResponse = await fetch(`${agentServiceUrl}/documents/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
          },
          body: JSON.stringify({
            documentId,
            roomId,
            storagePath: `${STORAGE_BUCKETS.DOCUMENTS}/${storagePath}`,
            uploadedBy: session.user.id,
          }),
        });

        if (!agentResponse.ok) {
          const errorText = await agentResponse.text();
          console.error(
            `[Document Upload] Agent processing failed: ${agentResponse.status} - ${errorText}`
          );
          // Continue without failing - document is uploaded to Supabase
          // but document reference detection may not work
        } else {
          const agentResult = await agentResponse.json();
          console.log(
            `[Document Upload] Agent processed document successfully:`,
            agentResult
          );

          // Update response with segment count from agent
          return NextResponse.json({
            documentId,
            title,
            pageCount: agentResult.pageCount || 0,
            segmentCount: agentResult.segmentCount,
            status: "ready",
          });
        }
      } catch (err) {
        // Log error but don't fail the upload
        console.error(
          "[Document Upload] Failed to notify agent service:",
          err instanceof Error ? err.message : err
        );
        // Continue - document is in Supabase, but references won't work
      }
    } else {
      console.warn(
        "[Document Upload] AGENT_SERVICE_URL not configured - document reference detection will not work"
      );
    }

    return NextResponse.json({
      documentId,
      title,
      pageCount: 0, // Will be updated after processing
      status: "ready",
    });
  } catch (error) {
    console.error("Document upload error:", error);

    if (error instanceof Error) {
      // Don't expose internal error details
      if (error.message.includes("fetch")) {
        return NextResponse.json(
          { error: "Storage service unavailable" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// Reject other methods
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to upload documents." },
    { status: 405 }
  );
}
