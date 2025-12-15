/**
 * Meeting Invitees API
 *
 * GET /api/meetings/[meetingId]/invitees
 *
 * Lists all invitees for a meeting with RSVP summary.
 *
 * DELETE /api/meetings/[meetingId]/invitees?email=...
 *
 * Removes an invitee from a meeting.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingById } from "@/lib/db/meeting";
import {
  getInviteesByMeetingId,
  getRsvpSummary,
  deleteInviteeByEmail,
} from "@/lib/db/invitee";
import { validateMeetingId } from "@/lib/validation/meeting";
import { isValidEmail } from "@/lib/validation/invitee";

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/meetings/[meetingId]/invitees
 *
 * Returns all invitees for a meeting with RSVP summary.
 * Only accessible by the meeting host.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  // Validate meeting ID using shared validation
  const meetingIdValidation = validateMeetingId(meetingId);
  if (!meetingIdValidation.isValid) {
    return NextResponse.json(
      { error: meetingIdValidation.error },
      { status: 400 }
    );
  }

  // Get meeting
  const meeting = await getMeetingById(meetingId);

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only host can view invitees
  if (meeting.hostId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can view invitees" },
      { status: 403 }
    );
  }

  try {
    // Get invitees and summary in parallel
    const [invitees, summary] = await Promise.all([
      getInviteesByMeetingId(meetingId),
      getRsvpSummary(meetingId),
    ]);

    return NextResponse.json({
      invitees,
      summary,
    });
  } catch (error) {
    console.error("List invitees error:", error);
    return NextResponse.json(
      { error: "Failed to list invitees" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[meetingId]/invitees?email=...
 *
 * Removes an invitee from a meeting.
 * Only accessible by the meeting host.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  // Validate meeting ID using shared validation
  const meetingIdValidation = validateMeetingId(meetingId);
  if (!meetingIdValidation.isValid) {
    return NextResponse.json(
      { error: meetingIdValidation.error },
      { status: 400 }
    );
  }

  // Get email from query params
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "email query parameter is required" },
      { status: 400 }
    );
  }

  // Validate email format for security
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  // Get meeting
  const meeting = await getMeetingById(meetingId);

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only host can remove invitees
  if (meeting.hostId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can remove invitees" },
      { status: 403 }
    );
  }

  try {
    const deleted = await deleteInviteeByEmail(meetingId, email);

    if (!deleted) {
      return NextResponse.json(
        { error: "Invitee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete invitee error:", error);
    return NextResponse.json(
      { error: "Failed to remove invitee" },
      { status: 500 }
    );
  }
}
