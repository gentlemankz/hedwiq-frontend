import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { deleteFiles, STORAGE_BUCKETS, STORAGE_PATHS } from "@/lib/supabase";
import { validateRoomAccess } from "@/lib/db/room-access";
import { eq, and } from "drizzle-orm";

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

    // Delete from Supabase Storage
    const storagePath = STORAGE_PATHS.document(roomId, documentId);
    const deleted = await deleteFiles(STORAGE_BUCKETS.DOCUMENTS, [storagePath]);

    if (!deleted) {
      console.error("Failed to delete file from storage");
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    await db
      .delete(document)
      .where(and(eq(document.id, documentId), eq(document.roomId, roomId)));

    return NextResponse.json({ success: true, documentId });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
