import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createTeam,
  listTeamsForUser,
  getTeamHierarchyForUser,
  countTeamsOwnedByUser,
} from "@/lib/db/team";
import { validateCreateTeamRequest } from "@/lib/validation/team";
import { TEAM_LIMITS } from "@/types/team";

/**
 * GET /api/teams
 *
 * List all teams for the authenticated user.
 * Query params:
 * - hierarchy: "true" to get nested hierarchy structure (default: false)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const hierarchy = searchParams.get("hierarchy") === "true";

  try {
    if (hierarchy) {
      const teamHierarchy = await getTeamHierarchyForUser(session.user.id);
      return NextResponse.json({ hierarchy: { teams: teamHierarchy } });
    }

    const teams = await listTeamsForUser(session.user.id);
    return NextResponse.json({ teams });
  } catch (error) {
    console.error("List teams error:", error);
    return NextResponse.json(
      { error: "Failed to list teams" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams
 *
 * Create a new team.
 * Body:
 * - name: string (required, 3-50 chars)
 * - description: string (optional)
 * - color: string (optional, hex color)
 * - icon: string (optional)
 * - parentTeamId: string (optional, for sub-teams)
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    parentTeamId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateCreateTeamRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // Check team limit (only for teams user owns)
    const teamsOwned = await countTeamsOwnedByUser(session.user.id);
    if (teamsOwned >= TEAM_LIMITS.MAX_TEAMS_PER_USER) {
      return NextResponse.json(
        {
          error: `Maximum of ${TEAM_LIMITS.MAX_TEAMS_PER_USER} teams allowed`,
        },
        { status: 400 }
      );
    }

    // Note: Name uniqueness is now checked inside createTeam transaction
    // to prevent race conditions (TOCTOU vulnerability)
    const result = await createTeam({
      creatorId: session.user.id,
      name: body.name as string,
      description: body.description,
      color: body.color,
      icon: body.icon,
      parentTeamId: body.parentTeamId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Create team error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("Parent team not found")) {
        return NextResponse.json(
          { error: "Parent team not found" },
          { status: 404 }
        );
      }
      if (error.message.includes("Not authorized")) {
        return NextResponse.json(
          { error: "Not authorized to create sub-team" },
          { status: 403 }
        );
      }
      if (error.message.includes("depth")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message.includes("name already exists")) {
        return NextResponse.json(
          { error: "A team with this name already exists" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create team" },
      { status: 500 }
    );
  }
}
