/**
 * Team Search API
 *
 * GET /api/teams/search - Search teams by name
 *
 * Performance-optimized endpoint for searching teams in larger organizations.
 * Uses indexed text search with pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { team, teamMember } from "@/lib/db/schema";
import { eq, and, sql, ilike, or } from "drizzle-orm";
import type { TeamWithMemberCount } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamSearchResult extends TeamWithMemberCount {
  /** Match relevance score (higher = better match) */
  relevance: number;
}

// ============================================================================
// GET: Search teams
// ============================================================================

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse search params
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "10", 10), 1),
    50
  );
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    // Search for teams the user is a member of
    // Uses ILIKE for case-insensitive partial matching
    // SECURITY: Escape special SQL LIKE characters to prevent injection
    const escapedQuery = query.replace(/[%_\\]/g, "\\$&");
    const searchPattern = `%${escapedQuery}%`;
    const prefixPattern = `${escapedQuery}%`;
    const lowerQuery = query.toLowerCase();

    const results = await db
      .select({
        team: team,
        memberCount: sql<number>`(
          SELECT COUNT(*) FROM team_member
          WHERE team_member.team_id = ${team.id}
          AND team_member.status = 'active'
        )::int`,
        // SECURITY: Use parameterized comparison instead of string interpolation
        relevance: sql<number>`
          CASE
            WHEN LOWER(${team.name}) = ${lowerQuery} THEN 3
            WHEN LOWER(${team.name}) LIKE ${prefixPattern.toLowerCase()} THEN 2
            ELSE 1
          END
        `,
      })
      .from(team)
      .innerJoin(
        teamMember,
        and(
          eq(teamMember.teamId, team.id),
          eq(teamMember.userId, session.user.id),
          eq(teamMember.status, "active")
        )
      )
      .where(
        or(
          ilike(team.name, searchPattern),
          ilike(team.description, searchPattern)
        )
      )
      // PERFORMANCE: Reuse relevance calculation by ordering on computed column
      .orderBy(
        sql`CASE
          WHEN LOWER(${team.name}) = ${lowerQuery} THEN 3
          WHEN LOWER(${team.name}) LIKE ${prefixPattern.toLowerCase()} THEN 2
          ELSE 1
        END DESC`,
        team.name
      )
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    // PERFORMANCE: Could be combined with main query using window functions,
    // but kept separate for clarity and to avoid complexity
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(team)
      .innerJoin(
        teamMember,
        and(
          eq(teamMember.teamId, team.id),
          eq(teamMember.userId, session.user.id),
          eq(teamMember.status, "active")
        )
      )
      .where(
        or(
          ilike(team.name, searchPattern),
          ilike(team.description, searchPattern)
        )
      );

    const teams: TeamSearchResult[] = results.map((row) => ({
      id: row.team.id,
      name: row.team.name,
      description: row.team.description,
      color: row.team.color,
      icon: row.team.icon,
      parentTeamId: row.team.parentTeamId,
      createdBy: row.team.createdBy,
      orderIndex: row.team.orderIndex,
      createdAt: row.team.createdAt.toISOString(),
      updatedAt: row.team.updatedAt.toISOString(),
      memberCount: row.memberCount,
      relevance: row.relevance,
    }));

    return NextResponse.json({
      teams,
      pagination: {
        total: countResult?.count ?? 0,
        limit,
        offset,
        hasMore: offset + results.length < (countResult?.count ?? 0),
      },
    });
  } catch (error) {
    console.error("Team search error:", error);
    return NextResponse.json(
      { error: "Failed to search teams" },
      { status: 500 }
    );
  }
}
