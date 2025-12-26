import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserMeetingHistory } from "@/lib/db/meeting-data";
import { parseFolderIdParam } from "@/lib/validation/folder";
import {
  checkFeatureAccess,
  featureAccessDeniedResponse,
} from "@/lib/polar/server-feature-gates";

/**
 * GET /api/meetings/history
 *
 * Get the current user's past meetings with basic stats.
 * Only returns ended meetings where the user participated.
 *
 * Query params:
 * - limit: number (default 20, max 50)
 * - offset: number (default 0)
 * - folderId: string (optional, filter by folder; "null" for unassigned)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extended history is gated to paid tiers
  const featureCheck = await checkFeatureAccess(session.user.id, "extended_history");
  if (!featureCheck.allowed) {
    return featureAccessDeniedResponse("extended_history", featureCheck);
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const folderIdParam = searchParams.get("folderId");

  // Validate and sanitize pagination params
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 50);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  // Parse folderId (can be a string or "null" for unassigned meetings)
  const folderId = parseFolderIdParam(folderIdParam);

  try {
    const meetings = await getUserMeetingHistory(
      session.user.id,
      limit,
      offset,
      folderId
    );

    return NextResponse.json({
      meetings,
      pagination: {
        limit,
        offset,
        hasMore: meetings.length === limit,
      },
    });
  } catch (error) {
    console.error("Get meeting history error:", error);
    return NextResponse.json(
      { error: "Failed to get meeting history" },
      { status: 500 }
    );
  }
}
