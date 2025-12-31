/**
 * Internal Meeting Host API
 *
 * Returns the actual meeting host for a given room ID.
 * Used by the agent to determine the correct billing target.
 *
 * SECURITY: This endpoint is protected by INTERNAL_SERVICE_TOKEN.
 * The agent should call this instead of assuming the first joiner is the host.
 *
 * GET /api/internal/meeting-host?roomId={roomId}
 * - Returns the hostId for the meeting associated with the room
 */

import { NextRequest, NextResponse } from "next/server";
import { getMeetingByRoomId } from "@/lib/db/meeting-data";
import { sanitizeError, ERROR_MESSAGES } from "@/lib/error-handling";
import { isValidServiceToken } from "@/lib/internal-auth";

// ============================================================================
// GET Handler
// ============================================================================

/**
 * GET /api/internal/meeting-host
 *
 * Get the actual meeting host for a room.
 *
 * Query Parameters:
 * - roomId: string (required) - The LiveKit room ID
 *
 * Returns:
 * - hostId: string - The actual meeting host's user ID
 * - meetingId: string - The meeting ID
 *
 * Headers:
 * - Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
 */
export async function GET(request: NextRequest) {
  // Validate service token
  if (!isValidServiceToken(request, "Internal Meeting Host API")) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const roomId = searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId is required" },
      { status: 400 }
    );
  }

  try {
    const meeting = await getMeetingByRoomId(roomId);

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found for room" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      hostId: meeting.hostId,
      meetingId: meeting.id,
      roomId,
    });
  } catch (error) {
    // SECURITY FIX (Medium #15): Sanitize error message
    const safeError = sanitizeError(error, "Internal Meeting Host API", ERROR_MESSAGES.MEETING_NOT_FOUND);
    return NextResponse.json(
      { error: safeError.message },
      { status: safeError.status }
    );
  }
}
