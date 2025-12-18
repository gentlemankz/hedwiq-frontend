import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  reorderTeams,
  batchCheckTeamMembership,
  isTeamAdmin,
} from "@/lib/db/team";
import { validateReorderTeamsRequest } from "@/lib/validation/team";

/**
 * POST /api/teams/reorder
 *
 * Reorder teams within a parent (or at root level).
 * Body:
 * - teamIds: string[] (required, team IDs in desired order)
 * - parentTeamId: string | null (optional, null for root level)
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
    teamIds?: string[];
    parentTeamId?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateReorderTeamsRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { teamIds, parentTeamId } = body;

  try {
    // If reordering within a parent team, user must be admin of parent
    if (parentTeamId) {
      const hasPermission = await isTeamAdmin(parentTeamId, session.user.id);
      if (!hasPermission) {
        return NextResponse.json(
          { error: "Not authorized to reorder teams in this parent" },
          { status: 403 }
        );
      }
    } else {
      // For root-level reorder, verify user is a member of all teams
      // PERFORMANCE: Use batch check instead of N individual queries
      const memberTeamIds = await batchCheckTeamMembership(
        teamIds!,
        session.user.id
      );

      // Find any teams user is not a member of
      const nonMemberTeams = teamIds!.filter((id) => !memberTeamIds.has(id));
      if (nonMemberTeams.length > 0) {
        return NextResponse.json(
          { error: `Not a member of team ${nonMemberTeams[0]}` },
          { status: 403 }
        );
      }
    }

    await reorderTeams(teamIds!, parentTeamId ?? null);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder teams error:", error);

    // Handle specific errors from reorderTeams
    if (error instanceof Error) {
      if (error.message.includes("same parent")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: "Failed to reorder teams" },
      { status: 500 }
    );
  }
}
