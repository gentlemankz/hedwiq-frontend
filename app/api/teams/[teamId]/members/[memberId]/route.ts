import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getTeamMemberById,
  getTeamMembership,
  updateMemberRole,
  removeMemberFromTeam,
  isTeamAdmin,
} from "@/lib/db/team";
import { validateUpdateMemberRoleRequest } from "@/lib/validation/team";
import { canChangeRole, type TeamRole } from "@/types/team";

interface RouteContext {
  params: Promise<{
    teamId: string;
    memberId: string;
  }>;
}

/**
 * GET /api/teams/[teamId]/members/[memberId]
 *
 * Get a specific team member.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, memberId } = await context.params;

  try {
    // Check user is a member of the team
    const currentUserMembership = await getTeamMembership(
      teamId,
      session.user.id
    );
    if (!currentUserMembership || currentUserMembership.status !== "active") {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const member = await getTeamMemberById(memberId);

    if (!member || member.teamId !== teamId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json({ member });
  } catch (error) {
    console.error("Get team member error:", error);
    return NextResponse.json(
      { error: "Failed to get member" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/teams/[teamId]/members/[memberId]
 *
 * Update a team member's role.
 * Requires admin or owner role, with role-specific restrictions.
 * Body:
 * - role: TeamRole
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, memberId } = await context.params;

  // Parse request body
  let body: {
    role?: TeamRole;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateUpdateMemberRoleRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const newRole = body.role as TeamRole;

  try {
    // Get current user's membership
    const currentUserMembership = await getTeamMembership(
      teamId,
      session.user.id
    );
    if (!currentUserMembership || currentUserMembership.status !== "active") {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get target member
    const targetMember = await getTeamMemberById(memberId);
    if (!targetMember || targetMember.teamId !== teamId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Cannot change own role
    if (targetMember.userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    // Check if role change is allowed
    const canChange = canChangeRole(
      currentUserMembership.role as TeamRole,
      targetMember.role as TeamRole,
      newRole
    );

    if (!canChange) {
      return NextResponse.json(
        { error: "Not authorized to make this role change" },
        { status: 403 }
      );
    }

    // Cannot have multiple owners - transfer ownership instead
    if (newRole === "owner") {
      return NextResponse.json(
        { error: "Use transfer ownership to change team owner" },
        { status: 400 }
      );
    }

    const member = await updateMemberRole(
      teamId,
      targetMember.userId,
      newRole
    );

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json({ member });
  } catch (error) {
    console.error("Update member role error:", error);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teams/[teamId]/members/[memberId]
 *
 * Remove a member from a team.
 * Requires admin or owner role (except for self-removal).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, memberId } = await context.params;

  try {
    // Get current user's membership
    const currentUserMembership = await getTeamMembership(
      teamId,
      session.user.id
    );
    if (!currentUserMembership || currentUserMembership.status !== "active") {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get target member
    const targetMember = await getTeamMemberById(memberId);
    if (!targetMember || targetMember.teamId !== teamId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Check permissions
    const isSelfRemoval = targetMember.userId === session.user.id;

    if (isSelfRemoval) {
      // Owner cannot leave without transferring ownership
      if (targetMember.role === "owner") {
        return NextResponse.json(
          { error: "Transfer ownership before leaving the team" },
          { status: 400 }
        );
      }
      // Anyone can remove themselves (leave)
    } else {
      // Must be admin or owner to remove others
      const isAdmin = await isTeamAdmin(teamId, session.user.id);
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Not authorized to remove members" },
          { status: 403 }
        );
      }

      // Cannot remove owner
      if (targetMember.role === "owner") {
        return NextResponse.json(
          { error: "Cannot remove the team owner" },
          { status: 400 }
        );
      }

      // Admins cannot remove other admins (only owner can)
      if (
        targetMember.role === "admin" &&
        currentUserMembership.role !== "owner"
      ) {
        return NextResponse.json(
          { error: "Only the owner can remove admins" },
          { status: 403 }
        );
      }
    }

    const success = await removeMemberFromTeam(teamId, targetMember.userId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
