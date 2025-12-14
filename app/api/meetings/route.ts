import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createMeeting, listMeetingsByHost } from "@/lib/db/meeting";
import { validateCreateMeetingRequest } from "@/lib/validation/meeting";
import type { MeetingType, MeetingSettings } from "@/types/meeting";

/**
 * GET /api/meetings
 *
 * List meetings for the authenticated user.
 * Query params:
 * - status: "upcoming" | "past" | "all" (default: "all")
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  // Validate status
  const validStatuses = ["upcoming", "past", "all"] as const;
  type ValidStatus = (typeof validStatuses)[number];

  let status: ValidStatus | null = null;
  if (statusParam) {
    if (!validStatuses.includes(statusParam as ValidStatus)) {
      return NextResponse.json(
        { error: "status must be 'upcoming', 'past', or 'all'" },
        { status: 400 }
      );
    }
    status = statusParam as ValidStatus;
  }

  // Parse and validate limit
  let limit = 50;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json(
        { error: "limit must be a number between 1 and 100" },
        { status: 400 }
      );
    }
    limit = parsed;
  }

  // Parse and validate offset
  let offset = 0;
  if (offsetParam) {
    const parsed = parseInt(offsetParam, 10);
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: "offset must be a non-negative number" },
        { status: 400 }
      );
    }
    offset = parsed;
  }

  try {
    const meetings = await listMeetingsByHost(session.user.id, {
      status: status || "all",
      limit,
      offset,
    });

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error("List meetings error:", error);
    return NextResponse.json(
      { error: "Failed to list meetings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings
 *
 * Create a new meeting.
 * Body:
 * - title: string (required)
 * - description: string (optional)
 * - type: "instant" | "scheduled" (required)
 * - scheduledAt: ISO date string (required for scheduled meetings)
 * - durationMinutes: number (optional, default: 60)
 * - timezone: string (optional, default: "UTC")
 * - settings: MeetingSettings (optional)
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
    title?: string;
    description?: string;
    type?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    timezone?: string;
    settings?: MeetingSettings;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateCreateMeetingRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const meeting = await createMeeting({
      hostId: session.user.id,
      title: body.title as string,
      description: body.description,
      type: body.type as MeetingType,
      scheduledAt: validation.parsedDate,
      durationMinutes: body.durationMinutes,
      timezone: body.timezone,
      settings: body.settings,
    });

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    console.error("Create meeting error:", error);
    return NextResponse.json(
      { error: "Failed to create meeting" },
      { status: 500 }
    );
  }
}
