/**
 * Meeting Invitation API
 *
 * POST /api/meetings/[meetingId]/invite
 *
 * Invites users to a meeting by email. Creates invitee records
 * and optionally sends invitation emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMeetingWithHost } from "@/lib/db/meeting";
import { getAgendaByMeetingId } from "@/lib/db/agenda";
import {
  createInvitees,
  getInviteesByMeetingId,
  markEmailsSent,
} from "@/lib/db/invitee";
import {
  validateInviteRequest,
  toInviteeInputs,
  canAddMoreInvitees,
} from "@/lib/validation/invitee";
import { validateMeetingId } from "@/lib/validation/meeting";
import { sendMeetingInvitations } from "@/lib/email";

// ============================================================================
// Route Handler
// ============================================================================

/**
 * POST /api/meetings/[meetingId]/invite
 *
 * Request body:
 * {
 *   emails: string[],      // Required: email addresses to invite
 *   names?: Record<string, string>, // Optional: email -> name mapping
 *   sendEmails?: boolean   // Optional: send invitation emails (default: true)
 * }
 *
 * Response:
 * {
 *   invitations: MeetingInvitee[],  // Created invitations
 *   alreadyInvited: string[],        // Emails that were already invited
 *   emailsSent: number,              // Number of emails sent
 *   emailsFailed: number,            // Number of email failures
 *   errors?: Array<{ email: string; error: string }> // Validation/send errors
 * }
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

  // Validate meeting ID format using shared validation
  const meetingIdValidation = validateMeetingId(meetingId);
  if (!meetingIdValidation.isValid) {
    return NextResponse.json(
      { error: meetingIdValidation.error },
      { status: 400 }
    );
  }

  // Get meeting with host info (single query instead of two)
  const meetingWithHost = await getMeetingWithHost(meetingId);

  if (!meetingWithHost) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only the host can invite people
  if (meetingWithHost.hostId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can invite participants" },
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
    emails?: unknown;
    names?: unknown;
    sendEmails?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate input
  const validation = validateInviteRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Check invitee limit
  const existingInvitees = await getInviteesByMeetingId(meetingId);
  const limitCheck = canAddMoreInvitees(
    existingInvitees.length,
    validation.validEmails.length
  );
  if (!limitCheck.isValid) {
    return NextResponse.json({ error: limitCheck.error }, { status: 400 });
  }

  try {
    // Create invitees
    const inviteeInputs = toInviteeInputs(
      validation.validEmails,
      body.names as Record<string, string> | undefined
    );

    const { created, alreadyInvited } = await createInvitees(
      meetingId,
      inviteeInputs,
      session.user.id
    );

    // Prepare response
    const response: {
      invitations: typeof created;
      alreadyInvited: string[];
      emailsSent: number;
      emailsFailed: number;
      errors?: Array<{ email: string; error: string }>;
    } = {
      invitations: created,
      alreadyInvited,
      emailsSent: 0,
      emailsFailed: 0,
    };

    // Add validation errors if any
    if (validation.invalidEmails.length > 0) {
      response.errors = validation.invalidEmails.map((inv) => ({
        email: inv.email,
        error: inv.reason,
      }));
    }

    // Send emails if requested (default: true)
    const shouldSendEmails = body.sendEmails !== false;
    if (shouldSendEmails && created.length > 0) {
      // Get agenda for email
      const agenda = await getAgendaByMeetingId(meetingId);

      // Send emails (meetingWithHost already fetched above)
      const emailResult = await sendMeetingInvitations(
        meetingWithHost,
        created,
        agenda
      );

      response.emailsSent = emailResult.sent.length;
      response.emailsFailed = emailResult.failed.length;

      // Mark emails as sent in database
      if (emailResult.sent.length > 0) {
        const sentInviteeIds = created
          .filter((inv) =>
            emailResult.sent.some((s) => s.email === inv.email)
          )
          .map((inv) => inv.id);
        await markEmailsSent(sentInviteeIds);
      }

      // Add email failures to errors
      if (emailResult.failed.length > 0) {
        response.errors = [
          ...(response.errors || []),
          ...emailResult.failed.map((f) => ({
            email: f.email,
            error: `Email failed: ${f.error}`,
          })),
        ];
      }
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Invite error:", error);
    return NextResponse.json(
      { error: "Failed to create invitations" },
      { status: 500 }
    );
  }
}
