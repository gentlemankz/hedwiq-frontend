/**
 * External Team Invitations API Routes
 *
 * GET /api/teams/[teamId]/external-invites - List pending external invitations
 * POST /api/teams/[teamId]/external-invites - Create external invitations
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  listExternalInvitationsForTeam,
  createExternalInvitation,
  countPendingExternalInvitations,
  countRecentInvitationsForTeam,
  emailHasAccount,
} from "@/lib/db/external-team-invitation";
import { isTeamAdmin, getTeamById, countActiveMembers } from "@/lib/db/team";
import { sendExternalTeamInvitationEmail } from "@/lib/email";
import { normalizeEmail, isValidEmail } from "@/lib/validation/invitee";
import { EXTERNAL_INVITE_LIMITS } from "@/types/team";
import type { TeamRole } from "@/types/team";

// ============================================================================
// GET - List External Invitations
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

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

    // Get external invitations (only pending)
    const invitations = await listExternalInvitationsForTeam(teamId, [
      "pending",
    ]);

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Failed to list external invitations:", error);
    return NextResponse.json(
      { error: "Failed to list external invitations" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create External Invitations
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

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

    // Get team details for the email
    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { emails, role = "member" } = body as {
      emails: string[];
      role?: Exclude<TeamRole, "owner">;
    };

    // Validate emails array
    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "At least one email is required" },
        { status: 400 }
      );
    }

    // Validate role
    if (role !== "member" && role !== "admin") {
      return NextResponse.json(
        { error: "Invalid role. Must be 'member' or 'admin'" },
        { status: 400 }
      );
    }

    // Check rate limiting
    const recentCount = await countRecentInvitationsForTeam(teamId);
    if (recentCount + emails.length > EXTERNAL_INVITE_LIMITS.MAX_INVITES_PER_HOUR) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum ${EXTERNAL_INVITE_LIMITS.MAX_INVITES_PER_HOUR} invitations per hour.`,
        },
        { status: 429 }
      );
    }

    // Check pending invitations limit
    const pendingCount = await countPendingExternalInvitations(teamId);
    if (pendingCount + emails.length > EXTERNAL_INVITE_LIMITS.MAX_PENDING_PER_TEAM) {
      return NextResponse.json(
        {
          error: `Maximum ${EXTERNAL_INVITE_LIMITS.MAX_PENDING_PER_TEAM} pending invitations allowed per team`,
        },
        { status: 400 }
      );
    }

    // Get current member count for email
    const memberCount = await countActiveMembers(teamId);

    // Process each email
    // NOTE: We do NOT return tokens - they are only sent via email for security
    const created: Array<{
      email: string;
      id: string;
    }> = [];
    const failed: Array<{ email: string; reason: string }> = [];

    for (const rawEmail of emails) {
      const email = normalizeEmail(rawEmail);

      // Validate email format
      if (!isValidEmail(email)) {
        failed.push({ email: rawEmail, reason: "Invalid email format" });
        continue;
      }

      // Check if user already has an account (should use regular invite flow)
      const hasAccount = await emailHasAccount(email);
      if (hasAccount) {
        failed.push({
          email,
          reason: "User already has an account. Use regular team invite instead.",
        });
        continue;
      }

      // Create invitation (handles duplicate via onConflictDoNothing)
      // Note: We removed the separate hasPendingInvitation check since
      // createExternalInvitation handles conflicts via DB constraint
      try {
        const invitation = await createExternalInvitation({
          teamId,
          email,
          role,
          invitedBy: userId,
        });

        if (invitation) {
          created.push({
            email: invitation.email,
            id: invitation.id,
          });

          // Send invitation email
          try {
            await sendExternalTeamInvitationEmail({
              teamId,
              teamName: team.name,
              teamDescription: team.description,
              teamColor: team.color,
              role,
              memberCount,
              inviterName: userName,
              inviterEmail: userEmail,
              inviteeEmail: email,
              token: invitation.token,
            });
          } catch (emailError) {
            console.error(
              `Failed to send external invitation email to ${email}:`,
              emailError
            );
            // Don't fail the invitation creation if email fails
          }
        } else {
          // createExternalInvitation returns null on conflict (duplicate)
          failed.push({ email, reason: "Pending invitation already exists" });
        }
      } catch (error) {
        failed.push({
          email,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      created: created.length,
      failed,
      invitations: created,
    });
  } catch (error) {
    console.error("Failed to create external invitations:", error);
    return NextResponse.json(
      { error: "Failed to create external invitations" },
      { status: 500 }
    );
  }
}
