/**
 * Agent Builder Database Operations
 *
 * CRUD operations for agents, schedules, triggers, and executions.
 * Handles agent lifecycle management for the Agent Builder feature.
 */

import { db } from "@/lib/db";
import {
  agent,
  agentSchedule,
  agentTrigger,
  agentExecution,
  meetingFolder,
  team,
} from "@/lib/db/schema";
import { eq, and, desc, sql, asc, lt, lte, or, isNull } from "drizzle-orm";
import { secureRandomString } from "@/lib/utils";
import type {
  Agent,
  AgentSchedule,
  AgentTrigger,
  AgentExecution,
  AgentWithCounts,
  AgentWithDetails,
  AgentTriggerWithScope,
  AgentScheduleType,
  AgentTriggerType,
  AgentExecutionTriggeredBy,
  AgentExecutionStatus,
  AgentModel,
  AgentExecutionInputContext,
  AgentExecutionOutputResult,
} from "@/types/agent";
import { AGENT_LIMITS } from "@/types/agent";
import { normalizeServices } from "@/lib/validation/agent";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique agent ID.
 */
export function generateAgentId(userId: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `agent-${userId.slice(0, 8)}-${timestamp}-${random}`;
}

/**
 * Generates a unique agent schedule ID.
 */
export function generateScheduleId(agentId: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `sched-${agentId.slice(6, 14)}-${timestamp}-${random}`;
}

/**
 * Generates a unique agent trigger ID.
 */
export function generateTriggerId(agentId: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `trig-${agentId.slice(6, 14)}-${timestamp}-${random}`;
}

/**
 * Generates a unique agent execution ID.
 */
export function generateExecutionId(agentId: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `exec-${agentId.slice(6, 14)}-${timestamp}-${random}`;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to an Agent object.
 */
function rowToAgent(row: typeof agent.$inferSelect): Agent {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    referencedFolders: row.referencedFolders,
    referencedTeams: row.referencedTeams,
    referencedServices: row.referencedServices,
    model: row.model as AgentModel,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Converts a database row to an AgentSchedule object.
 */
function rowToAgentSchedule(row: typeof agentSchedule.$inferSelect): AgentSchedule {
  return {
    id: row.id,
    agentId: row.agentId,
    scheduleType: row.scheduleType as AgentScheduleType,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    hour: row.hour,
    minute: row.minute,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    timezone: row.timezone ?? "UTC",
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Converts a database row to an AgentTrigger object.
 */
function rowToAgentTrigger(row: typeof agentTrigger.$inferSelect): AgentTrigger {
  return {
    id: row.id,
    agentId: row.agentId,
    triggerType: row.triggerType as AgentTriggerType,
    scopeFolderId: row.scopeFolderId,
    scopeTeamId: row.scopeTeamId,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Converts a database row to an AgentExecution object.
 */
function rowToAgentExecution(row: typeof agentExecution.$inferSelect): AgentExecution {
  return {
    id: row.id,
    agentId: row.agentId,
    triggeredBy: row.triggeredBy as AgentExecutionTriggeredBy,
    scheduleId: row.scheduleId,
    triggerId: row.triggerId,
    status: row.status as AgentExecutionStatus,
    inputContext: row.inputContext as AgentExecutionInputContext | null,
    outputResult: row.outputResult as AgentExecutionOutputResult | null,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

// ============================================================================
// Agent CRUD Operations
// ============================================================================

/**
 * Creates a new agent.
 * Uses a transaction to prevent race conditions on agent limit check.
 */
export async function createAgent(params: {
  userId: string;
  name: string;
  description?: string;
  instructions: string;
  referencedFolders?: string[];
  referencedTeams?: string[];
  referencedServices?: string[];
  model?: AgentModel;
}): Promise<Agent> {
  const agentId = generateAgentId(params.userId);
  const normalizedName = params.name.trim();

  // Use transaction to prevent race condition between count and insert
  const row = await db.transaction(async (tx) => {
    // Check agent limit within transaction
    const [countResult] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(agent)
      .where(eq(agent.userId, params.userId));

    const agentCount = countResult?.count ?? 0;
    if (agentCount >= AGENT_LIMITS.MAX_AGENTS_PER_USER) {
      throw new Error(`Maximum of ${AGENT_LIMITS.MAX_AGENTS_PER_USER} agents allowed per user`);
    }

    const [insertedRow] = await tx
      .insert(agent)
      .values({
        id: agentId,
        userId: params.userId,
        name: normalizedName,
        description: params.description?.trim() ?? null,
        instructions: params.instructions,
        referencedFolders: params.referencedFolders ?? null,
        referencedTeams: params.referencedTeams ?? null,
        referencedServices: params.referencedServices ? normalizeServices(params.referencedServices) : null,
        model: params.model ?? "gpt-4o",
        isActive: false,
      })
      .returning();

    return insertedRow;
  });

  return rowToAgent(row);
}

/**
 * Gets an agent by ID.
 * If userId is provided, verifies the user owns the agent.
 */
export async function getAgentById(
  agentId: string,
  userId?: string
): Promise<Agent | null> {
  const conditions = [eq(agent.id, agentId)];
  if (userId) {
    conditions.push(eq(agent.userId, userId));
  }

  const [row] = await db
    .select()
    .from(agent)
    .where(and(...conditions))
    .limit(1);

  return row ? rowToAgent(row) : null;
}

/**
 * Lists all agents for a user with counts.
 */
export async function listAgentsForUser(userId: string): Promise<AgentWithCounts[]> {
  const rows = await db
    .select({
      agent: agent,
      scheduleCount: sql<number>`(
        SELECT COUNT(*) FROM agent_schedule
        WHERE agent_schedule.agent_id = ${agent.id}
      )::int`,
      triggerCount: sql<number>`(
        SELECT COUNT(*) FROM agent_trigger
        WHERE agent_trigger.agent_id = ${agent.id}
      )::int`,
      executionCount: sql<number>`(
        SELECT COUNT(*) FROM agent_execution
        WHERE agent_execution.agent_id = ${agent.id}
      )::int`,
      lastExecutionAt: sql<Date | null>`(
        SELECT MAX(created_at) FROM agent_execution
        WHERE agent_execution.agent_id = ${agent.id}
      )`,
    })
    .from(agent)
    .where(eq(agent.userId, userId))
    .orderBy(desc(agent.createdAt));

  return rows.map((row) => ({
    ...rowToAgent(row.agent),
    scheduleCount: row.scheduleCount,
    triggerCount: row.triggerCount,
    executionCount: row.executionCount,
    lastExecutionAt: row.lastExecutionAt?.toISOString() ?? null,
  }));
}

/**
 * Gets an agent with full details (schedules, triggers, recent executions).
 */
export async function getAgentWithDetails(
  agentId: string,
  userId?: string
): Promise<AgentWithDetails | null> {
  const agentData = await getAgentById(agentId, userId);
  if (!agentData) return null;

  // Fetch related data in parallel
  const [schedules, triggers, recentExecutions] = await Promise.all([
    listSchedulesForAgent(agentId),
    listTriggersForAgent(agentId),
    listExecutionsForAgent(agentId, 10),
  ]);

  return {
    ...agentData,
    schedules,
    triggers,
    recentExecutions,
  };
}

/**
 * Updates an agent.
 */
export async function updateAgent(
  agentId: string,
  userId: string,
  updates: {
    name?: string;
    description?: string | null;
    instructions?: string;
    referencedFolders?: string[] | null;
    referencedTeams?: string[] | null;
    referencedServices?: string[] | null;
    model?: AgentModel;
    isActive?: boolean;
  }
): Promise<Agent | null> {
  const updateData: Partial<typeof agent.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() ?? null;
  }
  if (updates.instructions !== undefined) {
    updateData.instructions = updates.instructions;
  }
  if (updates.referencedFolders !== undefined) {
    updateData.referencedFolders = updates.referencedFolders;
  }
  if (updates.referencedTeams !== undefined) {
    updateData.referencedTeams = updates.referencedTeams;
  }
  if (updates.referencedServices !== undefined) {
    updateData.referencedServices = updates.referencedServices
      ? normalizeServices(updates.referencedServices)
      : null;
  }
  if (updates.model !== undefined) {
    updateData.model = updates.model;
  }
  if (updates.isActive !== undefined) {
    updateData.isActive = updates.isActive;
  }

  const [row] = await db
    .update(agent)
    .set(updateData)
    .where(and(eq(agent.id, agentId), eq(agent.userId, userId)))
    .returning();

  return row ? rowToAgent(row) : null;
}

/**
 * Deletes an agent and all related data (cascades via FK).
 */
export async function deleteAgent(
  agentId: string,
  userId: string
): Promise<boolean> {
  const [deleted] = await db
    .delete(agent)
    .where(and(eq(agent.id, agentId), eq(agent.userId, userId)))
    .returning({ id: agent.id });

  return !!deleted;
}

/**
 * Counts agents owned by a user.
 */
export async function countAgentsOwnedByUser(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(agent)
    .where(eq(agent.userId, userId));

  return result?.count ?? 0;
}

// ============================================================================
// Agent Schedule Operations
// ============================================================================

/**
 * Creates an agent schedule.
 */
export async function createAgentSchedule(params: {
  agentId: string;
  scheduleType: AgentScheduleType;
  scheduledAt?: Date;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone?: string;
}): Promise<AgentSchedule> {
  // Check schedule limit
  const scheduleCount = await countSchedulesForAgent(params.agentId);
  if (scheduleCount >= AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT) {
    throw new Error(
      `Maximum of ${AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT} schedules allowed per agent`
    );
  }

  const scheduleId = generateScheduleId(params.agentId);

  // Calculate next run time
  const nextRunAt = calculateNextRunTime(params);

  const [row] = await db
    .insert(agentSchedule)
    .values({
      id: scheduleId,
      agentId: params.agentId,
      scheduleType: params.scheduleType,
      scheduledAt: params.scheduledAt ?? null,
      hour: params.hour ?? null,
      minute: params.minute ?? null,
      dayOfWeek: params.dayOfWeek ?? null,
      dayOfMonth: params.dayOfMonth ?? null,
      timezone: params.timezone ?? "UTC",
      nextRunAt,
      isEnabled: true,
    })
    .returning();

  return rowToAgentSchedule(row);
}

/**
 * Gets a schedule by ID.
 */
export async function getScheduleById(scheduleId: string): Promise<AgentSchedule | null> {
  const [row] = await db
    .select()
    .from(agentSchedule)
    .where(eq(agentSchedule.id, scheduleId))
    .limit(1);

  return row ? rowToAgentSchedule(row) : null;
}

/**
 * Lists schedules for an agent.
 */
export async function listSchedulesForAgent(agentId: string): Promise<AgentSchedule[]> {
  const rows = await db
    .select()
    .from(agentSchedule)
    .where(eq(agentSchedule.agentId, agentId))
    .orderBy(desc(agentSchedule.createdAt));

  return rows.map(rowToAgentSchedule);
}

/**
 * Updates an agent schedule.
 */
export async function updateAgentSchedule(
  scheduleId: string,
  updates: {
    scheduleType?: AgentScheduleType;
    scheduledAt?: Date | null;
    hour?: number | null;
    minute?: number | null;
    dayOfWeek?: number | null;
    dayOfMonth?: number | null;
    timezone?: string;
    isEnabled?: boolean;
  }
): Promise<AgentSchedule | null> {
  // Get current schedule to merge with updates
  const current = await getScheduleById(scheduleId);
  if (!current) return null;

  const updateData: Partial<typeof agentSchedule.$inferInsert> = {};

  if (updates.scheduleType !== undefined) {
    updateData.scheduleType = updates.scheduleType;
  }
  if (updates.scheduledAt !== undefined) {
    updateData.scheduledAt = updates.scheduledAt;
  }
  if (updates.hour !== undefined) {
    updateData.hour = updates.hour;
  }
  if (updates.minute !== undefined) {
    updateData.minute = updates.minute;
  }
  if (updates.dayOfWeek !== undefined) {
    updateData.dayOfWeek = updates.dayOfWeek;
  }
  if (updates.dayOfMonth !== undefined) {
    updateData.dayOfMonth = updates.dayOfMonth;
  }
  if (updates.timezone !== undefined) {
    updateData.timezone = updates.timezone;
  }
  if (updates.isEnabled !== undefined) {
    updateData.isEnabled = updates.isEnabled;
  }

  // Recalculate next run time if schedule parameters changed
  if (
    updates.scheduleType !== undefined ||
    updates.scheduledAt !== undefined ||
    updates.hour !== undefined ||
    updates.minute !== undefined ||
    updates.dayOfWeek !== undefined ||
    updates.dayOfMonth !== undefined ||
    updates.timezone !== undefined
  ) {
    const mergedParams = {
      scheduleType: updates.scheduleType ?? (current.scheduleType as AgentScheduleType),
      scheduledAt: updates.scheduledAt ?? (current.scheduledAt ? new Date(current.scheduledAt) : undefined),
      hour: updates.hour ?? current.hour ?? undefined,
      minute: updates.minute ?? current.minute ?? undefined,
      dayOfWeek: updates.dayOfWeek ?? current.dayOfWeek ?? undefined,
      dayOfMonth: updates.dayOfMonth ?? current.dayOfMonth ?? undefined,
      timezone: updates.timezone ?? current.timezone,
    };
    updateData.nextRunAt = calculateNextRunTime(mergedParams);
  }

  const [row] = await db
    .update(agentSchedule)
    .set(updateData)
    .where(eq(agentSchedule.id, scheduleId))
    .returning();

  return row ? rowToAgentSchedule(row) : null;
}

/**
 * Deletes an agent schedule.
 */
export async function deleteAgentSchedule(scheduleId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(agentSchedule)
    .where(eq(agentSchedule.id, scheduleId))
    .returning({ id: agentSchedule.id });

  return !!deleted;
}

/**
 * Updates a schedule after it runs.
 */
export async function updateScheduleAfterRun(scheduleId: string): Promise<AgentSchedule | null> {
  const current = await getScheduleById(scheduleId);
  if (!current) return null;

  // Calculate next run time
  const nextRunAt = calculateNextRunTime({
    scheduleType: current.scheduleType as AgentScheduleType,
    scheduledAt: current.scheduledAt ? new Date(current.scheduledAt) : undefined,
    hour: current.hour ?? undefined,
    minute: current.minute ?? undefined,
    dayOfWeek: current.dayOfWeek ?? undefined,
    dayOfMonth: current.dayOfMonth ?? undefined,
    timezone: current.timezone,
  });

  const [row] = await db
    .update(agentSchedule)
    .set({
      lastRunAt: new Date(),
      nextRunAt,
    })
    .where(eq(agentSchedule.id, scheduleId))
    .returning();

  return row ? rowToAgentSchedule(row) : null;
}

/**
 * Counts schedules for an agent.
 */
export async function countSchedulesForAgent(agentId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(agentSchedule)
    .where(eq(agentSchedule.agentId, agentId));

  return result?.count ?? 0;
}

/**
 * Gets all schedules that are due to run.
 */
export async function getDueSchedules(beforeTime?: Date): Promise<Array<AgentSchedule & { agent: Agent }>> {
  const time = beforeTime ?? new Date();

  const rows = await db
    .select({
      schedule: agentSchedule,
      agent: agent,
    })
    .from(agentSchedule)
    .innerJoin(agent, eq(agent.id, agentSchedule.agentId))
    .where(
      and(
        eq(agentSchedule.isEnabled, true),
        eq(agent.isActive, true),
        lte(agentSchedule.nextRunAt, time)
      )
    )
    .orderBy(asc(agentSchedule.nextRunAt));

  return rows.map((row) => ({
    ...rowToAgentSchedule(row.schedule),
    agent: rowToAgent(row.agent),
  }));
}

/**
 * Calculates the next run time for a schedule.
 *
 * TODO: Timezone support is currently not implemented. The `timezone` parameter
 * is accepted but not applied. All calculations use the server's local timezone.
 * For proper timezone support, consider using `date-fns-tz` or `luxon` to:
 * 1. Convert the scheduled time from the user's timezone to UTC for storage
 * 2. Calculate next run time in the user's timezone context
 * 3. Return UTC timestamp that corresponds to the correct local time
 */
function calculateNextRunTime(params: {
  scheduleType: AgentScheduleType;
  scheduledAt?: Date;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone?: string;
}): Date | null {
  // Note: timezone parameter is currently ignored - see TODO above
  const now = new Date();

  switch (params.scheduleType) {
    case "once":
      // For one-time schedules, return the scheduled time if it's in the future
      if (params.scheduledAt && params.scheduledAt > now) {
        return params.scheduledAt;
      }
      return null;

    case "hourly": {
      const next = new Date(now);
      next.setMinutes(params.minute ?? 0, 0, 0);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
      return next;
    }

    case "daily": {
      const next = new Date(now);
      next.setHours(params.hour ?? 9, params.minute ?? 0, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    case "weekly": {
      const next = new Date(now);
      const targetDay = params.dayOfWeek ?? 1; // Default to Monday
      const daysUntilTarget = (targetDay - next.getDay() + 7) % 7;

      if (daysUntilTarget === 0) {
        // Same day as target - check if scheduled time has passed
        next.setHours(params.hour ?? 9, params.minute ?? 0, 0, 0);
        if (next <= now) {
          // Time has passed, schedule for next week
          next.setDate(next.getDate() + 7);
        }
        return next;
      } else {
        // Different day - add days until target
        next.setDate(next.getDate() + daysUntilTarget);
        next.setHours(params.hour ?? 9, params.minute ?? 0, 0, 0);
        return next;
      }
    }

    case "monthly": {
      const next = new Date(now);
      const targetDay = params.dayOfMonth ?? 1;
      next.setDate(targetDay);
      next.setHours(params.hour ?? 9, params.minute ?? 0, 0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    }

    default:
      return null;
  }
}

// ============================================================================
// Agent Trigger Operations
// ============================================================================

/**
 * Creates an agent trigger.
 */
export async function createAgentTrigger(params: {
  agentId: string;
  triggerType: AgentTriggerType;
  scopeFolderId?: string;
  scopeTeamId?: string;
}): Promise<AgentTrigger> {
  // Check trigger limit
  const triggerCount = await countTriggersForAgent(params.agentId);
  if (triggerCount >= AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT) {
    throw new Error(
      `Maximum of ${AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT} triggers allowed per agent`
    );
  }

  const triggerId = generateTriggerId(params.agentId);

  const [row] = await db
    .insert(agentTrigger)
    .values({
      id: triggerId,
      agentId: params.agentId,
      triggerType: params.triggerType,
      scopeFolderId: params.scopeFolderId ?? null,
      scopeTeamId: params.scopeTeamId ?? null,
      isEnabled: true,
    })
    .returning();

  return rowToAgentTrigger(row);
}

/**
 * Gets a trigger by ID.
 */
export async function getTriggerById(triggerId: string): Promise<AgentTrigger | null> {
  const [row] = await db
    .select()
    .from(agentTrigger)
    .where(eq(agentTrigger.id, triggerId))
    .limit(1);

  return row ? rowToAgentTrigger(row) : null;
}

/**
 * Lists triggers for an agent.
 */
export async function listTriggersForAgent(agentId: string): Promise<AgentTrigger[]> {
  const rows = await db
    .select()
    .from(agentTrigger)
    .where(eq(agentTrigger.agentId, agentId))
    .orderBy(desc(agentTrigger.createdAt));

  return rows.map(rowToAgentTrigger);
}

/**
 * Lists triggers for an agent with scope details.
 */
export async function listTriggersWithScope(agentId: string): Promise<AgentTriggerWithScope[]> {
  const rows = await db
    .select({
      trigger: agentTrigger,
      folder: {
        id: meetingFolder.id,
        name: meetingFolder.name,
        color: meetingFolder.color,
      },
      team: {
        id: team.id,
        name: team.name,
        color: team.color,
      },
    })
    .from(agentTrigger)
    .leftJoin(meetingFolder, eq(meetingFolder.id, agentTrigger.scopeFolderId))
    .leftJoin(team, eq(team.id, agentTrigger.scopeTeamId))
    .where(eq(agentTrigger.agentId, agentId))
    .orderBy(desc(agentTrigger.createdAt));

  return rows.map((row) => ({
    ...rowToAgentTrigger(row.trigger),
    folder: row.folder?.id ? row.folder : null,
    team: row.team?.id ? row.team : null,
  }));
}

/**
 * Updates an agent trigger.
 */
export async function updateAgentTrigger(
  triggerId: string,
  updates: {
    triggerType?: AgentTriggerType;
    scopeFolderId?: string | null;
    scopeTeamId?: string | null;
    isEnabled?: boolean;
  }
): Promise<AgentTrigger | null> {
  const updateData: Partial<typeof agentTrigger.$inferInsert> = {};

  if (updates.triggerType !== undefined) {
    updateData.triggerType = updates.triggerType;
  }
  if (updates.scopeFolderId !== undefined) {
    updateData.scopeFolderId = updates.scopeFolderId;
  }
  if (updates.scopeTeamId !== undefined) {
    updateData.scopeTeamId = updates.scopeTeamId;
  }
  if (updates.isEnabled !== undefined) {
    updateData.isEnabled = updates.isEnabled;
  }

  const [row] = await db
    .update(agentTrigger)
    .set(updateData)
    .where(eq(agentTrigger.id, triggerId))
    .returning();

  return row ? rowToAgentTrigger(row) : null;
}

/**
 * Deletes an agent trigger.
 */
export async function deleteAgentTrigger(triggerId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(agentTrigger)
    .where(eq(agentTrigger.id, triggerId))
    .returning({ id: agentTrigger.id });

  return !!deleted;
}

/**
 * Counts triggers for an agent.
 */
export async function countTriggersForAgent(agentId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(agentTrigger)
    .where(eq(agentTrigger.agentId, agentId));

  return result?.count ?? 0;
}

/**
 * Finds all triggers for a specific event type.
 * Used when an event occurs to find which agents should run.
 *
 * Scope filtering logic (done at SQL level for performance):
 * - If folderId provided: match triggers with NULL scope OR matching folderId
 * - If folderId NOT provided: only match triggers with NULL folder scope
 * - Same logic applies for teamId
 */
export async function findTriggersForEvent(params: {
  triggerType: AgentTriggerType;
  folderId?: string;
  teamId?: string;
  userId?: string;
}): Promise<Array<AgentTrigger & { agent: Agent }>> {
  const conditions = [
    eq(agentTrigger.isEnabled, true),
    eq(agentTrigger.triggerType, params.triggerType),
    eq(agent.isActive, true),
  ];

  // Add user filter if provided
  if (params.userId) {
    conditions.push(eq(agent.userId, params.userId));
  }

  // Folder scope filter at SQL level
  if (params.folderId) {
    // Match triggers with no folder scope OR matching folder scope
    conditions.push(
      or(
        isNull(agentTrigger.scopeFolderId),
        eq(agentTrigger.scopeFolderId, params.folderId)
      )!
    );
  } else {
    // Only match triggers with no folder scope
    conditions.push(isNull(agentTrigger.scopeFolderId));
  }

  // Team scope filter at SQL level
  if (params.teamId) {
    // Match triggers with no team scope OR matching team scope
    conditions.push(
      or(
        isNull(agentTrigger.scopeTeamId),
        eq(agentTrigger.scopeTeamId, params.teamId)
      )!
    );
  } else {
    // Only match triggers with no team scope
    conditions.push(isNull(agentTrigger.scopeTeamId));
  }

  const rows = await db
    .select({
      trigger: agentTrigger,
      agent: agent,
    })
    .from(agentTrigger)
    .innerJoin(agent, eq(agent.id, agentTrigger.agentId))
    .where(and(...conditions));

  return rows.map((row) => ({
    ...rowToAgentTrigger(row.trigger),
    agent: rowToAgent(row.agent),
  }));
}

// ============================================================================
// Agent Execution Operations
// ============================================================================

/**
 * Creates an agent execution record.
 */
export async function createAgentExecution(params: {
  agentId: string;
  triggeredBy: AgentExecutionTriggeredBy;
  scheduleId?: string;
  triggerId?: string;
  inputContext?: AgentExecutionInputContext;
}): Promise<AgentExecution> {
  const executionId = generateExecutionId(params.agentId);

  const [row] = await db
    .insert(agentExecution)
    .values({
      id: executionId,
      agentId: params.agentId,
      triggeredBy: params.triggeredBy,
      scheduleId: params.scheduleId ?? null,
      triggerId: params.triggerId ?? null,
      status: "pending",
      inputContext: params.inputContext ?? null,
    })
    .returning();

  return rowToAgentExecution(row);
}

/**
 * Gets an execution by ID.
 */
export async function getExecutionById(executionId: string): Promise<AgentExecution | null> {
  const [row] = await db
    .select()
    .from(agentExecution)
    .where(eq(agentExecution.id, executionId))
    .limit(1);

  return row ? rowToAgentExecution(row) : null;
}

/**
 * Lists executions for an agent.
 */
export async function listExecutionsForAgent(
  agentId: string,
  limit: number = 50,
  offset: number = 0
): Promise<AgentExecution[]> {
  const rows = await db
    .select()
    .from(agentExecution)
    .where(eq(agentExecution.agentId, agentId))
    .orderBy(desc(agentExecution.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(rowToAgentExecution);
}

/**
 * Lists all executions for a user's agents.
 */
export async function listExecutionsForUser(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<Array<AgentExecution & { agentName: string }>> {
  const rows = await db
    .select({
      execution: agentExecution,
      agentName: agent.name,
    })
    .from(agentExecution)
    .innerJoin(agent, eq(agent.id, agentExecution.agentId))
    .where(eq(agent.userId, userId))
    .orderBy(desc(agentExecution.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...rowToAgentExecution(row.execution),
    agentName: row.agentName,
  }));
}

/**
 * Counts executions for an agent.
 */
export async function countExecutionsForAgent(agentId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(agentExecution)
    .where(eq(agentExecution.agentId, agentId));

  return result?.count ?? 0;
}

/**
 * Marks an execution as started.
 */
export async function markExecutionStarted(executionId: string): Promise<AgentExecution | null> {
  const [row] = await db
    .update(agentExecution)
    .set({
      status: "running",
      startedAt: new Date(),
    })
    .where(eq(agentExecution.id, executionId))
    .returning();

  return row ? rowToAgentExecution(row) : null;
}

/**
 * Marks an execution as completed.
 */
export async function markExecutionCompleted(
  executionId: string,
  outputResult: AgentExecutionOutputResult
): Promise<AgentExecution | null> {
  const startTime = await db
    .select({ startedAt: agentExecution.startedAt })
    .from(agentExecution)
    .where(eq(agentExecution.id, executionId))
    .limit(1);

  const now = new Date();
  const durationMs = startTime[0]?.startedAt
    ? now.getTime() - startTime[0].startedAt.getTime()
    : null;

  const [row] = await db
    .update(agentExecution)
    .set({
      status: "completed",
      completedAt: now,
      durationMs,
      outputResult,
    })
    .where(eq(agentExecution.id, executionId))
    .returning();

  return row ? rowToAgentExecution(row) : null;
}

/**
 * Marks an execution as failed.
 */
export async function markExecutionFailed(
  executionId: string,
  errorMessage: string
): Promise<AgentExecution | null> {
  const startTime = await db
    .select({ startedAt: agentExecution.startedAt })
    .from(agentExecution)
    .where(eq(agentExecution.id, executionId))
    .limit(1);

  const now = new Date();
  const durationMs = startTime[0]?.startedAt
    ? now.getTime() - startTime[0].startedAt.getTime()
    : null;

  const [row] = await db
    .update(agentExecution)
    .set({
      status: "failed",
      completedAt: now,
      durationMs,
      errorMessage,
    })
    .where(eq(agentExecution.id, executionId))
    .returning();

  return row ? rowToAgentExecution(row) : null;
}

/**
 * Updates an execution's status.
 */
export async function updateExecutionStatus(
  executionId: string,
  status: AgentExecutionStatus,
  updates?: {
    outputResult?: AgentExecutionOutputResult;
    errorMessage?: string;
  }
): Promise<AgentExecution | null> {
  const updateData: Partial<typeof agentExecution.$inferInsert> = {
    status,
  };

  if (status === "running") {
    updateData.startedAt = new Date();
  }

  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }

  if (updates?.outputResult !== undefined) {
    updateData.outputResult = updates.outputResult;
  }

  if (updates?.errorMessage !== undefined) {
    updateData.errorMessage = updates.errorMessage;
  }

  const [row] = await db
    .update(agentExecution)
    .set(updateData)
    .where(eq(agentExecution.id, executionId))
    .returning();

  return row ? rowToAgentExecution(row) : null;
}

/**
 * Deletes old executions (for cleanup/retention).
 */
export async function deleteOldExecutions(
  agentId: string,
  olderThan: Date
): Promise<number> {
  const result = await db
    .delete(agentExecution)
    .where(
      and(eq(agentExecution.agentId, agentId), lt(agentExecution.createdAt, olderThan))
    )
    .returning({ id: agentExecution.id });

  return result.length;
}

// ============================================================================
// Permission Checks
// ============================================================================

/**
 * Checks if a user owns an agent.
 */
export async function isAgentOwner(
  agentId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ userId: agent.userId })
    .from(agent)
    .where(eq(agent.id, agentId))
    .limit(1);

  return row?.userId === userId;
}

/**
 * Verifies agent ownership and returns the agent if owned.
 * Throws if not owned.
 */
export async function verifyAgentOwnership(
  agentId: string,
  userId: string
): Promise<Agent> {
  const agentData = await getAgentById(agentId, userId);
  if (!agentData) {
    throw new Error("Agent not found or not owned by user");
  }
  return agentData;
}

/**
 * Verifies schedule belongs to an agent owned by user.
 */
export async function verifyScheduleOwnership(
  scheduleId: string,
  userId: string
): Promise<AgentSchedule> {
  const [row] = await db
    .select({
      schedule: agentSchedule,
      agentUserId: agent.userId,
    })
    .from(agentSchedule)
    .innerJoin(agent, eq(agent.id, agentSchedule.agentId))
    .where(eq(agentSchedule.id, scheduleId))
    .limit(1);

  if (!row || row.agentUserId !== userId) {
    throw new Error("Schedule not found or not owned by user");
  }

  return rowToAgentSchedule(row.schedule);
}

/**
 * Verifies trigger belongs to an agent owned by user.
 */
export async function verifyTriggerOwnership(
  triggerId: string,
  userId: string
): Promise<AgentTrigger> {
  const [row] = await db
    .select({
      trigger: agentTrigger,
      agentUserId: agent.userId,
    })
    .from(agentTrigger)
    .innerJoin(agent, eq(agent.id, agentTrigger.agentId))
    .where(eq(agentTrigger.id, triggerId))
    .limit(1);

  if (!row || row.agentUserId !== userId) {
    throw new Error("Trigger not found or not owned by user");
  }

  return rowToAgentTrigger(row.trigger);
}

/**
 * Verifies execution belongs to an agent owned by user.
 */
export async function verifyExecutionOwnership(
  executionId: string,
  userId: string
): Promise<AgentExecution> {
  const [row] = await db
    .select({
      execution: agentExecution,
      agentUserId: agent.userId,
    })
    .from(agentExecution)
    .innerJoin(agent, eq(agent.id, agentExecution.agentId))
    .where(eq(agentExecution.id, executionId))
    .limit(1);

  if (!row || row.agentUserId !== userId) {
    throw new Error("Execution not found or not owned by user");
  }

  return rowToAgentExecution(row.execution);
}
