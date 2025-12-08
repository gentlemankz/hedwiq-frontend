import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { downloadFile, STORAGE_BUCKETS, STORAGE_PATHS } from "@/lib/supabase";
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

  // Get roomId from query params for access control
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId query parameter is required" },
      { status: 400 }
    );
  }

  // Validate roomId format
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return NextResponse.json(
      { error: "Invalid room ID format" },
      { status: 400 }
    );
  }

  // Validate documentId format
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
    // Fetch document metadata from database
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

    // Check if document is ready
    if (doc.status === "error") {
      return NextResponse.json(
        { error: "Document processing failed" },
        { status: 400 }
      );
    }

    // Get storage path
    const storagePath = STORAGE_PATHS.document(roomId, documentId);

    // Download file from Supabase Storage
    const fileBlob = await downloadFile(STORAGE_BUCKETS.DOCUMENTS, storagePath);

    if (!fileBlob) {
      return NextResponse.json(
        { error: "Failed to retrieve document from storage" },
        { status: 500 }
      );
    }

    // Convert blob to array buffer
    const pdfBuffer = await fileBlob.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Document retrieval error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve document" },
      { status: 500 }
    );
  }
}
