import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { meeting } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { isFolderOwner } from "@/lib/db/folder";

/**
 * POST /api/meetings/bulk-move
 *
 * Move multiple meetings to a folder in a single operation.
 *
 * Body:
 * - meetingIds: string[] (required, max 50)
 * - folderId: string (required, target folder ID)
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    meetingIds?: string[];
    folderId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate meetingIds
  if (!body.meetingIds || !Array.isArray(body.meetingIds)) {
    return NextResponse.json(
      { error: "meetingIds must be an array" },
      { status: 400 }
    );
  }

  if (body.meetingIds.length === 0) {
    return NextResponse.json(
      { error: "meetingIds cannot be empty" },
      { status: 400 }
    );
  }

  if (body.meetingIds.length > 50) {
    return NextResponse.json(
      { error: "Cannot move more than 50 meetings at once" },
      { status: 400 }
    );
  }

  // Validate all IDs are strings
  if (!body.meetingIds.every((id) => typeof id === "string" && id.length > 0)) {
    return NextResponse.json(
      { error: "All meeting IDs must be non-empty strings" },
      { status: 400 }
    );
  }

  // Validate folderId
  if (!body.folderId || typeof body.folderId !== "string") {
    return NextResponse.json(
      { error: "folderId is required" },
      { status: 400 }
    );
  }

  // Verify folder ownership
  const ownsFolder = await isFolderOwner(body.folderId, session.user.id);
  if (!ownsFolder) {
    return NextResponse.json(
      { error: "Invalid folder ID" },
      { status: 400 }
    );
  }

  try {
    // Update all meetings in a single query
    // Only update meetings where the user is the host
    const result = await db
      .update(meeting)
      .set({
        folderId: body.folderId,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(meeting.id, body.meetingIds),
          eq(meeting.hostId, session.user.id)
        )
      )
      .returning({ id: meeting.id });

    const movedCount = result.length;
    const requestedCount = body.meetingIds.length;

    // Check if all meetings were moved
    if (movedCount === 0) {
      return NextResponse.json(
        { error: "No meetings found or not authorized to move" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      movedCount,
      requestedCount,
      movedIds: result.map((r) => r.id),
    });
  } catch (error) {
    console.error("Bulk move error:", error);
    return NextResponse.json(
      { error: "Failed to move meetings" },
      { status: 500 }
    );
  }
}
