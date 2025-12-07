import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// Security constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = ["application/pdf"];
const MAX_FILENAME_LENGTH = 255;
const DANGEROUS_PATTERNS = [
  /\.\./,           // Path traversal
  /[<>:"|?*]/,      // Windows forbidden chars
  /[\x00-\x1f]/,    // Control characters
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
    bytes[4] === 0x2d    // -
  );
}

/**
 * Check if filename contains dangerous patterns.
 */
function hasDangerousPattern(filename: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(filename));
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
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
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

    // 4. File type validation (MIME type)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // 5. File size validation
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // 6. Filename validation
    if (file.name.length > MAX_FILENAME_LENGTH) {
      return NextResponse.json(
        { error: "Filename too long" },
        { status: 400 }
      );
    }

    // 7. Check for dangerous patterns in filename
    if (hasDangerousPattern(file.name)) {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 }
      );
    }

    // 8. Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.name);

    // 9. Read file content and validate PDF magic bytes
    const fileBuffer = await file.arrayBuffer();
    if (!isPdfContent(fileBuffer)) {
      return NextResponse.json(
        { error: "File content is not a valid PDF" },
        { status: 400 }
      );
    }

    // 10. Forward to agent service for processing
    const agentServiceUrl = process.env.AGENT_SERVICE_URL;

    if (!agentServiceUrl) {
      // If no agent service configured, return error
      // In production, the agent service should always be available
      console.error("AGENT_SERVICE_URL not configured");
      return NextResponse.json(
        { error: "Document processing service not available" },
        { status: 503 }
      );
    }

    // Create form data for agent service
    const agentFormData = new FormData();
    agentFormData.append(
      "file",
      new Blob([fileBuffer], { type: "application/pdf" }),
      sanitizedFilename
    );
    agentFormData.append("roomId", roomId);
    agentFormData.append("uploadedBy", session.user.id);

    // Forward to agent service
    const agentResponse = await fetch(
      `${agentServiceUrl}/documents/upload`,
      {
        method: "POST",
        body: agentFormData,
        headers: {
          // Internal service authentication
          "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
        },
      }
    );

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error("Agent processing failed:", errorText);

      // Parse error if possible
      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json(
          { error: errorJson.error || "Document processing failed" },
          { status: agentResponse.status }
        );
      } catch {
        return NextResponse.json(
          { error: "Document processing failed" },
          { status: 500 }
        );
      }
    }

    const result = await agentResponse.json();

    return NextResponse.json({
      documentId: result.documentId,
      title: result.title,
      pageCount: result.pageCount,
    });
  } catch (error) {
    console.error("Document upload error:", error);

    if (error instanceof Error) {
      // Don't expose internal error details
      if (error.message.includes("fetch")) {
        return NextResponse.json(
          { error: "Document processing service unavailable" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}

// Reject other methods
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to upload documents." },
    { status: 405 }
  );
}
