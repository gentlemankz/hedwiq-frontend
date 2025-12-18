/**
 * User's Pending Team Invitations API
 *
 * GET /api/teams/invitations - List user's pending team invitations
 * POST /api/teams/invitations - Accept or decline a team invitation
 *
 * SECURITY: All operations validate that the user owns the invitation being processed.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { teamMember, team, user } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { acceptTeamInvitation, removeMemberFromTeam, getTeamById } from "@/lib/db/team";
import {
  getPendingInvitationsForEmail,
  acceptExternalInvitation,
  cancelExternalInvitation,
} from "@/lib/db/external-team-invitation";
import type { PendingTeamInvitation, TeamRole } from "@/types/team";

// ============================================================================
// GET: List pending invitations
// ============================================================================

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Query INTERNAL pending invitations (user already has account, invited via team_member)
    // SECURITY: Only returns invitations for the authenticated user
    const internalInvitations = await db
      .select({
        id: teamMember.id,
        teamId: teamMember.teamId,
        teamName: team.name,
        teamDescription: team.description,
        teamColor: team.color,
        role: teamMember.role,
        inviterName: user.name,
        inviterEmail: user.email,
        invitedAt: teamMember.invitedAt,
        memberCount: sql<number>`(
          SELECT COUNT(*) FROM team_member
          WHERE team_member.team_id = ${team.id}
          AND team_member.status = 'active'
        )::int`,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .leftJoin(user, eq(user.id, teamMember.invitedBy))
      .where(
        and(
          eq(teamMember.userId, session.user.id),
          eq(teamMember.status, "pending")
        )
      )
      .orderBy(teamMember.invitedAt);

    // Map internal invitations to shared type
    const pendingInvitations: PendingTeamInvitation[] = internalInvitations.map((inv) => ({
      id: inv.id,
      teamId: inv.teamId,
      teamName: inv.teamName,
      teamDescription: inv.teamDescription,
      teamColor: inv.teamColor,
      role: inv.role as TeamRole,
      inviterName: inv.inviterName,
      inviterEmail: inv.inviterEmail,
      invitedAt: inv.invitedAt.toISOString(),
      memberCount: inv.memberCount,
      isExternal: false, // Internal invitation
    }));

    // Query EXTERNAL pending invitations (user signed up after being invited)
    // These are stored in pending_external_team_invitation and matched by email
    if (session.user.email) {
      const externalInvitations = await getPendingInvitationsForEmail(session.user.email);

      // Map external invitations to same type
      for (const ext of externalInvitations) {
        pendingInvitations.push({
          id: ext.id,
          teamId: ext.teamId,
          teamName: ext.team?.name ?? "Unknown Team",
          teamDescription: ext.team?.description ?? null,
          teamColor: ext.team?.color ?? null,
          role: ext.role as TeamRole,
          inviterName: ext.inviter?.name ?? null,
          inviterEmail: ext.inviter?.email ?? null,
          invitedAt: ext.invitedAt,
          memberCount: ext.team?.memberCount ?? 0,
          isExternal: true, // External invitation
        });
      }
    }

    // Sort all invitations by date (newest first)
    pendingInvitations.sort(
      (a, b) => new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime()
    );

    return NextResponse.json({ invitations: pendingInvitations });
  } catch (error) {
    console.error("List pending invitations error:", error);
    return NextResponse.json(
      { error: "Failed to list invitations" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST: Accept or decline invitation
// ============================================================================

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    teamId?: string;
    action?: "accept" | "decline";
    isExternal?: boolean; // Flag to indicate external invitation
    invitationId?: string; // Required for external invitations
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  if (!body.teamId || typeof body.teamId !== "string") {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  if (body.action !== "accept" && body.action !== "decline") {
    return NextResponse.json(
      { error: "action must be 'accept' or 'decline'" },
      { status: 400 }
    );
  }

  try {
    // SECURITY: Verify team still exists before processing
    const teamExists = await getTeamById(body.teamId);
    if (!teamExists) {
      return NextResponse.json(
        { error: "Team no longer exists" },
        { status: 404 }
      );
    }

    // Handle EXTERNAL invitations (from pending_external_team_invitation table)
    if (body.isExternal) {
      if (!session.user.email) {
        return NextResponse.json(
          { error: "User email is required for external invitations" },
          { status: 400 }
        );
      }

      // Find the external invitation for this user's email and team
      const externalInvitations = await getPendingInvitationsForEmail(session.user.email);
      const externalInvite = externalInvitations.find(
        (inv) => inv.teamId === body.teamId
      );

      if (!externalInvite) {
        return NextResponse.json(
          { error: "No pending external invitation found for this team" },
          { status: 404 }
        );
      }

      if (body.action === "accept") {
        // Accept the external invitation (creates team_member record)
        const result = await acceptExternalInvitation(externalInvite.token, session.user.id);

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || "Failed to accept invitation" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          action: "accepted",
          team: teamExists,
        });
      } else {
        // Decline the external invitation (cancel it)
        const success = await cancelExternalInvitation(externalInvite.id);

        if (!success) {
          return NextResponse.json(
            { error: "Failed to decline invitation" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          action: "declined",
        });
      }
    }

    // Handle INTERNAL invitations (from team_member table)
    // SECURITY: Verify user has a PENDING invitation for this team
    // This prevents accepting declined invitations or modifying active memberships
    const [pending] = await db
      .select({
        id: teamMember.id,
        status: teamMember.status,
        role: teamMember.role,
      })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, body.teamId),
          eq(teamMember.userId, session.user.id),
          // SECURITY: Explicitly check for pending status in query
          eq(teamMember.status, "pending")
        )
      )
      .limit(1);

    if (!pending) {
      // Check if user has any membership to give better error message
      const [anyMembership] = await db
        .select({ status: teamMember.status })
        .from(teamMember)
        .where(
          and(
            eq(teamMember.teamId, body.teamId),
            eq(teamMember.userId, session.user.id)
          )
        )
        .limit(1);

      if (anyMembership) {
        if (anyMembership.status === "active") {
          return NextResponse.json(
            { error: "You are already an active member of this team" },
            { status: 400 }
          );
        } else if (anyMembership.status === "left") {
          return NextResponse.json(
            { error: "You have previously left this team. Ask an admin to re-invite you." },
            { status: 400 }
          );
        }
      }

      return NextResponse.json(
        { error: "No pending invitation found for this team" },
        { status: 404 }
      );
    }

    if (body.action === "accept") {
      // Accept the invitation
      const member = await acceptTeamInvitation(body.teamId, session.user.id);

      if (!member) {
        return NextResponse.json(
          { error: "Failed to accept invitation. It may have been cancelled." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: "accepted",
        member,
      });
    } else {
      // Decline the invitation
      // NOTE: We mark as 'left' so admins can see who declined and re-invite if needed
      const success = await removeMemberFromTeam(body.teamId, session.user.id);

      if (!success) {
        return NextResponse.json(
          { error: "Failed to decline invitation" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: "declined",
      });
    }
  } catch (error) {
    console.error("Process invitation error:", error);
    return NextResponse.json(
      { error: "Failed to process invitation" },
      { status: 500 }
    );
  }
}
