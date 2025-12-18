import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createTeam,
  listSubteams,
  isTeamMember,
  isTeamAdmin,
  teamNameExists,
  countTeamsOwnedByUser,
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
    // Check user is a member of the parent team
    const isMember = await isTeamMember(teamId, session.user.id);
    if (!isMember) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const subteams = await listSubteams(teamId);
    return NextResponse.json({ subteams });
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
 * Requires admin or owner role in the parent team.
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
    // Check user has admin role in parent team
    const hasPermission = await isTeamAdmin(teamId, session.user.id);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Not authorized to create sub-team" },
        { status: 403 }
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
