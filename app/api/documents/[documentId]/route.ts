import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { deleteFiles, STORAGE_BUCKETS, STORAGE_PATHS } from "@/lib/supabase";
import { validateRoomAccess } from "@/lib/db/room-access";
import { eq, and } from "drizzle-orm";
import { reportStorageChange } from "@/lib/polar/usage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;

  // Get roomId from query params
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId query parameter is required" },
      { status: 400 }
    );
  }

  // Validate formats
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return NextResponse.json(
      { error: "Invalid room ID format" },
      { status: 400 }
    );
  }

  if (!/^doc-[a-zA-Z0-9_-]+$/.test(documentId)) {
    return NextResponse.json(
      { error: "Invalid document ID format" },
      { status: 400 }
    );
  }

  // Validate room access (user must have joined the room)
  const accessError = await validateRoomAccess(session.user.id, roomId);
  if (accessError) {
    return NextResponse.json(
      { error: accessError },
      { status: 403 }
    );
  }

  try {
    // Fetch document from database
    const [doc] = await db
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.roomId, roomId)))
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: doc.id,
      filename: doc.filename,
      title: doc.title,
      pageCount: doc.pageCount,
      fileSize: doc.fileSize,
      status: doc.status,
      uploadedAt: doc.createdAt.getTime(),
      uploadedBy: doc.uploadedBy,
      roomId: doc.roomId,
    });
  } catch (error) {
    console.error("Document info error:", error);
    return NextResponse.json(
      { error: "Failed to get document info" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;

  // Get roomId from query params
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId query parameter is required" },
      { status: 400 }
    );
  }

  // Validate formats
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return NextResponse.json(
      { error: "Invalid room ID format" },
      { status: 400 }
    );
  }

  if (!/^doc-[a-zA-Z0-9_-]+$/.test(documentId)) {
    return NextResponse.json(
      { error: "Invalid document ID format" },
      { status: 400 }
    );
  }

  // Validate room access (user must have joined the room)
  const accessError = await validateRoomAccess(session.user.id, roomId);
  if (accessError) {
    return NextResponse.json(
      { error: accessError },
      { status: 403 }
    );
  }

  try {
    // Fetch document from database to verify it exists
    const [doc] = await db
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.roomId, roomId)))
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Only allow document owner to delete
    if (doc.uploadedBy !== session.user.id) {
      return NextResponse.json(
        { error: "Only the document owner can delete this document" },
        { status: 403 }
      );
    }

    // 1. Attempt to delete from Supabase Storage
    const storagePath = STORAGE_PATHS.document(roomId, documentId);
    const storageResult = await deleteFiles(STORAGE_BUCKETS.DOCUMENTS, [storagePath]);

    // Log storage deletion result
    if (!storageResult.success) {
      // Storage delete failed with actual error (not "not found")
      // Log but proceed with DB cleanup to prevent stuck records
      console.error("[Document Delete] Storage delete failed:", storageResult.error);
      console.warn("[Document Delete] Proceeding with DB cleanup despite storage error");
    } else if (!storageResult.deleted) {
      // File was already gone (not found) - this is fine
      console.log("[Document Delete] File already removed from storage");
    }

    // 2. Delete from database (always proceed to prevent stuck records)
    await db
      .delete(document)
      .where(and(eq(document.id, documentId), eq(document.roomId, roomId)));

    // 3. Report negative storage change to Polar for billing
    // Decrement even if file was already gone (success without actual delete) to keep usage accurate
    if (storageResult.success && doc.fileSize && doc.fileSize > 0) {
      try {
        const usageResult = await reportStorageChange(session.user.id, -doc.fileSize, {
          documentId,
          fileName: doc.filename,
          action: "delete",
        });

        if (!usageResult.success) {
          // Log error but don't fail delete - file is already removed
          console.error("[Document Delete] Failed to report storage usage:", usageResult.error);
        }
      } catch (usageError) {
        // Isolate usage reporting errors - delete already succeeded
        console.error("[Document Delete] Usage reporting error (delete succeeded):", usageError);
      }
    }

    return NextResponse.json({ success: true, documentId });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
