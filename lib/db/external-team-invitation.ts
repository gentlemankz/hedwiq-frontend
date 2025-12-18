/**
 * External Team Invitation Database Operations
 *
 * CRUD operations for pending external team invitations.
 * These are invitations sent to users who don't have accounts yet.
 * When they sign up, the invitations are auto-processed.
 */

import { db } from "@/lib/db";
import {
  pendingExternalTeamInvitation,
  team,
  teamMember,
  user,
} from "@/lib/db/schema";
import { eq, and, sql, inArray, gt, lt } from "drizzle-orm";
import { secureRandomString } from "@/lib/utils";
import { normalizeEmail } from "@/lib/validation/invitee";
import type {
  ExternalTeamInvitation,
  ExternalInvitationWithInviter,
  ExternalInvitationWithTeam,
  ExternalInvitationStatus,
  TeamRole,
} from "@/types/team";
import { EXTERNAL_INVITE_LIMITS } from "@/types/team";
import { generateTeamMemberId } from "./team";

// ============================================================================
// ID and Token Generation
// ============================================================================

/**
 * Generates a unique external invitation ID.
 */
export function generateExternalInvitationId(): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `peti-${timestamp}-${random}`;
}

/**
 * Generates a secure token for external invitation acceptance.
 */
export function generateInvitationToken(): string {
  return secureRandomString(
    EXTERNAL_INVITE_LIMITS.TOKEN_LENGTH,
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  );
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to an ExternalTeamInvitation object.
 */
function rowToExternalInvitation(
  row: typeof pendingExternalTeamInvitation.$inferSelect
): ExternalTeamInvitation {
  return {
    id: row.id,
    teamId: row.teamId,
    email: row.email,
    role: row.role as Exclude<TeamRole, "owner">,
    invitedBy: row.invitedBy,
    invitedAt: row.invitedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    token: row.token,
    status: row.status as ExternalInvitationStatus,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedUserId: row.acceptedUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ============================================================================
// Create Operations
// ============================================================================

/**
 * Creates a new external team invitation.
 * Returns null if a pending invitation already exists for this email/team.
 */
export async function createExternalInvitation(params: {
  teamId: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  invitedBy: string;
  expirationDays?: number;
}): Promise<ExternalTeamInvitation | null> {
  const normalizedEmail = normalizeEmail(params.email);
  const expirationDays =
    params.expirationDays ?? EXTERNAL_INVITE_LIMITS.DEFAULT_EXPIRATION_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  const id = generateExternalInvitationId();
  const token = generateInvitationToken();

  try {
    const [row] = await db
      .insert(pendingExternalTeamInvitation)
      .values({
        id,
        teamId: params.teamId,
        email: normalizedEmail,
        role: params.role,
        invitedBy: params.invitedBy,
        expiresAt,
        token,
        status: "pending",
      })
      .onConflictDoNothing() // Respects the partial unique index
      .returning();

    if (!row) {
      // Conflict - pending invitation already exists
      return null;
    }

    return rowToExternalInvitation(row);
  } catch (error) {
    console.error("Failed to create external invitation:", error);
    throw error;
  }
}

/**
 * Creates multiple external team invitations.
 * Returns created invitations and failed emails.
 *
 * Note: This uses sequential inserts rather than batch insert because:
 * 1. Each invitation needs unique ID/token generation
 * 2. onConflictDoNothing doesn't return conflicted rows, making batch tracking complex
 * 3. Batch size is limited by rate limiting (MAX_INVITES_PER_HOUR = 10)
 */
export async function createExternalInvitations(params: {
  teamId: string;
  emails: string[];
  role: Exclude<TeamRole, "owner">;
  invitedBy: string;
  expirationDays?: number;
}): Promise<{
  created: ExternalTeamInvitation[];
  failed: Array<{ email: string; reason: string }>;
}> {
  const result: {
    created: ExternalTeamInvitation[];
    failed: Array<{ email: string; reason: string }>;
  } = { created: [], failed: [] };

  for (const email of params.emails) {
    try {
      const invitation = await createExternalInvitation({
        teamId: params.teamId,
        email,
        role: params.role,
        invitedBy: params.invitedBy,
        expirationDays: params.expirationDays,
      });

      if (invitation) {
        result.created.push(invitation);
      } else {
        result.failed.push({
          email,
          reason: "Pending invitation already exists",
        });
      }
    } catch (error) {
      result.failed.push({
        email,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Gets an external invitation by ID.
 */
export async function getExternalInvitationById(
  id: string
): Promise<ExternalTeamInvitation | null> {
  const [row] = await db
    .select()
    .from(pendingExternalTeamInvitation)
    .where(eq(pendingExternalTeamInvitation.id, id))
    .limit(1);

  return row ? rowToExternalInvitation(row) : null;
}

/**
 * Gets an external invitation by token.
 * Used for direct-link acceptance flow.
 */
export async function getExternalInvitationByToken(
  token: string
): Promise<ExternalTeamInvitation | null> {
  const [row] = await db
    .select()
    .from(pendingExternalTeamInvitation)
    .where(eq(pendingExternalTeamInvitation.token, token))
    .limit(1);

  return row ? rowToExternalInvitation(row) : null;
}

/**
 * Gets an external invitation by token with full team and inviter details.
 */
export async function getExternalInvitationByTokenWithDetails(
  token: string
): Promise<ExternalInvitationWithTeam | null> {
  const rows = await db
    .select({
      invitation: pendingExternalTeamInvitation,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        color: team.color,
      },
      inviter: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM team_member
        WHERE team_member.team_id = ${team.id}
        AND team_member.status = 'active'
      )::int`,
    })
    .from(pendingExternalTeamInvitation)
    .innerJoin(team, eq(team.id, pendingExternalTeamInvitation.teamId))
    .leftJoin(user, eq(user.id, pendingExternalTeamInvitation.invitedBy))
    .where(eq(pendingExternalTeamInvitation.token, token))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...rowToExternalInvitation(row.invitation),
    team: {
      id: row.team.id,
      name: row.team.name,
      description: row.team.description,
      color: row.team.color,
      memberCount: row.memberCount,
    },
    inviter: row.inviter
      ? {
          id: row.inviter.id,
          name: row.inviter.name,
          email: row.inviter.email,
        }
      : null,
  };
}

/**
 * Lists all external invitations for a team.
 */
export async function listExternalInvitationsForTeam(
  teamId: string,
  statusFilter?: ExternalInvitationStatus[]
): Promise<ExternalInvitationWithInviter[]> {
  const conditions = [eq(pendingExternalTeamInvitation.teamId, teamId)];

  if (statusFilter && statusFilter.length > 0) {
    conditions.push(
      inArray(pendingExternalTeamInvitation.status, statusFilter)
    );
  }

  const rows = await db
    .select({
      invitation: pendingExternalTeamInvitation,
      inviter: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
    .from(pendingExternalTeamInvitation)
    .leftJoin(user, eq(user.id, pendingExternalTeamInvitation.invitedBy))
    .where(and(...conditions))
    .orderBy(sql`${pendingExternalTeamInvitation.invitedAt} DESC`);

  return rows.map((row) => ({
    ...rowToExternalInvitation(row.invitation),
    inviter: row.inviter
      ? {
          id: row.inviter.id,
          name: row.inviter.name,
          email: row.inviter.email,
        }
      : null,
  }));
}

/**
 * Gets all pending external invitations for an email address.
 * Used during signup to auto-join teams.
 */
export async function getPendingInvitationsForEmail(
  email: string
): Promise<ExternalInvitationWithTeam[]> {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const rows = await db
    .select({
      invitation: pendingExternalTeamInvitation,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        color: team.color,
      },
      inviter: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM team_member
        WHERE team_member.team_id = ${team.id}
        AND team_member.status = 'active'
      )::int`,
    })
    .from(pendingExternalTeamInvitation)
    .innerJoin(team, eq(team.id, pendingExternalTeamInvitation.teamId))
    .leftJoin(user, eq(user.id, pendingExternalTeamInvitation.invitedBy))
    .where(
      and(
        eq(pendingExternalTeamInvitation.email, normalizedEmail),
        eq(pendingExternalTeamInvitation.status, "pending"),
        gt(pendingExternalTeamInvitation.expiresAt, now)
      )
    )
    .orderBy(sql`${pendingExternalTeamInvitation.invitedAt} DESC`);

  return rows.map((row) => ({
    ...rowToExternalInvitation(row.invitation),
    team: {
      id: row.team.id,
      name: row.team.name,
      description: row.team.description,
      color: row.team.color,
      memberCount: row.memberCount,
    },
    inviter: row.inviter
      ? {
          id: row.inviter.id,
          name: row.inviter.name,
          email: row.inviter.email,
        }
      : null,
  }));
}

/**
 * Counts pending external invitations for a team.
 */
export async function countPendingExternalInvitations(
  teamId: string
): Promise<number> {
  const now = new Date();
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pendingExternalTeamInvitation)
    .where(
      and(
        eq(pendingExternalTeamInvitation.teamId, teamId),
        eq(pendingExternalTeamInvitation.status, "pending"),
        gt(pendingExternalTeamInvitation.expiresAt, now)
      )
    );

  return result?.count ?? 0;
}

/**
 * Counts invitations sent in the last hour (for rate limiting).
 */
export async function countRecentInvitationsForTeam(
  teamId: string
): Promise<number> {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pendingExternalTeamInvitation)
    .where(
      and(
        eq(pendingExternalTeamInvitation.teamId, teamId),
        gt(pendingExternalTeamInvitation.invitedAt, oneHourAgo)
      )
    );

  return result?.count ?? 0;
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Accepts an external invitation.
 * Creates a team_member record and updates the invitation status.
 */
export async function acceptExternalInvitation(
  token: string,
  userId: string
): Promise<{
  success: boolean;
  invitation?: ExternalTeamInvitation;
  error?: string;
}> {
  return db.transaction(async (tx) => {
    // Get the invitation
    const [invitation] = await tx
      .select()
      .from(pendingExternalTeamInvitation)
      .where(eq(pendingExternalTeamInvitation.token, token))
      .limit(1);

    if (!invitation) {
      return { success: false, error: "Invitation not found" };
    }

    if (invitation.status !== "pending") {
      return {
        success: false,
        error: `Invitation is ${invitation.status}`,
      };
    }

    const now = new Date();
    if (invitation.expiresAt < now) {
      // Mark as expired
      await tx
        .update(pendingExternalTeamInvitation)
        .set({ status: "expired", updatedAt: now })
        .where(eq(pendingExternalTeamInvitation.id, invitation.id));

      return { success: false, error: "Invitation has expired" };
    }

    // Create team member record
    const memberId = generateTeamMemberId();
    await tx
      .insert(teamMember)
      .values({
        id: memberId,
        teamId: invitation.teamId,
        userId,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        joinedAt: now,
        status: "active",
      })
      .onConflictDoNothing();

    // Update invitation status
    const [updated] = await tx
      .update(pendingExternalTeamInvitation)
      .set({
        status: "accepted",
        acceptedAt: now,
        acceptedUserId: userId,
        updatedAt: now,
      })
      .where(eq(pendingExternalTeamInvitation.id, invitation.id))
      .returning();

    return {
      success: true,
      invitation: updated ? rowToExternalInvitation(updated) : undefined,
    };
  });
}

/**
 * Accepts all pending external invitations for an email.
 * Used during signup flow.
 */
export async function acceptAllPendingInvitationsForUser(
  userId: string,
  email: string
): Promise<{
  accepted: number;
  teamIds: string[];
}> {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  // Get all pending invitations for this email
  const pendingInvitations = await db
    .select()
    .from(pendingExternalTeamInvitation)
    .where(
      and(
        eq(pendingExternalTeamInvitation.email, normalizedEmail),
        eq(pendingExternalTeamInvitation.status, "pending"),
        gt(pendingExternalTeamInvitation.expiresAt, now)
      )
    );

  if (pendingInvitations.length === 0) {
    return { accepted: 0, teamIds: [] };
  }

  const acceptedTeamIds: string[] = [];

  // Process each invitation
  for (const invitation of pendingInvitations) {
    try {
      await db.transaction(async (tx) => {
        // Create team member record
        const memberId = generateTeamMemberId();
        await tx
          .insert(teamMember)
          .values({
            id: memberId,
            teamId: invitation.teamId,
            userId,
            role: invitation.role,
            invitedBy: invitation.invitedBy,
            joinedAt: now,
            status: "active",
          })
          .onConflictDoNothing();

        // Update invitation status
        await tx
          .update(pendingExternalTeamInvitation)
          .set({
            status: "accepted",
            acceptedAt: now,
            acceptedUserId: userId,
            updatedAt: now,
          })
          .where(eq(pendingExternalTeamInvitation.id, invitation.id));

        acceptedTeamIds.push(invitation.teamId);
      });
    } catch (error) {
      console.error(
        `Failed to accept invitation ${invitation.id}:`,
        error
      );
      // Continue processing other invitations
    }
  }

  return {
    accepted: acceptedTeamIds.length,
    teamIds: acceptedTeamIds,
  };
}

/**
 * Cancels an external invitation.
 */
export async function cancelExternalInvitation(
  invitationId: string
): Promise<boolean> {
  const [updated] = await db
    .update(pendingExternalTeamInvitation)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pendingExternalTeamInvitation.id, invitationId),
        eq(pendingExternalTeamInvitation.status, "pending")
      )
    )
    .returning({ id: pendingExternalTeamInvitation.id });

  return !!updated;
}

/**
 * Resends an external invitation (creates new token and resets expiration).
 */
export async function resendExternalInvitation(
  invitationId: string,
  expirationDays?: number
): Promise<ExternalTeamInvitation | null> {
  const days = expirationDays ?? EXTERNAL_INVITE_LIMITS.DEFAULT_EXPIRATION_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const newToken = generateInvitationToken();

  const [updated] = await db
    .update(pendingExternalTeamInvitation)
    .set({
      token: newToken,
      expiresAt,
      invitedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pendingExternalTeamInvitation.id, invitationId),
        eq(pendingExternalTeamInvitation.status, "pending")
      )
    )
    .returning();

  return updated ? rowToExternalInvitation(updated) : null;
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Marks expired invitations as expired.
 * Should be run periodically (e.g., via cron job).
 */
export async function expireOldInvitations(): Promise<number> {
  const now = new Date();

  const result = await db
    .update(pendingExternalTeamInvitation)
    .set({
      status: "expired",
      updatedAt: now,
    })
    .where(
      and(
        eq(pendingExternalTeamInvitation.status, "pending"),
        lt(pendingExternalTeamInvitation.expiresAt, now)
      )
    )
    .returning({ id: pendingExternalTeamInvitation.id });

  return result.length;
}

/**
 * Deletes old non-pending invitations (cleanup).
 * Removes invitations that have been accepted/expired/cancelled for more than 90 days.
 */
export async function cleanupOldInvitations(): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await db
    .delete(pendingExternalTeamInvitation)
    .where(
      and(
        sql`${pendingExternalTeamInvitation.status} != 'pending'`,
        lt(pendingExternalTeamInvitation.updatedAt, ninetyDaysAgo)
      )
    )
    .returning({ id: pendingExternalTeamInvitation.id });

  return result.length;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Checks if an email already has a user account.
 */
export async function emailHasAccount(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`LOWER(${user.email}) = ${normalizedEmail}`)
    .limit(1);

  return !!existingUser;
}

/**
 * Checks if a pending invitation exists for an email/team combination.
 */
export async function hasPendingInvitation(
  teamId: string,
  email: string
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const [existing] = await db
    .select({ id: pendingExternalTeamInvitation.id })
    .from(pendingExternalTeamInvitation)
    .where(
      and(
        eq(pendingExternalTeamInvitation.teamId, teamId),
        eq(pendingExternalTeamInvitation.email, normalizedEmail),
        eq(pendingExternalTeamInvitation.status, "pending"),
        gt(pendingExternalTeamInvitation.expiresAt, now)
      )
    )
    .limit(1);

  return !!existing;
}
