/**
 * Team Meeting Invitation API
 *
 * POST /api/meetings/[meetingId]/invite-team - Invite a team to a meeting
 * GET /api/meetings/[meetingId]/invite-team - List team invitations for a meeting
 *
 * When a team is invited, all active members are also added as individual invitees.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingWithHost } from "@/lib/db/meeting";
import { getAgendaByMeetingId } from "@/lib/db/agenda";
import { createInvitees, getInviteesByMeetingId } from "@/lib/db/invitee";
import {
  inviteTeamToMeeting,
  listTeamInvitesForMeeting,
  getActiveTeamMembersForMeeting,
  isTeamMember,
} from "@/lib/db/team";
import { validateMeetingId } from "@/lib/validation/meeting";
import { sendMeetingInvitations } from "@/lib/email";
import type { InviteTeamToMeetingResponse, ListTeamInvitesResponse } from "@/types/team";

// ============================================================================
// POST - Invite Team to Meeting
// ============================================================================

/**
 * POST /api/meetings/[meetingId]/invite-team
 *
 * Request body:
 * {
 *   teamId: string,           // Required: team ID to invite
 *   sendEmails?: boolean      // Optional: send invitation emails (default: true)
 * }
 *
 * Response: InviteTeamToMeetingResponse
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  // Authenticate user
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  // Validate meeting ID format
  const meetingIdValidation = validateMeetingId(meetingId);
  if (!meetingIdValidation.isValid) {
    return NextResponse.json(
      { error: meetingIdValidation.error },
      { status: 400 }
    );
  }

  // Get meeting with host info
  const meetingWithHost = await getMeetingWithHost(meetingId);

  if (!meetingWithHost) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only the host can invite teams
  if (meetingWithHost.hostId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can invite teams" },
      { status: 403 }
    );
  }

  // Can only invite to scheduled meetings
  if (meetingWithHost.type !== "scheduled") {
    return NextResponse.json(
      { error: "Can only send invitations for scheduled meetings" },
      { status: 400 }
    );
  }

  // Parse request body
  let body: {
    teamId?: unknown;
    sendEmails?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate teamId - must be a string with correct format
  if (!body.teamId || typeof body.teamId !== "string") {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const teamId = body.teamId;

  // Validate team ID format (must start with "team-")
  if (!teamId.startsWith("team-")) {
    return NextResponse.json({ error: "Invalid team ID format" }, { status: 400 });
  }

  // Verify user is a member of the team
  const isMember = await isTeamMember(teamId, session.user.id);
  if (!isMember) {
    return NextResponse.json(
      { error: "You must be a member of the team to invite it" },
      { status: 403 }
    );
  }

  try {
    // Create team invitation
    const invite = await inviteTeamToMeeting({
      teamId,
      meetingId,
      invitedBy: session.user.id,
    });

    // Get active team members to add as individual invitees
    const teamMembers = await getActiveTeamMembersForMeeting(teamId);

    // Filter out the host (they don't need an invite)
    const membersToInvite = teamMembers.filter(
      (member) => member.userId !== meetingWithHost.hostId
    );

    let membersInvited = 0;
    let emailsSent = 0;

    if (membersToInvite.length > 0) {
      // Get existing invitees to avoid duplicates
      const existingInvitees = await getInviteesByMeetingId(meetingId);
      const existingEmails = new Set(existingInvitees.map((inv) => inv.email.toLowerCase()));

      // Filter members not already invited
      const newMembers = membersToInvite.filter(
        (member) => !existingEmails.has(member.email.toLowerCase())
      );

      if (newMembers.length > 0) {
        // Create individual invitees for team members
        const inviteeInputs = newMembers.map((member) => ({
          email: member.email,
          name: member.name,
        }));

        const { created } = await createInvitees(
          meetingId,
          inviteeInputs,
          session.user.id
        );

        membersInvited = created.length;

        // Send emails if requested (default: true)
        const shouldSendEmails = body.sendEmails !== false;
        if (shouldSendEmails && created.length > 0) {
          const agenda = await getAgendaByMeetingId(meetingId);
          const emailResult = await sendMeetingInvitations(
            meetingWithHost,
            created,
            agenda
          );
          emailsSent = emailResult.sent.length;
        }
      }
    }

    const response: InviteTeamToMeetingResponse = {
      invite,
      membersInvited,
      emailsSent,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Team invite error:", error);
    return NextResponse.json(
      { error: "Failed to invite team" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - List Team Invitations for Meeting
// ============================================================================

/**
 * GET /api/meetings/[meetingId]/invite-team
 *
 * Response: ListTeamInvitesResponse
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  // Authenticate user
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  // Validate meeting ID format
  const meetingIdValidation = validateMeetingId(meetingId);
  if (!meetingIdValidation.isValid) {
    return NextResponse.json(
      { error: meetingIdValidation.error },
      { status: 400 }
    );
  }

  // Get meeting to verify it exists and user has access
  const meetingWithHost = await getMeetingWithHost(meetingId);

  if (!meetingWithHost) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only the host can view team invitations
  if (meetingWithHost.hostId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can view team invitations" },
      { status: 403 }
    );
  }

  try {
    const invites = await listTeamInvitesForMeeting(meetingId);

    const response: ListTeamInvitesResponse = {
      invites,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("List team invites error:", error);
    return NextResponse.json(
      { error: "Failed to list team invitations" },
      { status: 500 }
    );
  }
}
