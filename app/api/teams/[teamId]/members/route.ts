import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  listTeamMembers,
  inviteUserToTeam,
  inviteUserByEmail,
  countActiveMembers,
  getTeamMembership,
  getEffectivePermissions,
} from "@/lib/db/team";
import { validateInviteMembersRequest } from "@/lib/validation/team";
import { TEAM_LIMITS, type TeamRole } from "@/types/team";

interface RouteContext {
  params: Promise<{
    teamId: string;
  }>;
}

/**
 * GET /api/teams/[teamId]/members
 *
 * List all members of a team.
 * Uses permission inheritance - parent team admins/owners can view sub-team members.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await context.params;

  try {
    // Get effective permissions (optimized: single call for access check)
    const permissions = await getEffectivePermissions(teamId, session.user.id);

    // Check user has access
    if (!permissions.effectiveRole) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const members = await listTeamMembers(teamId);
    return NextResponse.json({ members });
  } catch (error) {
    console.error("List team members error:", error);
    return NextResponse.json(
      { error: "Failed to list members" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams/[teamId]/members
 *
 * Invite members to a team.
 * Requires admin or owner role (direct or inherited from parent team).
 * Body:
 * - invites: Array<{ email?: string; userId?: string }>
 * - role: TeamRole (optional, default: member)
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await context.params;

  // Parse request body
  let body: {
    invites?: Array<{ email?: string; userId?: string }>;
    role?: TeamRole;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateInviteMembersRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Get effective permissions (optimized: single call for admin check)
    const permissions = await getEffectivePermissions(teamId, session.user.id);
    const isAdmin = permissions.effectiveRole === "owner" || permissions.effectiveRole === "admin";

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Not authorized to invite members" },
        { status: 403 }
      );
    }

    // Check member limit
    const currentMembers = await countActiveMembers(teamId);
    const newInviteCount = body.invites!.length;

    if (currentMembers + newInviteCount > TEAM_LIMITS.MAX_MEMBERS_PER_TEAM) {
      return NextResponse.json(
        {
          error: `Maximum of ${TEAM_LIMITS.MAX_MEMBERS_PER_TEAM} members per team`,
        },
        { status: 400 }
      );
    }

    const invited: Awaited<ReturnType<typeof inviteUserToTeam>>[] = [];
    const failed: Array<{ identifier: string; reason: string }> = [];

    for (const invite of body.invites!) {
      try {
        let member;
        const identifier = invite.userId || invite.email || "unknown";

        if (invite.userId) {
          // SECURITY: Prevent self-invitation
          if (invite.userId === session.user.id) {
            failed.push({
              identifier,
              reason: "Cannot invite yourself",
            });
            continue;
          }

          // Check if already an active member
          const existing = await getTeamMembership(teamId, invite.userId);
          if (existing && existing.status === "active") {
            failed.push({
              identifier,
              reason: "User is already an active member",
            });
            continue;
          }

          // inviteUserToTeam handles re-inviting left users
          member = await inviteUserToTeam({
            teamId,
            userId: invite.userId,
            invitedBy: session.user.id,
            role: body.role,
          });
        } else if (invite.email) {
          // SECURITY: Prevent self-invitation by email
          // Note: This is a basic check; the user table might have different email casing
          if (
            invite.email.toLowerCase().trim() ===
            session.user.email?.toLowerCase()
          ) {
            failed.push({
              identifier,
              reason: "Cannot invite yourself",
            });
            continue;
          }

          // inviteUserByEmail handles re-inviting left users
          member = await inviteUserByEmail({
            teamId,
            email: invite.email,
            invitedBy: session.user.id,
            role: body.role,
          });

          if (!member) {
            failed.push({
              identifier,
              reason: "User not found with this email",
            });
            continue;
          }
        }

        if (member) {
          invited.push(member);
        }
      } catch (error) {
        const identifier = invite.userId || invite.email || "unknown";
        failed.push({
          identifier,
          reason:
            error instanceof Error ? error.message : "Failed to invite user",
        });
      }
    }

    return NextResponse.json({ invited, failed }, { status: 201 });
  } catch (error) {
    console.error("Invite members error:", error);
    return NextResponse.json(
      { error: "Failed to invite members" },
      { status: 500 }
    );
  }
}
