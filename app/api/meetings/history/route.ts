import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserMeetingHistory } from "@/lib/db/meeting-data";

/**
 * GET /api/meetings/history
 *
 * Get the current user's past meetings with basic stats.
 * Only returns ended meetings where the user participated.
 *
 * Query params:
 * - limit: number (default 20, max 50)
 * - offset: number (default 0)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Validate and sanitize pagination params
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 50);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  try {
    const meetings = await getUserMeetingHistory(
      session.user.id,
      limit,
      offset
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
