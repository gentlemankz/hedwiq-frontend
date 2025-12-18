/**
 * Team Meeting Invitation API - Individual Team Operations
 *
 * DELETE /api/meetings/[meetingId]/invite-team/[teamId] - Remove team from meeting
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingWithHost } from "@/lib/db/meeting";
import { removeTeamFromMeeting } from "@/lib/db/team";
import { validateMeetingId } from "@/lib/validation/meeting";

// ============================================================================
// DELETE - Remove Team from Meeting
// ============================================================================

/**
 * DELETE /api/meetings/[meetingId]/invite-team/[teamId]
 *
 * Removes a team invitation from a meeting.
 * Note: This does NOT remove the individual invitees that were created
 * when the team was invited - those must be managed separately.
 *
 * Response:
 * {
 *   success: boolean
 * }
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; teamId: string }> }
) {
  // Authenticate user
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId, teamId } = await params;

  // Validate meeting ID format
  const meetingIdValidation = validateMeetingId(meetingId);
  if (!meetingIdValidation.isValid) {
    return NextResponse.json(
      { error: meetingIdValidation.error },
      { status: 400 }
    );
  }

  // Validate team ID
  if (!teamId || typeof teamId !== "string" || !teamId.startsWith("team-")) {
    return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
  }

  // Get meeting with host info
  const meetingWithHost = await getMeetingWithHost(meetingId);

  if (!meetingWithHost) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only the host can remove team invitations
  if (meetingWithHost.hostId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can remove team invitations" },
      { status: 403 }
    );
  }

  try {
    const removed = await removeTeamFromMeeting(teamId, meetingId);

    if (!removed) {
      return NextResponse.json(
        { error: "Team invitation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove team invite error:", error);
    return NextResponse.json(
      { error: "Failed to remove team invitation" },
      { status: 500 }
    );
  }
}
