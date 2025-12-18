/**
 * Team Database Operations
 *
 * CRUD operations for teams, team members, and team meeting invites.
 * Handles team hierarchy, role-based access, and membership management.
 */

import { db } from "@/lib/db";
import { team, teamMember, teamMeeting, user } from "@/lib/db/schema";
import { eq, and, desc, sql, isNull, inArray, ne } from "drizzle-orm";
import { secureRandomString } from "@/lib/utils";
import type {
  Team,
  TeamMember,
  TeamWithMemberCount,
  TeamMemberWithUser,
  TeamWithMembers,
  TeamWithSubteams,
  TeamRole,
  TeamMemberStatus,
  TeamMeetingInvite,
  TeamMeetingInviteWithTeam,
} from "@/types/team";
import { TEAM_LIMITS } from "@/types/team";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique team ID.
 */
export function generateTeamId(creatorId: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `team-${creatorId.slice(0, 8)}-${timestamp}-${random}`;
}

/**
 * Generates a unique team member ID.
 */
export function generateTeamMemberId(): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `tm-${timestamp}-${random}`;
}

/**
 * Generates a unique team meeting invite ID.
 */
export function generateTeamMeetingId(): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `tmi-${timestamp}-${random}`;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to a Team object.
 */
function rowToTeam(row: typeof team.$inferSelect): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    parentTeamId: row.parentTeamId,
    createdBy: row.createdBy,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Converts a database row to a TeamMember object.
 */
function rowToTeamMember(row: typeof teamMember.$inferSelect): TeamMember {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    role: row.role as TeamRole,
    invitedBy: row.invitedBy,
    invitedAt: row.invitedAt.toISOString(),
    joinedAt: row.joinedAt?.toISOString() ?? null,
    status: row.status as TeamMemberStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Converts a database row to a TeamMeetingInvite object.
 */
function rowToTeamMeetingInvite(
  row: typeof teamMeeting.$inferSelect
): TeamMeetingInvite {
  return {
    id: row.id,
    teamId: row.teamId,
    meetingId: row.meetingId,
    invitedBy: row.invitedBy,
    invitedAt: row.invitedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ============================================================================
// Team CRUD Operations
// ============================================================================

/**
 * Creates a new team.
 * Also creates the owner membership for the creator.
 * RACE-SAFE: All checks including name uniqueness are done inside transaction.
 */
export async function createTeam(params: {
  creatorId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentTeamId?: string;
}): Promise<{ team: Team; membership: TeamMember }> {
  const teamId = generateTeamId(params.creatorId);
  const memberId = generateTeamMemberId();
  const normalizedName = params.name.trim();

  return db.transaction(async (tx) => {
    // If creating a sub-team, verify parent exists and user has permission
    if (params.parentTeamId) {
      const [parentTeam] = await tx
        .select()
        .from(team)
        .where(eq(team.id, params.parentTeamId))
        .limit(1);

      if (!parentTeam) {
        throw new Error("Parent team not found");
      }

      // Check user is admin/owner of parent team
      const [parentMembership] = await tx
        .select()
        .from(teamMember)
        .where(
          and(
            eq(teamMember.teamId, params.parentTeamId),
            eq(teamMember.userId, params.creatorId),
            eq(teamMember.status, "active"),
            inArray(teamMember.role, ["owner", "admin"])
          )
        )
        .limit(1);

      if (!parentMembership) {
        throw new Error("Not authorized to create sub-team");
      }

      // Check sub-team depth using CTE for performance
      const depth = await getTeamDepthCTE(tx, params.parentTeamId);
      if (depth >= TEAM_LIMITS.MAX_SUB_TEAM_DEPTH) {
        throw new Error(
          `Maximum sub-team depth of ${TEAM_LIMITS.MAX_SUB_TEAM_DEPTH} exceeded`
        );
      }
    }

    // RACE-SAFE: Check name uniqueness within transaction
    const [existingName] = await tx
      .select({ id: team.id })
      .from(team)
      .where(
        and(
          sql`LOWER(${team.name}) = LOWER(${normalizedName})`,
          params.parentTeamId
            ? eq(team.parentTeamId, params.parentTeamId)
            : isNull(team.parentTeamId)
        )
      )
      .limit(1);

    if (existingName) {
      throw new Error("Team name already exists");
    }

    // Get the next order index
    const [maxOrder] = await tx
      .select({ maxIndex: sql<number>`COALESCE(MAX(order_index), -1)` })
      .from(team)
      .where(
        params.parentTeamId
          ? eq(team.parentTeamId, params.parentTeamId)
          : isNull(team.parentTeamId)
      );

    const nextOrderIndex = (maxOrder?.maxIndex ?? -1) + 1;

    // Create the team
    const [createdTeam] = await tx
      .insert(team)
      .values({
        id: teamId,
        name: normalizedName,
        description: params.description?.trim() ?? null,
        color: params.color ?? null,
        icon: params.icon ?? null,
        parentTeamId: params.parentTeamId ?? null,
        createdBy: params.creatorId,
        orderIndex: nextOrderIndex,
      })
      .returning();

    // Create owner membership
    const [membership] = await tx
      .insert(teamMember)
      .values({
        id: memberId,
        teamId: teamId,
        userId: params.creatorId,
        role: "owner",
        invitedBy: params.creatorId,
        joinedAt: new Date(),
        status: "active",
      })
      .returning();

    return {
      team: rowToTeam(createdTeam),
      membership: rowToTeamMember(membership),
    };
  });
}

/**
 * Gets the depth of a team in the hierarchy using recursive CTE.
 * PERFORMANCE: Single query instead of O(depth) queries.
 */
async function getTeamDepthCTE(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  teamId: string
): Promise<number> {
  const result = await tx.execute<{ max_depth: number | null }>(sql`
    WITH RECURSIVE team_hierarchy AS (
      SELECT id, parent_team_id, 0 as depth
      FROM team
      WHERE id = ${teamId}
      UNION ALL
      SELECT t.id, t.parent_team_id, th.depth + 1
      FROM team t
      INNER JOIN team_hierarchy th ON t.id = th.parent_team_id
    )
    SELECT MAX(depth) as max_depth FROM team_hierarchy
  `);

  const maxDepth = result[0]?.max_depth;
  return maxDepth ?? 0;
}

/**
 * Gets a team by ID.
 * If userId is provided, verifies the user is a member of the team.
 */
export async function getTeamById(
  teamId: string,
  userId?: string
): Promise<Team | null> {
  const [row] = await db
    .select()
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);

  if (!row) return null;

  // If userId provided, verify membership
  if (userId) {
    const membership = await getTeamMembership(teamId, userId);
    if (!membership || membership.status !== "active") {
      return null;
    }
  }

  return rowToTeam(row);
}

/**
 * Gets team members with user details.
 * Verifies the requesting user is a member of the team.
 */
export async function getTeamMembers(
  teamId: string,
  userId: string
): Promise<TeamMemberWithUser[]> {
  // Verify user is a member
  const membership = await getTeamMembership(teamId, userId);
  if (!membership || membership.status !== "active") {
    return [];
  }

  return listTeamMembers(teamId);
}

/**
 * Gets a team with member count.
 */
export async function getTeamWithMemberCount(
  teamId: string
): Promise<TeamWithMemberCount | null> {
  const [row] = await db
    .select({
      team: team,
      memberCount: sql<number>`COUNT(CASE WHEN ${teamMember.status} = 'active' THEN 1 END)::int`,
    })
    .from(team)
    .leftJoin(teamMember, eq(teamMember.teamId, team.id))
    .where(eq(team.id, teamId))
    .groupBy(team.id)
    .limit(1);

  if (!row) return null;

  return {
    ...rowToTeam(row.team),
    memberCount: row.memberCount,
  };
}

/**
 * Gets a team with full member details.
 */
export async function getTeamWithMembers(
  teamId: string
): Promise<TeamWithMembers | null> {
  const teamData = await getTeamById(teamId);
  if (!teamData) return null;

  const members = await listTeamMembers(teamId);

  return {
    ...teamData,
    members,
  };
}

/**
 * Lists teams for a user (teams where they are an active member).
 */
export async function listTeamsForUser(
  userId: string
): Promise<TeamWithMemberCount[]> {
  const rows = await db
    .select({
      team: team,
      memberCount: sql<number>`COUNT(CASE WHEN tm2.status = 'active' THEN 1 END)::int`,
    })
    .from(team)
    .innerJoin(
      teamMember,
      and(
        eq(teamMember.teamId, team.id),
        eq(teamMember.userId, userId),
        eq(teamMember.status, "active")
      )
    )
    .leftJoin(
      sql`team_member tm2`,
      sql`tm2.team_id = ${team.id}`
    )
    .groupBy(team.id)
    .orderBy(team.orderIndex, desc(team.createdAt));

  return rows.map((row) => ({
    ...rowToTeam(row.team),
    memberCount: row.memberCount,
  }));
}

/**
 * Lists root-level teams for a user (no parent team).
 */
export async function listRootTeamsForUser(
  userId: string
): Promise<TeamWithMemberCount[]> {
  const rows = await db
    .select({
      team: team,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM team_member
        WHERE team_member.team_id = ${team.id}
        AND team_member.status = 'active'
      )::int`,
    })
    .from(team)
    .innerJoin(
      teamMember,
      and(
        eq(teamMember.teamId, team.id),
        eq(teamMember.userId, userId),
        eq(teamMember.status, "active")
      )
    )
    .where(isNull(team.parentTeamId))
    .groupBy(team.id)
    .orderBy(team.orderIndex, desc(team.createdAt));

  return rows.map((row) => ({
    ...rowToTeam(row.team),
    memberCount: row.memberCount,
  }));
}

/**
 * Lists sub-teams of a team.
 */
export async function listSubteams(
  parentTeamId: string
): Promise<TeamWithMemberCount[]> {
  const rows = await db
    .select({
      team: team,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM team_member
        WHERE team_member.team_id = ${team.id}
        AND team_member.status = 'active'
      )::int`,
    })
    .from(team)
    .where(eq(team.parentTeamId, parentTeamId))
    .groupBy(team.id)
    .orderBy(team.orderIndex, desc(team.createdAt));

  return rows.map((row) => ({
    ...rowToTeam(row.team),
    memberCount: row.memberCount,
  }));
}

/**
 * Gets the full team hierarchy for a user.
 * Returns nested structure with sub-teams.
 */
export async function getTeamHierarchyForUser(
  userId: string
): Promise<TeamWithSubteams[]> {
  // Get all teams the user is a member of
  const allTeams = await listTeamsForUser(userId);

  // Build a map for quick lookup
  const teamMap = new Map<string, TeamWithSubteams>();
  allTeams.forEach((t) => {
    teamMap.set(t.id, { ...t, subteams: [] });
  });

  // Build hierarchy
  const rootTeams: TeamWithSubteams[] = [];

  allTeams.forEach((t) => {
    const teamNode = teamMap.get(t.id)!;
    if (t.parentTeamId && teamMap.has(t.parentTeamId)) {
      // Add as sub-team
      teamMap.get(t.parentTeamId)!.subteams.push(teamNode);
    } else if (!t.parentTeamId) {
      // Root team
      rootTeams.push(teamNode);
    } else {
      // Parent not accessible to user, treat as root for this user
      rootTeams.push(teamNode);
    }
  });

  // Sort sub-teams by orderIndex
  const sortSubteams = (teams: TeamWithSubteams[]) => {
    teams.sort((a, b) => a.orderIndex - b.orderIndex);
    teams.forEach((t) => sortSubteams(t.subteams));
  };

  sortSubteams(rootTeams);

  return rootTeams;
}

/**
 * Updates a team.
 */
export async function updateTeam(
  teamId: string,
  updates: {
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
  }
): Promise<Team | null> {
  const updateData: Partial<typeof team.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() ?? null;
  }
  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }
  if (updates.icon !== undefined) {
    updateData.icon = updates.icon;
  }

  const [row] = await db
    .update(team)
    .set(updateData)
    .where(eq(team.id, teamId))
    .returning();

  return row ? rowToTeam(row) : null;
}

/**
 * Deletes a team and all its sub-teams.
 * Returns the count of deleted sub-teams.
 */
export async function deleteTeam(
  teamId: string
): Promise<{ success: boolean; subteamsDeleted: number }> {
  return db.transaction(async (tx) => {
    // Get all sub-teams recursively
    const subteamIds = await getAllSubteamIds(tx, teamId);

    // Delete team members for all teams
    const allTeamIds = [teamId, ...subteamIds];
    await tx
      .delete(teamMember)
      .where(inArray(teamMember.teamId, allTeamIds));

    // Delete team meeting invites for all teams
    await tx
      .delete(teamMeeting)
      .where(inArray(teamMeeting.teamId, allTeamIds));

    // Delete sub-teams first (due to FK constraint)
    if (subteamIds.length > 0) {
      await tx.delete(team).where(inArray(team.id, subteamIds));
    }

    // Delete the main team
    const [deleted] = await tx
      .delete(team)
      .where(eq(team.id, teamId))
      .returning({ id: team.id });

    return {
      success: !!deleted,
      subteamsDeleted: subteamIds.length,
    };
  });
}

/**
 * Gets all sub-team IDs recursively using CTE.
 * PERFORMANCE: Single query instead of O(n) queries where n = number of subteams.
 */
async function getAllSubteamIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  teamId: string
): Promise<string[]> {
  const result = await tx.execute<{ id: string }>(sql`
    WITH RECURSIVE subteams AS (
      SELECT id
      FROM team
      WHERE parent_team_id = ${teamId}
      UNION ALL
      SELECT t.id
      FROM team t
      INNER JOIN subteams s ON t.parent_team_id = s.id
    )
    SELECT id FROM subteams
  `);

  return result.map((row) => row.id);
}

/**
 * Reorders teams within a parent.
 * SECURITY: Uses parameterized queries to prevent SQL injection.
 */
export async function reorderTeams(
  teamIds: string[],
  parentTeamId: string | null
): Promise<boolean> {
  if (teamIds.length === 0) return true;

  // Verify all teams exist and belong to the same parent
  const teamsToReorder = await db
    .select({ id: team.id, parentTeamId: team.parentTeamId })
    .from(team)
    .where(inArray(team.id, teamIds));

  // Verify all teams belong to the specified parent
  for (const t of teamsToReorder) {
    if (t.parentTeamId !== parentTeamId) {
      throw new Error("All teams must belong to the same parent");
    }
  }

  // Update each team's order index using parameterized update
  // This is safe from SQL injection as we use proper Drizzle queries
  await db.transaction(async (tx) => {
    for (let i = 0; i < teamIds.length; i++) {
      await tx
        .update(team)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(
          and(
            eq(team.id, teamIds[i]),
            parentTeamId
              ? eq(team.parentTeamId, parentTeamId)
              : isNull(team.parentTeamId)
          )
        );
    }
  });

  return true;
}

// ============================================================================
// Team Member Operations
// ============================================================================

/**
 * Lists members of a team.
 */
export async function listTeamMembers(
  teamId: string
): Promise<TeamMemberWithUser[]> {
  const rows = await db
    .select({
      member: teamMember,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(eq(teamMember.teamId, teamId))
    .orderBy(
      sql`CASE ${teamMember.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
      desc(teamMember.joinedAt)
    );

  return rows.map((row) => ({
    ...rowToTeamMember(row.member),
    user: row.user,
  }));
}

/**
 * Gets a user's membership in a team.
 */
export async function getTeamMembership(
  teamId: string,
  userId: string
): Promise<TeamMember | null> {
  const [row] = await db
    .select()
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);

  return row ? rowToTeamMember(row) : null;
}

/**
 * Gets a team member by ID.
 */
export async function getTeamMemberById(
  memberId: string
): Promise<TeamMember | null> {
  const [row] = await db
    .select()
    .from(teamMember)
    .where(eq(teamMember.id, memberId))
    .limit(1);

  return row ? rowToTeamMember(row) : null;
}

/**
 * Invites a user to a team.
 * If the user was previously a member but left, re-invites them.
 * SECURITY: Prevents self-invitation (must be checked by caller).
 */
export async function inviteUserToTeam(params: {
  teamId: string;
  userId: string;
  invitedBy: string;
  role?: TeamRole;
}): Promise<TeamMember> {
  // Check for existing membership
  const existing = await getTeamMembership(params.teamId, params.userId);

  if (existing) {
    if (existing.status === "active") {
      // Already an active member - return existing
      return existing;
    }

    if (existing.status === "left" || existing.status === "pending") {
      // Re-invite: update the existing record to pending
      const [updated] = await db
        .update(teamMember)
        .set({
          status: "pending",
          role: params.role ?? "member",
          invitedBy: params.invitedBy,
          invitedAt: new Date(),
          joinedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(teamMember.id, existing.id))
        .returning();

      return rowToTeamMember(updated);
    }
  }

  // New invitation
  const memberId = generateTeamMemberId();

  const [row] = await db
    .insert(teamMember)
    .values({
      id: memberId,
      teamId: params.teamId,
      userId: params.userId,
      role: params.role ?? "member",
      invitedBy: params.invitedBy,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  // If no row returned due to race condition, fetch the existing record
  if (!row) {
    const existingAfterRace = await getTeamMembership(
      params.teamId,
      params.userId
    );
    if (existingAfterRace) return existingAfterRace;
    throw new Error("Failed to create team membership");
  }

  return rowToTeamMember(row);
}

/**
 * Invites a user to a team by email.
 * Returns null if user with that email doesn't exist.
 * SECURITY: Uses case-insensitive email comparison.
 */
export async function inviteUserByEmail(params: {
  teamId: string;
  email: string;
  invitedBy: string;
  role?: TeamRole;
}): Promise<TeamMember | null> {
  const normalizedEmail = params.email.toLowerCase().trim();

  // Find user by email (case-insensitive)
  const [foundUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`LOWER(${user.email}) = ${normalizedEmail}`)
    .limit(1);

  if (!foundUser) {
    return null;
  }

  return inviteUserToTeam({
    teamId: params.teamId,
    userId: foundUser.id,
    invitedBy: params.invitedBy,
    role: params.role,
  });
}

/**
 * Accepts a team invitation (changes status from pending to active).
 */
export async function acceptTeamInvitation(
  teamId: string,
  userId: string
): Promise<TeamMember | null> {
  const [row] = await db
    .update(teamMember)
    .set({
      status: "active",
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(teamMember.teamId, teamId),
        eq(teamMember.userId, userId),
        eq(teamMember.status, "pending")
      )
    )
    .returning();

  return row ? rowToTeamMember(row) : null;
}

/**
 * Updates a team member's role.
 */
export async function updateMemberRole(
  teamId: string,
  userId: string,
  newRole: TeamRole
): Promise<TeamMember | null> {
  const [row] = await db
    .update(teamMember)
    .set({
      role: newRole,
      updatedAt: new Date(),
    })
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .returning();

  return row ? rowToTeamMember(row) : null;
}

/**
 * Removes a member from a team (sets status to 'left').
 */
export async function removeMemberFromTeam(
  teamId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .update(teamMember)
    .set({
      status: "left",
      updatedAt: new Date(),
    })
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .returning({ id: teamMember.id });

  return !!row;
}

/**
 * Transfers team ownership to another member.
 */
export async function transferOwnership(
  teamId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Verify current owner
    const [currentOwner] = await tx
      .select()
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, teamId),
          eq(teamMember.userId, currentOwnerId),
          eq(teamMember.role, "owner")
        )
      )
      .limit(1);

    if (!currentOwner) {
      throw new Error("Current user is not the team owner");
    }

    // Verify new owner is an active member
    const [newOwner] = await tx
      .select()
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, teamId),
          eq(teamMember.userId, newOwnerId),
          eq(teamMember.status, "active")
        )
      )
      .limit(1);

    if (!newOwner) {
      throw new Error("New owner must be an active team member");
    }

    // Demote current owner to admin
    await tx
      .update(teamMember)
      .set({ role: "admin", updatedAt: new Date() })
      .where(
        and(eq(teamMember.teamId, teamId), eq(teamMember.userId, currentOwnerId))
      );

    // Promote new owner
    await tx
      .update(teamMember)
      .set({ role: "owner", updatedAt: new Date() })
      .where(
        and(eq(teamMember.teamId, teamId), eq(teamMember.userId, newOwnerId))
      );

    // Update team createdBy
    await tx
      .update(team)
      .set({ createdBy: newOwnerId, updatedAt: new Date() })
      .where(eq(team.id, teamId));

    return true;
  });
}

/**
 * Counts active members in a team.
 */
export async function countActiveMembers(teamId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.status, "active")));

  return result?.count ?? 0;
}

/**
 * Counts teams owned by a user.
 */
export async function countTeamsOwnedByUser(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(teamMember)
    .where(
      and(
        eq(teamMember.userId, userId),
        eq(teamMember.role, "owner"),
        eq(teamMember.status, "active")
      )
    );

  return result?.count ?? 0;
}

// ============================================================================
// Team Meeting Operations
// ============================================================================

/**
 * Invites a team to a meeting.
 */
export async function inviteTeamToMeeting(params: {
  teamId: string;
  meetingId: string;
  invitedBy: string;
}): Promise<TeamMeetingInvite> {
  const inviteId = generateTeamMeetingId();

  const [row] = await db
    .insert(teamMeeting)
    .values({
      id: inviteId,
      teamId: params.teamId,
      meetingId: params.meetingId,
      invitedBy: params.invitedBy,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // Already invited
    const [existing] = await db
      .select()
      .from(teamMeeting)
      .where(
        and(
          eq(teamMeeting.teamId, params.teamId),
          eq(teamMeeting.meetingId, params.meetingId)
        )
      )
      .limit(1);

    if (existing) return rowToTeamMeetingInvite(existing);
    throw new Error("Failed to create team meeting invite");
  }

  return rowToTeamMeetingInvite(row);
}

/**
 * Lists team invites for a meeting.
 */
export async function listTeamInvitesForMeeting(
  meetingId: string
): Promise<TeamMeetingInviteWithTeam[]> {
  const rows = await db
    .select({
      invite: teamMeeting,
      team: team,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM team_member
        WHERE team_member.team_id = ${team.id}
        AND team_member.status = 'active'
      )::int`,
    })
    .from(teamMeeting)
    .innerJoin(team, eq(team.id, teamMeeting.teamId))
    .where(eq(teamMeeting.meetingId, meetingId))
    .orderBy(desc(teamMeeting.invitedAt));

  return rows.map((row) => ({
    ...rowToTeamMeetingInvite(row.invite),
    team: {
      ...rowToTeam(row.team),
      memberCount: row.memberCount,
    },
  }));
}

/**
 * Removes a team invite from a meeting.
 */
export async function removeTeamFromMeeting(
  teamId: string,
  meetingId: string
): Promise<boolean> {
  const [row] = await db
    .delete(teamMeeting)
    .where(
      and(eq(teamMeeting.teamId, teamId), eq(teamMeeting.meetingId, meetingId))
    )
    .returning({ id: teamMeeting.id });

  return !!row;
}

/**
 * Gets active members of a team for meeting invitations.
 */
export async function getActiveTeamMembersForMeeting(
  teamId: string
): Promise<Array<{ userId: string; email: string; name: string }>> {
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.status, "active")));

  return rows;
}

// ============================================================================
// Permission Checks
// ============================================================================

/**
 * Checks if a user has at least the specified role in a team.
 */
export async function hasTeamRole(
  teamId: string,
  userId: string,
  minRole: TeamRole
): Promise<boolean> {
  const membership = await getTeamMembership(teamId, userId);

  if (!membership || membership.status !== "active") {
    return false;
  }

  const roleHierarchy: Record<TeamRole, number> = {
    owner: 3,
    admin: 2,
    member: 1,
  };

  return roleHierarchy[membership.role] >= roleHierarchy[minRole];
}

/**
 * Checks if a user is the owner of a team.
 */
export async function isTeamOwner(
  teamId: string,
  userId: string
): Promise<boolean> {
  return hasTeamRole(teamId, userId, "owner");
}

/**
 * Checks if a user is an admin or owner of a team.
 */
export async function isTeamAdmin(
  teamId: string,
  userId: string
): Promise<boolean> {
  return hasTeamRole(teamId, userId, "admin");
}

/**
 * Checks if a user is a member (any role) of a team.
 */
export async function isTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  return hasTeamRole(teamId, userId, "member");
}

/**
 * Batch checks if a user is a member of multiple teams.
 * PERFORMANCE: Single query instead of N queries.
 * @returns Set of team IDs where the user is an active member
 */
export async function batchCheckTeamMembership(
  teamIds: string[],
  userId: string
): Promise<Set<string>> {
  if (teamIds.length === 0) return new Set();

  const memberships = await db
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(
      and(
        inArray(teamMember.teamId, teamIds),
        eq(teamMember.userId, userId),
        eq(teamMember.status, "active")
      )
    );

  return new Set(memberships.map((m) => m.teamId));
}

/**
 * Checks if a team name already exists for the same parent.
 */
export async function teamNameExists(
  name: string,
  parentTeamId: string | null,
  excludeTeamId?: string
): Promise<boolean> {
  const normalizedName = name.trim().toLowerCase();

  const conditions = [sql`LOWER(${team.name}) = ${normalizedName}`];

  if (parentTeamId) {
    conditions.push(eq(team.parentTeamId, parentTeamId));
  } else {
    conditions.push(isNull(team.parentTeamId));
  }

  if (excludeTeamId) {
    conditions.push(ne(team.id, excludeTeamId));
  }

  const [existing] = await db
    .select({ id: team.id })
    .from(team)
    .where(and(...conditions))
    .limit(1);

  return !!existing;
}
