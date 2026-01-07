/**
 * Template Database Operations
 *
 * CRUD operations for meeting templates, agenda items, and planning questions.
 */

import { db } from "@/lib/db";
import {
  meetingTemplate,
  templateAgendaItem,
  templatePlanningQuestion,
  team,
  teamMember,
  user,
} from "@/lib/db/schema";
import { eq, and, or, sql, desc, asc, ilike, inArray } from "drizzle-orm";
import type {
  MeetingTemplate,
  TemplateAgendaItem,
  PlanningQuestion,
  TemplateWithItems,
  TemplateCategory,
  TemplateScope,
  ListTemplatesParams,
  CreateTemplateRequest,
  UpdateTemplateRequest,
} from "@/types/template";
import { isSystemTemplate } from "@/lib/templates/system-templates";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique template ID.
 * Format: tpl-{base36 timestamp (8-9 chars)}-{6 random alphanumeric chars}
 * This format matches the validation regex in lib/validation/template.ts
 */
export function generateTemplateId(): string {
  const timestamp = Date.now().toString(36); // Base36 encoding produces 8-9 chars
  const random = Math.random().toString(36).substring(2, 8);
  return `tpl-${timestamp}-${random}`;
}

/**
 * Generate a unique template agenda item ID.
 */
export function generateTemplateAgendaItemId(
  templateId: string,
  index: number
): string {
  const timestamp = Date.now();
  return `tai-${templateId.substring(4, 12)}-${timestamp}-${index}`;
}

/**
 * Generate a unique planning question ID.
 */
export function generatePlanningQuestionId(
  templateId: string,
  index: number
): string {
  const timestamp = Date.now();
  return `tpq-${templateId.substring(4, 12)}-${timestamp}-${index}`;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get a template by ID with all related data.
 * Enforces read authorization:
 * - System templates: accessible to all authenticated users
 * - Personal templates: only accessible to the creator
 * - Team templates: only accessible to team members
 *
 * @param templateId - The template ID
 * @param userId - The user ID (required for permission checks)
 */
export async function getTemplateById(
  templateId: string,
  userId: string
): Promise<TemplateWithItems | null> {
  const [templateRow] = await db
    .select()
    .from(meetingTemplate)
    .where(eq(meetingTemplate.id, templateId))
    .limit(1);

  if (!templateRow) {
    return null;
  }

  // Authorization check based on template scope
  const canRead = await canReadTemplate(templateRow, userId);
  if (!canRead) {
    return null; // Return null instead of throwing to maintain consistent API
  }

  // Get agenda items
  const agendaItems = await db
    .select()
    .from(templateAgendaItem)
    .where(eq(templateAgendaItem.templateId, templateId))
    .orderBy(asc(templateAgendaItem.orderIndex));

  // Get planning questions
  const planningQuestions = await db
    .select()
    .from(templatePlanningQuestion)
    .where(eq(templatePlanningQuestion.templateId, templateId))
    .orderBy(asc(templatePlanningQuestion.orderIndex));

  // Get team info if team template
  let teamInfo = null;
  if (templateRow.teamId) {
    const [teamRow] = await db
      .select({ id: team.id, name: team.name })
      .from(team)
      .where(eq(team.id, templateRow.teamId))
      .limit(1);
    teamInfo = teamRow || null;
  }

  // Get creator info if not system template
  let creatorInfo = null;
  if (templateRow.createdBy) {
    const [creatorRow] = await db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, templateRow.createdBy))
      .limit(1);
    creatorInfo = creatorRow || null;
  }

  return {
    ...mapTemplateRow(templateRow),
    agendaItems: agendaItems.map(mapAgendaItemRow),
    planningQuestions: planningQuestions.map(mapPlanningQuestionRow),
    team: teamInfo,
    creator: creatorInfo,
  };
}

/**
 * List templates accessible to a user with filtering and pagination.
 */
export async function listTemplates(
  params: ListTemplatesParams & { userId: string }
): Promise<{ templates: TemplateWithItems[]; total: number }> {
  const {
    userId,
    scope = "all",
    category,
    teamId,
    includeArchived = false,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    limit = 50,
    offset = 0,
  } = params;

  // Get user's team IDs for team template visibility
  const userTeamIds = await getUserTeamIds(userId);

  // Build conditions
  const conditions: ReturnType<typeof and>[] = [];

  // Scope filter with proper authorization
  // Always enforce visibility rules regardless of scope filter
  if (scope === "all") {
    // User can see: system templates, their personal templates, and their team templates
    conditions.push(
      or(
        eq(meetingTemplate.scope, "system"),
        and(
          eq(meetingTemplate.scope, "personal"),
          eq(meetingTemplate.createdBy, userId)
        ),
        and(
          eq(meetingTemplate.scope, "team"),
          userTeamIds.length > 0
            ? inArray(meetingTemplate.teamId, userTeamIds)
            : sql`false`
        )
      )!
    );
  } else if (scope === "system") {
    // System templates are visible to all authenticated users
    conditions.push(eq(meetingTemplate.scope, "system"));
  } else if (scope === "personal") {
    // Personal templates: only show user's own templates
    conditions.push(
      and(
        eq(meetingTemplate.scope, "personal"),
        eq(meetingTemplate.createdBy, userId)
      )!
    );
  } else if (scope === "team") {
    // Team templates: only show templates from teams user belongs to
    conditions.push(
      and(
        eq(meetingTemplate.scope, "team"),
        userTeamIds.length > 0
          ? inArray(meetingTemplate.teamId, userTeamIds)
          : sql`false`
      )!
    );
  }

  // Category filter
  if (category) {
    conditions.push(eq(meetingTemplate.category, category));
  }

  // Team filter
  if (teamId) {
    conditions.push(eq(meetingTemplate.teamId, teamId));
  }

  // Archive filter
  if (!includeArchived) {
    conditions.push(eq(meetingTemplate.isArchived, false));
  }

  // Search filter with escaped special LIKE characters
  if (search) {
    // Escape special LIKE characters (%, _, \) to prevent LIKE injection
    const escapedSearch = search.replace(/[%_\\]/g, "\\$&");
    conditions.push(
      or(
        ilike(meetingTemplate.name, `%${escapedSearch}%`),
        ilike(meetingTemplate.description, `%${escapedSearch}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Sorting
  const orderByColumn =
    sortBy === "name"
      ? meetingTemplate.name
      : sortBy === "usageCount"
        ? meetingTemplate.usageCount
        : meetingTemplate.createdAt;

  const orderByDirection = sortOrder === "asc" ? asc : desc;

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meetingTemplate)
    .where(whereClause);

  // Get templates
  const templateRows = await db
    .select()
    .from(meetingTemplate)
    .where(whereClause)
    .orderBy(orderByDirection(orderByColumn))
    .limit(limit)
    .offset(offset);

  // Get all related data for the templates
  const templateIds = templateRows.map((t) => t.id);

  const allAgendaItems =
    templateIds.length > 0
      ? await db
          .select()
          .from(templateAgendaItem)
          .where(inArray(templateAgendaItem.templateId, templateIds))
          .orderBy(asc(templateAgendaItem.orderIndex))
      : [];

  const allPlanningQuestions =
    templateIds.length > 0
      ? await db
          .select()
          .from(templatePlanningQuestion)
          .where(inArray(templatePlanningQuestion.templateId, templateIds))
          .orderBy(asc(templatePlanningQuestion.orderIndex))
      : [];

  // Group by template ID
  const agendaItemsByTemplate = groupBy(allAgendaItems, "templateId");
  const questionsByTemplate = groupBy(allPlanningQuestions, "templateId");

  // Get team info for team templates
  const teamIds = templateRows
    .filter((t) => t.teamId)
    .map((t) => t.teamId as string);
  const teams =
    teamIds.length > 0
      ? await db
          .select({ id: team.id, name: team.name })
          .from(team)
          .where(inArray(team.id, teamIds))
      : [];
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));

  // Get creator info
  const creatorIds = templateRows
    .filter((t) => t.createdBy)
    .map((t) => t.createdBy as string);
  const creators =
    creatorIds.length > 0
      ? await db
          .select({ id: user.id, name: user.name, image: user.image })
          .from(user)
          .where(inArray(user.id, creatorIds))
      : [];
  const creatorsById = Object.fromEntries(creators.map((c) => [c.id, c]));

  // Build full templates
  const templates: TemplateWithItems[] = templateRows.map((row) => ({
    ...mapTemplateRow(row),
    agendaItems: (agendaItemsByTemplate[row.id] || []).map(mapAgendaItemRow),
    planningQuestions: (questionsByTemplate[row.id] || []).map(
      mapPlanningQuestionRow
    ),
    team: row.teamId ? teamsById[row.teamId] || null : null,
    creator: row.createdBy ? creatorsById[row.createdBy] || null : null,
  }));

  return { templates, total: count };
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Create a new template with agenda items and planning questions.
 * Uses a transaction to ensure atomicity - all inserts succeed or all fail.
 */
export async function createTemplate(
  request: CreateTemplateRequest & { createdBy: string }
): Promise<TemplateWithItems> {
  const templateId = generateTemplateId();
  const userId = request.createdBy;

  // Verify team admin/owner role if creating a team template
  // Creating team templates requires admin or owner role, not just membership
  if (request.scope === "team" && request.teamId) {
    const canCreateTeamTemplate = await hasTeamAdminRole(request.teamId, userId);
    if (!canCreateTeamTemplate) {
      throw new Error("Only team admins and owners can create team templates");
    }
  }

  // Use transaction to ensure atomicity
  const { templateRow, agendaItems, planningQuestions } = await db.transaction(
    async (tx) => {
      // Insert template
      const [insertedTemplate] = await tx
        .insert(meetingTemplate)
        .values({
          id: templateId,
          name: request.name,
          description: request.description || null,
          category: request.category,
          scope: request.scope,
          teamId: request.teamId || null,
          createdBy: userId,
          defaultDuration: request.defaultDuration,
          suggestedCadence: request.suggestedCadence || null,
          defaultGoal: request.defaultGoal || null,
          defaultSettings: request.defaultSettings || {},
          isArchived: false,
          usageCount: 0,
        })
        .returning();

      // Insert agenda items
      const insertedAgendaItems =
        request.agendaItems.length > 0
          ? await tx
              .insert(templateAgendaItem)
              .values(
                request.agendaItems.map((item, index) => ({
                  id: generateTemplateAgendaItemId(templateId, index),
                  templateId,
                  orderIndex: index,
                  title: item.title,
                  description: item.description || null,
                  estimatedDuration: item.estimatedDuration,
                  isRequired: item.isRequired ?? false,
                  presenterRole: item.presenterRole || null,
                }))
              )
              .returning()
          : [];

      // Insert planning questions
      const insertedPlanningQuestions =
        request.planningQuestions && request.planningQuestions.length > 0
          ? await tx
              .insert(templatePlanningQuestion)
              .values(
                request.planningQuestions.map((q, index) => ({
                  id: generatePlanningQuestionId(templateId, index),
                  templateId,
                  orderIndex: index,
                  question: q.question,
                  category: q.category,
                  isRequired: q.isRequired ?? false,
                  placeholder: q.placeholder || null,
                }))
              )
              .returning()
          : [];

      return {
        templateRow: insertedTemplate,
        agendaItems: insertedAgendaItems,
        planningQuestions: insertedPlanningQuestions,
      };
    }
  );

  // Get creator info (outside transaction - read-only)
  const [creatorRow] = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  // Get team info if team template (outside transaction - read-only)
  let teamInfo = null;
  if (request.teamId) {
    const [teamRow] = await db
      .select({ id: team.id, name: team.name })
      .from(team)
      .where(eq(team.id, request.teamId))
      .limit(1);
    teamInfo = teamRow || null;
  }

  return {
    ...mapTemplateRow(templateRow),
    agendaItems: agendaItems.map(mapAgendaItemRow),
    planningQuestions: planningQuestions.map(mapPlanningQuestionRow),
    team: teamInfo,
    creator: creatorRow || null,
  };
}

/**
 * Update an existing template.
 * System templates cannot be updated.
 * Uses a transaction to ensure atomicity - all updates succeed or all fail.
 */
export async function updateTemplate(
  templateId: string,
  userId: string,
  request: UpdateTemplateRequest
): Promise<TemplateWithItems | null> {
  // Check if system template
  if (isSystemTemplate(templateId)) {
    throw new Error("System templates cannot be modified");
  }

  // Verify ownership
  const existing = await getTemplateById(templateId, userId);
  if (!existing) {
    return null;
  }

  // Check permission: must be creator or team admin
  const canEdit = await canEditTemplateInternal(existing, userId);
  if (!canEdit) {
    throw new Error("Not authorized to update this template");
  }

  // Build update values
  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (request.name !== undefined) updateValues.name = request.name;
  if (request.description !== undefined)
    updateValues.description = request.description;
  if (request.category !== undefined) updateValues.category = request.category;
  if (request.defaultDuration !== undefined)
    updateValues.defaultDuration = request.defaultDuration;
  if (request.suggestedCadence !== undefined)
    updateValues.suggestedCadence = request.suggestedCadence;
  if (request.defaultGoal !== undefined)
    updateValues.defaultGoal = request.defaultGoal;
  if (request.defaultSettings !== undefined)
    updateValues.defaultSettings = request.defaultSettings;
  if (request.isArchived !== undefined)
    updateValues.isArchived = request.isArchived;

  // Use transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // Update template
    await tx
      .update(meetingTemplate)
      .set(updateValues)
      .where(eq(meetingTemplate.id, templateId));

    // Update agenda items if provided (replace all)
    if (request.agendaItems !== undefined) {
      // Delete existing
      await tx
        .delete(templateAgendaItem)
        .where(eq(templateAgendaItem.templateId, templateId));

      // Insert new
      if (request.agendaItems.length > 0) {
        await tx.insert(templateAgendaItem).values(
          request.agendaItems.map((item, index) => ({
            id: generateTemplateAgendaItemId(templateId, index),
            templateId,
            orderIndex: index,
            title: item.title,
            description: item.description || null,
            estimatedDuration: item.estimatedDuration,
            isRequired: item.isRequired ?? false,
            presenterRole: item.presenterRole || null,
          }))
        );
      }
    }

    // Update planning questions if provided (replace all)
    if (request.planningQuestions !== undefined) {
      // Delete existing
      await tx
        .delete(templatePlanningQuestion)
        .where(eq(templatePlanningQuestion.templateId, templateId));

      // Insert new
      if (request.planningQuestions.length > 0) {
        await tx.insert(templatePlanningQuestion).values(
          request.planningQuestions.map((q, index) => ({
            id: generatePlanningQuestionId(templateId, index),
            templateId,
            orderIndex: index,
            question: q.question,
            category: q.category,
            isRequired: q.isRequired ?? false,
            placeholder: q.placeholder || null,
          }))
        );
      }
    }
  });

  // Return updated template
  return getTemplateById(templateId, userId);
}

/**
 * Delete a template.
 * System templates cannot be deleted.
 */
export async function deleteTemplate(
  templateId: string,
  userId: string
): Promise<{ success: boolean }> {
  // Check if system template
  if (isSystemTemplate(templateId)) {
    throw new Error("Cannot delete system templates");
  }

  // Verify ownership and existence
  const existing = await getTemplateById(templateId, userId);
  if (!existing) {
    return { success: false };
  }

  // Check permission: must be creator or team admin/owner
  const canDelete = await canEditTemplateInternal(existing, userId);
  if (!canDelete) {
    throw new Error("Not authorized to delete this template");
  }

  // Delete template (cascades to agenda items and planning questions)
  await db.delete(meetingTemplate).where(eq(meetingTemplate.id, templateId));

  return { success: true };
}

/**
 * Increment the usage count for a template.
 */
export async function incrementTemplateUsageCount(
  templateId: string
): Promise<void> {
  await db
    .update(meetingTemplate)
    .set({
      usageCount: sql`${meetingTemplate.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(meetingTemplate.id, templateId));
}

/**
 * Duplicate a template to the user's personal templates.
 * Can duplicate any readable template (system, own personal, or team member's team template).
 * The duplicate is always created as a personal template owned by the user.
 */
export async function duplicateTemplate(
  templateId: string,
  userId: string,
  newName?: string
): Promise<TemplateWithItems> {
  // Get the source template (authorization is handled by getTemplateById)
  const source = await getTemplateById(templateId, userId);
  if (!source) {
    throw new Error("Template not found or not accessible");
  }

  const newTemplateId = generateTemplateId();
  const duplicatedName = newName || `${source.name} (Copy)`;

  // Use transaction to ensure atomicity
  const { templateRow, agendaItems, planningQuestions } = await db.transaction(
    async (tx) => {
      // Insert duplicated template as personal
      const [insertedTemplate] = await tx
        .insert(meetingTemplate)
        .values({
          id: newTemplateId,
          name: duplicatedName,
          description: source.description,
          category: source.category,
          scope: "personal", // Always create as personal template
          teamId: null, // Personal templates have no team
          createdBy: userId,
          defaultDuration: source.defaultDuration,
          suggestedCadence: source.suggestedCadence,
          defaultGoal: source.defaultGoal,
          defaultSettings: source.defaultSettings,
          isArchived: false,
          usageCount: 0,
        })
        .returning();

      // Duplicate agenda items
      const insertedAgendaItems =
        source.agendaItems.length > 0
          ? await tx
              .insert(templateAgendaItem)
              .values(
                source.agendaItems.map((item, index) => ({
                  id: generateTemplateAgendaItemId(newTemplateId, index),
                  templateId: newTemplateId,
                  orderIndex: index,
                  title: item.title,
                  description: item.description,
                  estimatedDuration: item.estimatedDuration,
                  isRequired: item.isRequired,
                  presenterRole: item.presenterRole,
                }))
              )
              .returning()
          : [];

      // Duplicate planning questions
      const insertedPlanningQuestions =
        source.planningQuestions.length > 0
          ? await tx
              .insert(templatePlanningQuestion)
              .values(
                source.planningQuestions.map((q, index) => ({
                  id: generatePlanningQuestionId(newTemplateId, index),
                  templateId: newTemplateId,
                  orderIndex: index,
                  question: q.question,
                  category: q.category,
                  isRequired: q.isRequired,
                  placeholder: q.placeholder || null,
                }))
              )
              .returning()
          : [];

      return {
        templateRow: insertedTemplate,
        agendaItems: insertedAgendaItems,
        planningQuestions: insertedPlanningQuestions,
      };
    }
  );

  // Get creator info
  const [creatorRow] = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return {
    ...mapTemplateRow(templateRow),
    agendaItems: agendaItems.map(mapAgendaItemRow),
    planningQuestions: planningQuestions.map(mapPlanningQuestionRow),
    team: null, // Personal templates have no team
    creator: creatorRow || null,
  };
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Check if a user can read a template based on scope.
 * - System templates: accessible to all authenticated users
 * - Personal templates: only accessible to the creator
 * - Team templates: only accessible to team members
 */
async function canReadTemplate(
  template: typeof meetingTemplate.$inferSelect,
  userId: string
): Promise<boolean> {
  // System templates are accessible to everyone
  if (template.scope === "system") {
    return true;
  }

  // Personal templates: only the creator can read
  if (template.scope === "personal") {
    return template.createdBy === userId;
  }

  // Team templates: must be a team member
  if (template.scope === "team" && template.teamId) {
    return isTeamMember(template.teamId, userId);
  }

  return false;
}

/**
 * Check if a user can edit a template by ID.
 * Exported for use in API routes.
 */
export async function canEditTemplate(
  templateId: string,
  userId: string
): Promise<boolean> {
  // System templates cannot be edited
  if (isSystemTemplate(templateId)) {
    return false;
  }

  const template = await getTemplateById(templateId, userId);
  if (!template) {
    return false;
  }

  return canEditTemplateInternal(template, userId);
}

/**
 * Internal helper to check if a user can edit a template.
 */
async function canEditTemplateInternal(
  template: TemplateWithItems,
  userId: string
): Promise<boolean> {
  // Creator can always edit their own templates
  if (template.createdBy === userId) {
    return true;
  }

  // For team templates, check if user is admin or owner
  if (template.scope === "team" && template.teamId) {
    const [membership] = await db
      .select({ role: teamMember.role })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, template.teamId),
          eq(teamMember.userId, userId),
          eq(teamMember.status, "active")
        )
      )
      .limit(1);

    return membership?.role === "owner" || membership?.role === "admin";
  }

  return false;
}

/**
 * Get all team IDs where the user is an active member.
 */
async function getUserTeamIds(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(
      and(eq(teamMember.userId, userId), eq(teamMember.status, "active"))
    );

  return memberships.map((m) => m.teamId);
}

/**
 * Check if a user is a member of a team.
 */
export async function isTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  const [membership] = await db
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(
      and(
        eq(teamMember.teamId, teamId),
        eq(teamMember.userId, userId),
        eq(teamMember.status, "active")
      )
    )
    .limit(1);

  return !!membership;
}

/**
 * Check if a user has admin or owner role in a team.
 * Required for creating team templates.
 */
async function hasTeamAdminRole(
  teamId: string,
  userId: string
): Promise<boolean> {
  const [membership] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(
      and(
        eq(teamMember.teamId, teamId),
        eq(teamMember.userId, userId),
        eq(teamMember.status, "active")
      )
    )
    .limit(1);

  return membership?.role === "owner" || membership?.role === "admin";
}

// ============================================================================
// Mapping Helpers
// ============================================================================

/**
 * Map a database template row to the MeetingTemplate type.
 */
function mapTemplateRow(row: typeof meetingTemplate.$inferSelect): MeetingTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as TemplateCategory,
    scope: row.scope as TemplateScope,
    teamId: row.teamId,
    createdBy: row.createdBy,
    defaultDuration: row.defaultDuration,
    suggestedCadence: row.suggestedCadence,
    defaultGoal: row.defaultGoal,
    defaultSettings: row.defaultSettings || {},
    isArchived: row.isArchived,
    usageCount: row.usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Map a database agenda item row to the TemplateAgendaItem type.
 */
function mapAgendaItemRow(
  row: typeof templateAgendaItem.$inferSelect
): TemplateAgendaItem {
  return {
    id: row.id,
    templateId: row.templateId,
    orderIndex: row.orderIndex,
    title: row.title,
    description: row.description,
    estimatedDuration: row.estimatedDuration,
    isRequired: row.isRequired,
    presenterRole: row.presenterRole as TemplateAgendaItem["presenterRole"],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Map a database planning question row to the PlanningQuestion type.
 */
function mapPlanningQuestionRow(
  row: typeof templatePlanningQuestion.$inferSelect
): PlanningQuestion {
  return {
    id: row.id,
    question: row.question,
    category: row.category as PlanningQuestion["category"],
    isRequired: row.isRequired,
    placeholder: row.placeholder ?? undefined,
    orderIndex: row.orderIndex,
  };
}

/**
 * Group an array of objects by a key.
 */
function groupBy<T extends Record<string, unknown>>(
  array: T[],
  key: keyof T
): Record<string, T[]> {
  return array.reduce(
    (result, item) => {
      const groupKey = String(item[key]);
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
      return result;
    },
    {} as Record<string, T[]>
  );
}
