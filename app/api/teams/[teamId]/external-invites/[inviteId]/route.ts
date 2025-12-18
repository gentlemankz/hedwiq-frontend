/**
 * External Team Invitation Detail API Routes
 *
 * DELETE /api/teams/[teamId]/external-invites/[inviteId] - Cancel invitation
 * PATCH /api/teams/[teamId]/external-invites/[inviteId] - Resend invitation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getExternalInvitationById,
  cancelExternalInvitation,
  resendExternalInvitation,
} from "@/lib/db/external-team-invitation";
import { isTeamAdmin, getTeamById, countActiveMembers } from "@/lib/db/team";
import { sendExternalTeamInvitationEmail } from "@/lib/email";
import { EXTERNAL_INVITE_LIMITS } from "@/types/team";

// ============================================================================
// DELETE - Cancel External Invitation
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; inviteId: string }> }
) {
  try {
    const { teamId, inviteId } = await params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check user has admin access to the team
    const hasAccess = await isTeamAdmin(teamId, userId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify invitation belongs to this team
    const invitation = await getExternalInvitationById(inviteId);
    if (!invitation || invitation.teamId !== teamId) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Cancel the invitation
    const cancelled = await cancelExternalInvitation(inviteId);

    if (!cancelled) {
      return NextResponse.json(
        { error: "Failed to cancel invitation. It may already be cancelled or accepted." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel external invitation:", error);
    return NextResponse.json(
      { error: "Failed to cancel external invitation" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Resend External Invitation
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; inviteId: string }> }
) {
  try {
    const { teamId, inviteId } = await params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const userName = session.user.name || "A team member";
    const userEmail = session.user.email || "";

    // Check user has admin access to the team
    const hasAccess = await isTeamAdmin(teamId, userId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify invitation belongs to this team
    const invitation = await getExternalInvitationById(inviteId);
    if (!invitation || invitation.teamId !== teamId) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot resend ${invitation.status} invitation` },
        { status: 400 }
      );
    }

    // Check minimum resend interval to prevent email spam
    const lastInvitedAt = new Date(invitation.invitedAt);
    const minResendTime = new Date(
      lastInvitedAt.getTime() +
        EXTERNAL_INVITE_LIMITS.MIN_RESEND_INTERVAL_HOURS * 60 * 60 * 1000
    );
    const now = new Date();

    if (now < minResendTime) {
      const hoursRemaining = Math.ceil(
        (minResendTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      );
      return NextResponse.json(
        {
          error: `Please wait ${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""} before resending this invitation`,
        },
        { status: 429 }
      );
    }

    // Resend the invitation (generates new token and resets expiration)
    const updated = await resendExternalInvitation(inviteId);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to resend invitation" },
        { status: 400 }
      );
    }

    // Get team details for the email
    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const memberCount = await countActiveMembers(teamId);

    // Send the invitation email
    try {
      await sendExternalTeamInvitationEmail({
        teamId,
        teamName: team.name,
        teamDescription: team.description,
        teamColor: team.color,
        role: updated.role,
        memberCount,
        inviterName: userName,
        inviterEmail: userEmail,
        inviteeEmail: updated.email,
        token: updated.token,
      });
    } catch (emailError) {
      console.error(
        `Failed to send resend email to ${updated.email}:`,
        emailError
      );
      // Don't fail the resend if email fails
    }

    return NextResponse.json({
      success: true,
      invitation: updated,
    });
  } catch (error) {
    console.error("Failed to resend external invitation:", error);
    return NextResponse.json(
      { error: "Failed to resend external invitation" },
      { status: 500 }
    );
  }
}
