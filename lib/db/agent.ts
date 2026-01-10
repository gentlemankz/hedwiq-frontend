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
  user,
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
// User Helpers
// ============================================================================

/**
 * Simple user type for agent execution context.
 */
export interface AgentUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Gets a user by ID for agent execution context.
 */
export async function getUserById(userId: string): Promise<AgentUser | null> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return row ?? null;
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
    emailDomainAllowlist: row.emailDomainAllowlist,
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
// Validation Helpers
// ============================================================================

/**
 * Simple domain validation regex.
 * Allows alphanumeric, hyphens, and dots. Must have at least one dot.
 * Examples: "example.com", "sub.example.co.uk", "my-company.org"
 */
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Normalizes and validates an email domain allowlist.
 * - Trims whitespace from each entry
 * - Converts to lowercase
 * - Filters out empty entries
 * - Validates domain format
 *
 * @param domains - Array of domain strings to normalize
 * @returns Normalized array, or null if input is null/empty
 * @throws Error if any domain has invalid format
 */
function normalizeEmailDomainAllowlist(
  domains: string[] | null | undefined
): string[] | null {
  if (!domains || domains.length === 0) {
    return null;
  }

  const normalized: string[] = [];
  const invalidDomains: string[] = [];

  for (const domain of domains) {
    const trimmed = domain.trim().toLowerCase();
    if (trimmed === "") {
      continue; // Skip empty entries
    }

    if (!DOMAIN_REGEX.test(trimmed)) {
      invalidDomains.push(domain);
    } else {
      normalized.push(trimmed);
    }
  }

  if (invalidDomains.length > 0) {
    throw new Error(
      `Invalid email domain format: ${invalidDomains.join(", ")}. ` +
        `Domains should be like "example.com" or "sub.example.org".`
    );
  }

  return normalized.length > 0 ? normalized : null;
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
  emailDomainAllowlist?: string[] | null;
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
        emailDomainAllowlist: normalizeEmailDomainAllowlist(params.emailDomainAllowlist),
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
    emailDomainAllowlist?: string[] | null;
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
  if (updates.emailDomainAllowlist !== undefined) {
    updateData.emailDomainAllowlist = normalizeEmailDomainAllowlist(updates.emailDomainAllowlist);
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
 * Parses a datetime-local string (e.g., "2024-01-15T09:00") in the specified timezone.
 *
 * The datetime-local input doesn't include timezone info, so we need to interpret
 * the string as if it were in the user's selected timezone and convert to UTC.
 *
 * @param datetimeStr - The datetime-local string (format: "YYYY-MM-DDTHH:mm")
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns UTC Date representing the time in the specified timezone
 */
function parseScheduledAtInTimezone(datetimeStr: string, timezone: string): Date {
  // Parse the datetime-local string components
  const [datePart, timePart] = datetimeStr.split("T");
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const [hourStr, minuteStr] = timePart.split(":");

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  // Use the existing timezone-aware function to create the correct UTC Date
  return createDateInTimezone(year, month, day, hour, minute, timezone);
}

/**
 * Creates an agent schedule.
 *
 * @param params.scheduledAt - Raw datetime-local string for one-time schedules (not a Date)
 */
export async function createAgentSchedule(params: {
  agentId: string;
  scheduleType: AgentScheduleType;
  scheduledAt?: string; // Raw datetime-local string, parsed with timezone
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
  const timezone = params.timezone ?? SCHEDULE_DEFAULTS.TIMEZONE;

  // Parse scheduledAt with timezone awareness for one-time schedules
  let parsedScheduledAt: Date | undefined;
  if (params.scheduleType === "once" && params.scheduledAt) {
    parsedScheduledAt = parseScheduledAtInTimezone(params.scheduledAt, timezone);
  }

  // Calculate next run time (pass parsed Date for one-time schedules)
  const nextRunAt = calculateNextRunTime({
    ...params,
    scheduledAt: parsedScheduledAt,
  });

  const [row] = await db
    .insert(agentSchedule)
    .values({
      id: scheduleId,
      agentId: params.agentId,
      scheduleType: params.scheduleType,
      scheduledAt: parsedScheduledAt ?? null,
      hour: params.hour ?? null,
      minute: params.minute ?? null,
      dayOfWeek: params.dayOfWeek ?? null,
      dayOfMonth: params.dayOfMonth ?? null,
      timezone,
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
 *
 * @param updates.scheduledAt - Raw datetime-local string for one-time schedules (not a Date)
 */
export async function updateAgentSchedule(
  scheduleId: string,
  updates: {
    scheduleType?: AgentScheduleType;
    scheduledAt?: string; // Raw datetime-local string, parsed with timezone
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

  // Determine effective timezone (use update or fall back to current)
  const effectiveTimezone = updates.timezone ?? current.timezone;

  // Parse scheduledAt with timezone awareness
  let parsedScheduledAt: Date | undefined;
  if (updates.scheduledAt !== undefined) {
    parsedScheduledAt = parseScheduledAtInTimezone(updates.scheduledAt, effectiveTimezone);
  }

  const updateData: Partial<typeof agentSchedule.$inferInsert> = {};

  if (updates.scheduleType !== undefined) {
    updateData.scheduleType = updates.scheduleType;
  }
  if (parsedScheduledAt !== undefined) {
    updateData.scheduledAt = parsedScheduledAt;
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

  // Recalculate next run time if:
  // 1. Schedule parameters changed
  // 2. Schedule is being enabled (to prevent stale nextRunAt from causing immediate misfires)
  const scheduleParamsChanged =
    updates.scheduleType !== undefined ||
    updates.scheduledAt !== undefined ||
    updates.hour !== undefined ||
    updates.minute !== undefined ||
    updates.dayOfWeek !== undefined ||
    updates.dayOfMonth !== undefined ||
    updates.timezone !== undefined;

  const isBeingEnabled = updates.isEnabled === true && !current.isEnabled;

  if (scheduleParamsChanged || isBeingEnabled) {
    const mergedParams = {
      scheduleType: updates.scheduleType ?? (current.scheduleType as AgentScheduleType),
      scheduledAt: parsedScheduledAt ?? (current.scheduledAt ? new Date(current.scheduledAt) : undefined),
      hour: updates.hour ?? current.hour ?? undefined,
      minute: updates.minute ?? current.minute ?? undefined,
      dayOfWeek: updates.dayOfWeek ?? current.dayOfWeek ?? undefined,
      dayOfMonth: updates.dayOfMonth ?? current.dayOfMonth ?? undefined,
      timezone: effectiveTimezone,
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
 * Atomically claims a schedule for execution.
 *
 * This function prevents race conditions when multiple cron workers try to process
 * the same schedule. It uses optimistic locking to ensure only one worker can claim
 * a schedule at a time.
 *
 * The claim is made by updating the nextRunAt to the next scheduled time BEFORE
 * execution begins. If another worker has already claimed the schedule, this
 * function returns null.
 *
 * IMPORTANT: For one-time schedules, this does NOT disable the schedule. The caller
 * must call `finalizeOneTimeSchedule` after successful execution, or
 * `restoreOneTimeScheduleForRetry` if execution fails.
 *
 * @param scheduleId - The schedule to claim
 * @param expectedNextRunAt - The expected current nextRunAt (for optimistic lock)
 * @returns The claimed schedule with updated nextRunAt, or null if claim failed
 */
export async function claimScheduleForExecution(
  scheduleId: string,
  expectedNextRunAt: Date | null
): Promise<AgentSchedule | null> {
  const current = await getScheduleById(scheduleId);
  if (!current) return null;

  // Calculate the next run time (this will be the new nextRunAt)
  const newNextRunAt = calculateNextRunTime({
    scheduleType: current.scheduleType as AgentScheduleType,
    scheduledAt: current.scheduledAt ? new Date(current.scheduledAt) : undefined,
    hour: current.hour ?? undefined,
    minute: current.minute ?? undefined,
    dayOfWeek: current.dayOfWeek ?? undefined,
    dayOfMonth: current.dayOfMonth ?? undefined,
    timezone: current.timezone,
  });

  // For one-time schedules, we set nextRunAt to null to claim it (prevents other workers)
  // but do NOT disable yet - that happens after successful execution
  const updateData: Partial<typeof agentSchedule.$inferInsert> = {
    nextRunAt: newNextRunAt,
  };

  // Build the WHERE conditions with optimistic locking
  const conditions = [eq(agentSchedule.id, scheduleId)];

  if (expectedNextRunAt) {
    conditions.push(eq(agentSchedule.nextRunAt, expectedNextRunAt));
  } else {
    conditions.push(isNull(agentSchedule.nextRunAt));
  }

  // Attempt to claim by updating nextRunAt
  const [row] = await db
    .update(agentSchedule)
    .set(updateData)
    .where(and(...conditions))
    .returning();

  // If no row returned, another worker already claimed this schedule
  return row ? rowToAgentSchedule(row) : null;
}

/**
 * Finalizes a one-time schedule after successful execution.
 * Disables the schedule so it won't run again.
 */
export async function finalizeOneTimeSchedule(scheduleId: string): Promise<void> {
  await db
    .update(agentSchedule)
    .set({ isEnabled: false })
    .where(eq(agentSchedule.id, scheduleId));
}

/**
 * Restores a one-time schedule for retry after failed execution.
 * Sets nextRunAt back to scheduledAt so it can be picked up on the next cron run.
 */
export async function restoreOneTimeScheduleForRetry(scheduleId: string): Promise<void> {
  const schedule = await getScheduleById(scheduleId);
  if (!schedule || schedule.scheduleType !== "once" || !schedule.scheduledAt) {
    return;
  }

  // Restore nextRunAt to the original scheduledAt time
  await db
    .update(agentSchedule)
    .set({ nextRunAt: new Date(schedule.scheduledAt) })
    .where(eq(agentSchedule.id, scheduleId));
}

/**
 * Marks a schedule as executed (updates lastRunAt).
 * Should be called after execution completes, regardless of success/failure.
 */
export async function markScheduleExecuted(scheduleId: string): Promise<void> {
  await db
    .update(agentSchedule)
    .set({ lastRunAt: new Date() })
    .where(eq(agentSchedule.id, scheduleId));
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

// ============================================================================
// Schedule Time Calculation Constants
// ============================================================================

/** Default schedule time values */
const SCHEDULE_DEFAULTS = {
  HOUR: 9,
  MINUTE: 0,
  DAY_OF_WEEK: 1, // Monday
  DAY_OF_MONTH: 1,
  TIMEZONE: "UTC",
} as const;

/** Default stale threshold: 5 minutes */
const DEFAULT_STALE_THRESHOLD_MS = 300000;

/**
 * Execution configuration defaults.
 * STALE_THRESHOLD_MS: Time after which a running execution is considered stale and marked as failed.
 * This can be overridden via AGENT_EXECUTION_TIMEOUT_MS environment variable.
 * Default: 5 minutes (300000ms)
 */
const EXECUTION_DEFAULTS = {
  // Use env var if set, otherwise default to 5 minutes
  // Guard against invalid env var values (NaN) with fallback
  STALE_THRESHOLD_MS:
    parseInt(process.env.AGENT_EXECUTION_TIMEOUT_MS ?? "", 10) ||
    DEFAULT_STALE_THRESHOLD_MS,
} as const;

/** Days in a week for weekly schedule calculations */
const DAYS_IN_WEEK = 7;

// ============================================================================
// Timezone Utilities
// ============================================================================

/**
 * Gets the current date/time components in a specific timezone.
 * Uses native Intl API for timezone conversion.
 */
function getDatePartsInTimezone(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const dayOfWeekMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: parseInt(getPart("year"), 10),
    month: parseInt(getPart("month"), 10) - 1, // JS months are 0-indexed
    day: parseInt(getPart("day"), 10),
    hour: parseInt(getPart("hour"), 10),
    minute: parseInt(getPart("minute"), 10),
    dayOfWeek: dayOfWeekMap[getPart("weekday")] ?? 0,
  };
}

/**
 * Creates a Date object representing a specific time in a timezone,
 * then returns the equivalent UTC Date.
 *
 * This is a binary search approach to find the UTC time that, when
 * converted to the target timezone, matches the desired local time.
 */
function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Start with a rough estimate assuming the timezone is near UTC
  const estimate = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));

  // Get the offset by checking what time it is in the target timezone
  const parts = getDatePartsInTimezone(estimate, timezone);

  // Calculate the difference in minutes
  const estimatedMinutes = parts.hour * 60 + parts.minute;
  const targetMinutes = hour * 60 + minute;
  let diffMinutes = targetMinutes - estimatedMinutes;

  // Handle day boundary crossings
  if (parts.day !== day) {
    if (parts.day < day) {
      diffMinutes += 24 * 60; // Add a day
    } else {
      diffMinutes -= 24 * 60; // Subtract a day
    }
  }

  // Adjust the estimate
  const result = new Date(estimate.getTime() + diffMinutes * 60 * 1000);

  return result;
}

/**
 * Gets the number of days in a specific month.
 */
function getDaysInMonth(year: number, month: number): number {
  // Month is 0-indexed, so month + 1 with day 0 gives last day of month
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Clamps a day to a valid day for the given month.
 * Handles edge case where dayOfMonth is 31 but month only has 28-30 days.
 */
function clampDayToMonth(day: number, year: number, month: number): number {
  const maxDay = getDaysInMonth(year, month);
  return Math.min(day, maxDay);
}

// ============================================================================
// Schedule Time Calculation
// ============================================================================

/**
 * Calculates the next run time for a schedule.
 *
 * Supports timezone-aware scheduling using native Intl API:
 * 1. Converts current time to the user's timezone
 * 2. Calculates the next run time in that timezone context
 * 3. Returns a UTC Date that represents the correct moment
 *
 * @param params - Schedule parameters
 * @returns UTC Date for the next run, or null if schedule won't run again
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
  const timezone = params.timezone ?? SCHEDULE_DEFAULTS.TIMEZONE;
  const now = new Date();
  const nowInTz = getDatePartsInTimezone(now, timezone);

  switch (params.scheduleType) {
    case "once":
      return calculateOnceNextRun(params.scheduledAt, now);

    case "hourly":
      return calculateHourlyNextRun(
        params.minute ?? SCHEDULE_DEFAULTS.MINUTE,
        nowInTz,
        timezone
      );

    case "daily":
      return calculateDailyNextRun(
        params.hour ?? SCHEDULE_DEFAULTS.HOUR,
        params.minute ?? SCHEDULE_DEFAULTS.MINUTE,
        nowInTz,
        timezone
      );

    case "weekly":
      return calculateWeeklyNextRun(
        params.dayOfWeek ?? SCHEDULE_DEFAULTS.DAY_OF_WEEK,
        params.hour ?? SCHEDULE_DEFAULTS.HOUR,
        params.minute ?? SCHEDULE_DEFAULTS.MINUTE,
        nowInTz,
        timezone
      );

    case "monthly":
      return calculateMonthlyNextRun(
        params.dayOfMonth ?? SCHEDULE_DEFAULTS.DAY_OF_MONTH,
        params.hour ?? SCHEDULE_DEFAULTS.HOUR,
        params.minute ?? SCHEDULE_DEFAULTS.MINUTE,
        nowInTz,
        timezone
      );

    default:
      return null;
  }
}

/**
 * Calculates next run for one-time schedules.
 */
function calculateOnceNextRun(scheduledAt: Date | undefined, now: Date): Date | null {
  if (scheduledAt && scheduledAt > now) {
    return scheduledAt;
  }
  return null;
}

/**
 * Calculates next run for hourly schedules.
 */
function calculateHourlyNextRun(
  minute: number,
  nowInTz: ReturnType<typeof getDatePartsInTimezone>,
  timezone: string
): Date {
  let { year, month, day, hour } = nowInTz;

  // If we've passed the minute mark this hour, move to next hour
  if (nowInTz.minute >= minute) {
    hour += 1;
    // Handle day rollover
    if (hour >= 24) {
      hour = 0;
      day += 1;
      const daysInMonth = getDaysInMonth(year, month);
      if (day > daysInMonth) {
        day = 1;
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }
    }
  }

  return createDateInTimezone(year, month, day, hour, minute, timezone);
}

/**
 * Calculates next run for daily schedules.
 */
function calculateDailyNextRun(
  hour: number,
  minute: number,
  nowInTz: ReturnType<typeof getDatePartsInTimezone>,
  timezone: string
): Date {
  let { year, month, day } = nowInTz;
  const nowMinutes = nowInTz.hour * 60 + nowInTz.minute;
  const targetMinutes = hour * 60 + minute;

  // If we've passed the scheduled time today, move to tomorrow
  if (nowMinutes >= targetMinutes) {
    day += 1;
    const daysInMonth = getDaysInMonth(year, month);
    if (day > daysInMonth) {
      day = 1;
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  return createDateInTimezone(year, month, day, hour, minute, timezone);
}

/**
 * Calculates next run for weekly schedules.
 */
function calculateWeeklyNextRun(
  dayOfWeek: number,
  hour: number,
  minute: number,
  nowInTz: ReturnType<typeof getDatePartsInTimezone>,
  timezone: string
): Date {
  let { year, month, day } = nowInTz;
  const currentDayOfWeek = nowInTz.dayOfWeek;
  let daysUntilTarget = (dayOfWeek - currentDayOfWeek + DAYS_IN_WEEK) % DAYS_IN_WEEK;

  // If same day, check if time has passed
  if (daysUntilTarget === 0) {
    const nowMinutes = nowInTz.hour * 60 + nowInTz.minute;
    const targetMinutes = hour * 60 + minute;
    if (nowMinutes >= targetMinutes) {
      daysUntilTarget = DAYS_IN_WEEK; // Schedule for next week
    }
  }

  // Add days to reach target
  day += daysUntilTarget;

  // Handle month/year rollovers
  let daysInMonth = getDaysInMonth(year, month);
  while (day > daysInMonth) {
    day -= daysInMonth;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    daysInMonth = getDaysInMonth(year, month);
  }

  return createDateInTimezone(year, month, day, hour, minute, timezone);
}

/**
 * Calculates next run for monthly schedules.
 * Handles edge case where target day doesn't exist in some months (e.g., 31st in February).
 */
function calculateMonthlyNextRun(
  dayOfMonth: number,
  hour: number,
  minute: number,
  nowInTz: ReturnType<typeof getDatePartsInTimezone>,
  timezone: string
): Date {
  let { year, month } = nowInTz;
  const { day } = nowInTz;
  const nowMinutes = nowInTz.hour * 60 + nowInTz.minute;
  const targetMinutes = hour * 60 + minute;

  // Clamp the target day to this month's max
  const clampedDay = clampDayToMonth(dayOfMonth, year, month);

  // Check if we need to move to next month
  const shouldMoveToNextMonth =
    day > clampedDay || // We're past the target day
    (day === clampedDay && nowMinutes >= targetMinutes); // Same day but time passed

  if (shouldMoveToNextMonth) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  // Clamp the day again for the (possibly new) month
  const finalDay = clampDayToMonth(dayOfMonth, year, month);

  return createDateInTimezone(year, month, finalDay, hour, minute, timezone);
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
 * - If teamId provided: match triggers with NULL scope OR matching teamId (unless exactTeamScope is true)
 * - If teamId provided with exactTeamScope: only match triggers with that exact teamId (excludes NULL)
 * - If teamId NOT provided: only match triggers with NULL team scope
 */
export async function findTriggersForEvent(params: {
  triggerType: AgentTriggerType;
  folderId?: string;
  teamId?: string;
  userId?: string;
  /** When true, only match triggers with exact team scope (not NULL). Use for per-team dispatches. */
  exactTeamScope?: boolean;
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
    if (params.exactTeamScope) {
      // Only match triggers with this exact team scope (excludes NULL)
      conditions.push(eq(agentTrigger.scopeTeamId, params.teamId));
    } else {
      // Match triggers with no team scope OR matching team scope
      conditions.push(
        or(
          isNull(agentTrigger.scopeTeamId),
          eq(agentTrigger.scopeTeamId, params.teamId)
        )!
      );
    }
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
  errorMessage: string,
  outputResult?: AgentExecutionOutputResult
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
      outputResult: outputResult ?? null,
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

/**
 * Cleans up stale "running" executions that have been stuck for too long.
 * This handles cases where the server crashed or timed out before the catch block ran.
 *
 * @param staleThresholdMs - Time in ms after which a running execution is considered stale.
 *                          Defaults to EXECUTION_DEFAULTS.STALE_THRESHOLD_MS which can be
 *                          configured via AGENT_EXECUTION_TIMEOUT_MS environment variable.
 * @returns The number of executions that were marked as failed
 */
export async function cleanupStaleExecutions(
  staleThresholdMs: number = EXECUTION_DEFAULTS.STALE_THRESHOLD_MS
): Promise<{ cleanedCount: number; executionIds: string[] }> {
  const staleThreshold = new Date(Date.now() - staleThresholdMs);
  const completedAt = new Date();

  // First, find all stale executions to calculate their durations
  const staleExecutions = await db
    .select({
      id: agentExecution.id,
      startedAt: agentExecution.startedAt,
    })
    .from(agentExecution)
    .where(
      and(
        eq(agentExecution.status, "running"),
        lt(agentExecution.startedAt, staleThreshold)
      )
    );

  if (staleExecutions.length === 0) {
    return { cleanedCount: 0, executionIds: [] };
  }

  // Update each stale execution with its calculated duration
  const executionIds: string[] = [];
  for (const execution of staleExecutions) {
    const durationMs = execution.startedAt
      ? completedAt.getTime() - execution.startedAt.getTime()
      : null;

    await db
      .update(agentExecution)
      .set({
        status: "failed",
        completedAt,
        durationMs,
        errorMessage: "Execution timed out or was interrupted unexpectedly",
      })
      .where(eq(agentExecution.id, execution.id));

    executionIds.push(execution.id);
  }

  return {
    cleanedCount: executionIds.length,
    executionIds,
  };
}

/**
 * Gets count of currently running executions (for monitoring).
 */
export async function countRunningExecutions(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(agentExecution)
    .where(eq(agentExecution.status, "running"));

  return result?.count ?? 0;
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
