import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createTeam,
  listSubteams,
  teamNameExists,
  countTeamsOwnedByUser,
  getEffectivePermissions,
} from "@/lib/db/team";
import { validateCreateTeamRequest } from "@/lib/validation/team";
import { TEAM_LIMITS } from "@/types/team";

interface RouteContext {
  params: Promise<{
    teamId: string;
  }>;
}

/**
 * GET /api/teams/[teamId]/subteams
 *
 * List sub-teams of a team.
 * Uses permission inheritance - parent team admins/owners can view sub-teams.
 * Also returns current depth info for UI warnings.
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

    const subteams = await listSubteams(teamId);

    // Use pre-computed depth from permissions
    const canCreateSubteam = permissions.depth < TEAM_LIMITS.MAX_SUB_TEAM_DEPTH;

    return NextResponse.json({
      subteams,
      currentDepth: permissions.depth,
      maxDepth: TEAM_LIMITS.MAX_SUB_TEAM_DEPTH,
      canCreateSubteam,
    });
  } catch (error) {
    console.error("List subteams error:", error);
    return NextResponse.json(
      { error: "Failed to list sub-teams" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams/[teamId]/subteams
 *
 * Create a sub-team under the specified parent team.
 * Requires admin or owner role in the parent team (direct or inherited).
 * Body:
 * - name: string (required, 3-50 chars)
 * - description: string (optional)
 * - color: string (optional, hex color)
 * - icon: string (optional)
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
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Add parentTeamId to body for validation
  const bodyWithParent = { ...body, parentTeamId: teamId };

  // Validate request
  const validation = validateCreateTeamRequest(bodyWithParent);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Get effective permissions (optimized: single call for role and depth check)
    const permissions = await getEffectivePermissions(teamId, session.user.id);
    const isAdmin = permissions.effectiveRole === "owner" || permissions.effectiveRole === "admin";

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Not authorized to create sub-team" },
        { status: 403 }
      );
    }

    // Check depth limit using pre-computed depth (sub-team will be depth + 1)
    if (permissions.depth >= TEAM_LIMITS.MAX_SUB_TEAM_DEPTH) {
      return NextResponse.json(
        { error: `Maximum sub-team depth of ${TEAM_LIMITS.MAX_SUB_TEAM_DEPTH} exceeded` },
        { status: 400 }
      );
    }

    // Check team limit
    const teamsOwned = await countTeamsOwnedByUser(session.user.id);
    if (teamsOwned >= TEAM_LIMITS.MAX_TEAMS_PER_USER) {
      return NextResponse.json(
        {
          error: `Maximum of ${TEAM_LIMITS.MAX_TEAMS_PER_USER} teams allowed`,
        },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const nameExists = await teamNameExists(body.name as string, teamId);
    if (nameExists) {
      return NextResponse.json(
        { error: "A sub-team with this name already exists" },
        { status: 409 }
      );
    }

    const result = await createTeam({
      creatorId: session.user.id,
      name: body.name as string,
      description: body.description,
      color: body.color,
      icon: body.icon,
      parentTeamId: teamId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Create sub-team error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("depth")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: "Failed to create sub-team" },
      { status: 500 }
    );
  }
}
