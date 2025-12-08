import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { validateRoomAccess } from "@/lib/db/room-access";
import { eq } from "drizzle-orm";

/**
 * GET /api/documents?roomId=xxx
 *
 * List all documents for a room.
 * Used to hydrate document metadata for participants who didn't upload.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get roomId from query params
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

  // Validate room access (user must have joined the room)
  const accessError = await validateRoomAccess(session.user.id, roomId);
  if (accessError) {
    return NextResponse.json(
      { error: accessError },
      { status: 403 }
    );
  }

  try {
    // Fetch all documents for the room
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.roomId, roomId))
      .orderBy(document.createdAt);

    // Map to frontend format
    const documents = docs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      title: doc.title,
      pageCount: doc.pageCount,
      fileSize: doc.fileSize,
      status: doc.status,
      uploadedAt: doc.createdAt.getTime(),
      uploadedBy: doc.uploadedBy,
      roomId: doc.roomId,
    }));

    return NextResponse.json({
      documents,
      count: documents.length,
    });
  } catch (error) {
    console.error("Document list error:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    );
  }
}
