import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getTeamWithMembers,
  updateTeam,
  deleteTeam,
  isTeamOwner,
  teamNameExists,
  getTeamById,
  getAncestorTeams,
  getEffectivePermissions,
} from "@/lib/db/team";
import { validateUpdateTeamRequest } from "@/lib/validation/team";

interface RouteContext {
  params: Promise<{
    teamId: string;
  }>;
}

/**
 * GET /api/teams/[teamId]
 *
 * Get a specific team by ID with members.
 * Also returns ancestor teams for breadcrumb navigation and effective role.
 * Uses permission inheritance - parent team admins/owners can view sub-teams.
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
    // Get effective permissions (optimized: single call for role, depth, ancestorIds)
    const permissions = await getEffectivePermissions(teamId, session.user.id);

    // Check user has access
    if (!permissions.effectiveRole) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Fetch team and ancestors in parallel (use pre-fetched ancestorIds)
    const [team, ancestors] = await Promise.all([
      getTeamWithMembers(teamId),
      getAncestorTeams(teamId, permissions.ancestorIds),
    ]);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({
      team,
      ancestors,
      effectiveRole: permissions.effectiveRole,
      isInheritedRole: permissions.isInherited,
      depth: permissions.depth,
    });
  } catch (error) {
    console.error("Get team error:", error);
    return NextResponse.json(
      { error: "Failed to get team" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/teams/[teamId]
 *
 * Update a team's name, description, color, or icon.
 * Requires admin or owner role (direct or inherited from parent team).
 * Body:
 * - name: string (optional)
 * - description: string | null (optional)
 * - color: string | null (optional)
 * - icon: string | null (optional)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await context.params;

  // Parse request body
  let body: {
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateUpdateTeamRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Check user has admin role (direct or inherited from parent)
    const permissions = await getEffectivePermissions(teamId, session.user.id);
    const isAdmin = permissions.effectiveRole === "owner" || permissions.effectiveRole === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Not authorized to update team" },
        { status: 403 }
      );
    }

    // If updating name, check for duplicate
    if (body.name !== undefined) {
      const existingTeam = await getTeamById(teamId);
      if (existingTeam) {
        const nameExists = await teamNameExists(
          body.name,
          existingTeam.parentTeamId,
          teamId
        );
        if (nameExists) {
          return NextResponse.json(
            { error: "A team with this name already exists" },
            { status: 409 }
          );
        }
      }
    }

    const team = await updateTeam(teamId, body);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Update team error:", error);
    return NextResponse.json(
      { error: "Failed to update team" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teams/[teamId]
 *
 * Delete a team and all its sub-teams.
 * Requires owner role.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await context.params;

  try {
    // Check user is the team owner
    const isOwner = await isTeamOwner(teamId, session.user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the team owner can delete the team" },
        { status: 403 }
      );
    }

    const result = await deleteTeam(teamId);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to delete team" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      subteamsDeleted: result.subteamsDeleted,
    });
  } catch (error) {
    console.error("Delete team error:", error);
    return NextResponse.json(
      { error: "Failed to delete team" },
      { status: 500 }
    );
  }
}
