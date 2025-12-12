/**
 * Agenda Database Operations
 *
 * CRUD operations for meeting agendas and agenda items.
 * Used by API routes and (potentially) the agent for status updates.
 */

import { db } from "@/lib/db";
import { agenda, agendaItem } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import type {
  Agenda,
  AgendaItem,
  AgendaWithItems,
  AgendaItemInput,
  AgendaStatus,
  AgendaItemStatus,
} from "@/types/agenda";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique agenda ID.
 * Format: agenda-{roomId}-{timestamp}
 */
export function generateAgendaId(roomId: string): string {
  return `agenda-${roomId}-${Date.now()}`;
}

/**
 * Generates a unique agenda item ID.
 * Format: item-{agendaId}-{index}
 */
export function generateAgendaItemId(agendaId: string, index: number): string {
  return `item-${agendaId}-${index}`;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Gets an agenda by room ID.
 * Returns null if no agenda exists for the room.
 */
export async function getAgendaByRoomId(
  roomId: string
): Promise<Agenda | null> {
  const [result] = await db
    .select()
    .from(agenda)
    .where(eq(agenda.roomId, roomId))
    .limit(1);

  if (!result) {
    return null;
  }

  return mapDbAgendaToAgenda(result);
}

/**
 * Gets an agenda with all its items by room ID.
 * Returns null if no agenda exists for the room.
 */
export async function getAgendaWithItems(
  roomId: string
): Promise<AgendaWithItems | null> {
  const agendaResult = await getAgendaByRoomId(roomId);

  if (!agendaResult) {
    return null;
  }

  const items = await db
    .select()
    .from(agendaItem)
    .where(eq(agendaItem.agendaId, agendaResult.id))
    .orderBy(asc(agendaItem.orderIndex));

  return {
    ...agendaResult,
    items: items.map(mapDbAgendaItemToAgendaItem),
  };
}

/**
 * Gets an agenda item by ID.
 */
export async function getAgendaItemById(
  itemId: string
): Promise<AgendaItem | null> {
  const [result] = await db
    .select()
    .from(agendaItem)
    .where(eq(agendaItem.id, itemId))
    .limit(1);

  if (!result) {
    return null;
  }

  return mapDbAgendaItemToAgendaItem(result);
}

/**
 * Gets all items for an agenda, ordered by orderIndex.
 */
export async function getAgendaItems(agendaId: string): Promise<AgendaItem[]> {
  const items = await db
    .select()
    .from(agendaItem)
    .where(eq(agendaItem.agendaId, agendaId))
    .orderBy(asc(agendaItem.orderIndex));

  return items.map(mapDbAgendaItemToAgendaItem);
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Creates or updates an agenda for a room.
 *
 * - If no agenda exists: creates new agenda with draft status
 * - If agenda exists and is draft: updates items, increments version
 * - If agenda exists and is active/completed: throws error
 *
 * @throws Error if agenda exists and is not in draft status
 */
export async function upsertAgenda(
  roomId: string,
  createdBy: string,
  items: AgendaItemInput[]
): Promise<AgendaWithItems> {
  // Check for existing agenda
  const existing = await getAgendaByRoomId(roomId);

  if (existing) {
    // Only allow updates to draft agendas
    if (existing.status !== "draft") {
      throw new Error(
        `Cannot modify agenda in ${existing.status} status. Agenda is locked.`
      );
    }

    // Update existing draft agenda
    return await updateDraftAgenda(existing.id, items);
  }

  // Create new agenda
  return await createAgenda(roomId, createdBy, items);
}

/**
 * Creates a new agenda with items.
 */
export async function createAgenda(
  roomId: string,
  createdBy: string,
  items: AgendaItemInput[]
): Promise<AgendaWithItems> {
  const agendaId = generateAgendaId(roomId);
  const now = new Date();

  // Insert agenda
  await db.insert(agenda).values({
    id: agendaId,
    roomId,
    createdBy,
    itemCount: items.length,
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Insert items
  if (items.length > 0) {
    await db.insert(agendaItem).values(
      items.map((item, index) => ({
        id: generateAgendaItemId(agendaId, index),
        agendaId,
        orderIndex: index,
        title: item.title,
        description: item.description ?? null,
        estimatedDuration: item.estimatedDuration ?? null,
        presenter: item.presenter ?? null,
        status: "pending" as const,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  return (await getAgendaWithItems(roomId))!;
}

/**
 * Updates a draft agenda with new items.
 * Replaces all existing items with new ones.
 */
async function updateDraftAgenda(
  agendaId: string,
  items: AgendaItemInput[]
): Promise<AgendaWithItems> {
  const now = new Date();

  // Delete existing items
  await db.delete(agendaItem).where(eq(agendaItem.agendaId, agendaId));

  // Insert new items
  if (items.length > 0) {
    await db.insert(agendaItem).values(
      items.map((item, index) => ({
        id: generateAgendaItemId(agendaId, index),
        agendaId,
        orderIndex: index,
        title: item.title,
        description: item.description ?? null,
        estimatedDuration: item.estimatedDuration ?? null,
        presenter: item.presenter ?? null,
        status: "pending" as const,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  // Update agenda metadata
  await db
    .update(agenda)
    .set({
      itemCount: items.length,
      version: sql`${agenda.version} + 1`,
      updatedAt: now,
    })
    .where(eq(agenda.id, agendaId));

  // Get the updated agenda
  const [updated] = await db
    .select()
    .from(agenda)
    .where(eq(agenda.id, agendaId))
    .limit(1);

  const updatedItems = await getAgendaItems(agendaId);

  return {
    ...mapDbAgendaToAgenda(updated),
    items: updatedItems,
  };
}

/**
 * Publishes an agenda, transitioning it from draft to active.
 * This locks the agenda definition and prepares it for tracking.
 *
 * @throws Error if agenda doesn't exist or is not in draft status
 */
export async function publishAgenda(roomId: string): Promise<AgendaWithItems> {
  const existing = await getAgendaByRoomId(roomId);

  if (!existing) {
    throw new Error("No agenda found for this room");
  }

  if (existing.status !== "draft") {
    throw new Error(`Agenda is already ${existing.status}`);
  }

  const now = new Date();

  await db
    .update(agenda)
    .set({
      status: "active",
      updatedAt: now,
    })
    .where(eq(agenda.id, existing.id));

  return (await getAgendaWithItems(roomId))!;
}

/**
 * Updates a single agenda item.
 * Only allowed when agenda is in draft status.
 *
 * @throws Error if item doesn't exist or agenda is not draft
 */
export async function updateAgendaItem(
  itemId: string,
  updates: Partial<
    Pick<AgendaItem, "title" | "description" | "estimatedDuration" | "presenter" | "orderIndex">
  >
): Promise<AgendaItem> {
  const item = await getAgendaItemById(itemId);

  if (!item) {
    throw new Error("Agenda item not found");
  }

  // Check agenda status
  const [parentAgenda] = await db
    .select()
    .from(agenda)
    .where(eq(agenda.id, item.agendaId))
    .limit(1);

  if (parentAgenda.status !== "draft") {
    throw new Error("Cannot modify items in a published agenda");
  }

  const now = new Date();

  await db
    .update(agendaItem)
    .set({
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.estimatedDuration !== undefined && {
        estimatedDuration: updates.estimatedDuration,
      }),
      ...(updates.presenter !== undefined && { presenter: updates.presenter }),
      ...(updates.orderIndex !== undefined && { orderIndex: updates.orderIndex }),
      updatedAt: now,
    })
    .where(eq(agendaItem.id, itemId));

  // Update parent agenda version
  await db
    .update(agenda)
    .set({
      version: sql`${agenda.version} + 1`,
      updatedAt: now,
    })
    .where(eq(agenda.id, item.agendaId));

  return (await getAgendaItemById(itemId))!;
}

/**
 * Deletes a single agenda item.
 * Only allowed when agenda is in draft status.
 *
 * @throws Error if item doesn't exist or agenda is not draft
 */
export async function deleteAgendaItem(itemId: string): Promise<void> {
  const item = await getAgendaItemById(itemId);

  if (!item) {
    throw new Error("Agenda item not found");
  }

  // Check agenda status
  const [parentAgenda] = await db
    .select()
    .from(agenda)
    .where(eq(agenda.id, item.agendaId))
    .limit(1);

  if (parentAgenda.status !== "draft") {
    throw new Error("Cannot delete items from a published agenda");
  }

  const now = new Date();

  // Delete the item
  await db.delete(agendaItem).where(eq(agendaItem.id, itemId));

  // Update parent agenda
  await db
    .update(agenda)
    .set({
      itemCount: sql`${agenda.itemCount} - 1`,
      version: sql`${agenda.version} + 1`,
      updatedAt: now,
    })
    .where(eq(agenda.id, item.agendaId));

  // Reorder remaining items
  const remainingItems = await getAgendaItems(item.agendaId);
  for (let i = 0; i < remainingItems.length; i++) {
    if (remainingItems[i].orderIndex !== i) {
      await db
        .update(agendaItem)
        .set({ orderIndex: i, updatedAt: now })
        .where(eq(agendaItem.id, remainingItems[i].id));
    }
  }
}

/**
 * Reorders agenda items.
 * Only allowed when agenda is in draft status.
 *
 * @param agendaId - The agenda ID
 * @param itemIds - Item IDs in desired order
 * @throws Error if agenda is not draft or items don't match
 */
export async function reorderAgendaItems(
  agendaId: string,
  itemIds: string[]
): Promise<AgendaItem[]> {
  // Check agenda status
  const [parentAgenda] = await db
    .select()
    .from(agenda)
    .where(eq(agenda.id, agendaId))
    .limit(1);

  if (!parentAgenda) {
    throw new Error("Agenda not found");
  }

  if (parentAgenda.status !== "draft") {
    throw new Error("Cannot reorder items in a published agenda");
  }

  // Verify all items belong to this agenda
  const existingItems = await getAgendaItems(agendaId);
  const existingIds = new Set(existingItems.map((i) => i.id));

  if (itemIds.length !== existingIds.size) {
    throw new Error("Item count mismatch");
  }

  for (const id of itemIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Item ${id} does not belong to this agenda`);
    }
  }

  const now = new Date();

  // Update order indices
  for (let i = 0; i < itemIds.length; i++) {
    await db
      .update(agendaItem)
      .set({ orderIndex: i, updatedAt: now })
      .where(eq(agendaItem.id, itemIds[i]));
  }

  // Update agenda version
  await db
    .update(agenda)
    .set({
      version: sql`${agenda.version} + 1`,
      updatedAt: now,
    })
    .where(eq(agenda.id, agendaId));

  return await getAgendaItems(agendaId);
}

// ============================================================================
// Status Update Operations (Used by Agent)
// ============================================================================

/**
 * Updates an agenda item's status and timestamps.
 * Used by the agent for automatic topic tracking.
 */
export async function updateAgendaItemStatus(
  itemId: string,
  status: AgendaItemStatus,
  transcriptRef?: string
): Promise<AgendaItem> {
  const item = await getAgendaItemById(itemId);

  if (!item) {
    throw new Error("Agenda item not found");
  }

  const now = new Date();

  const updates: Record<string, unknown> = {
    status,
    updatedAt: now,
  };

  if (status === "in_progress") {
    updates.startedAt = now;
    if (transcriptRef) {
      updates.startTranscriptRef = transcriptRef;
    }
  } else if (status === "completed" || status === "skipped") {
    updates.completedAt = now;
    if (transcriptRef) {
      updates.endTranscriptRef = transcriptRef;
    }
    // Calculate actual duration if we have a start time
    if (item.startedAt) {
      const startTime = new Date(item.startedAt).getTime();
      updates.actualDuration = Math.round((now.getTime() - startTime) / 1000);
    }
  }

  await db.update(agendaItem).set(updates).where(eq(agendaItem.id, itemId));

  return (await getAgendaItemById(itemId))!;
}

/**
 * Starts an agenda item (marks it as in_progress).
 */
export async function startAgendaItem(
  itemId: string,
  transcriptRef?: string
): Promise<AgendaItem> {
  return updateAgendaItemStatus(itemId, "in_progress", transcriptRef);
}

/**
 * Completes an agenda item.
 */
export async function completeAgendaItem(
  itemId: string,
  transcriptRef?: string
): Promise<AgendaItem> {
  return updateAgendaItemStatus(itemId, "completed", transcriptRef);
}

/**
 * Updates the current item index on an agenda.
 */
export async function updateAgendaCurrentItem(
  agendaId: string,
  currentItemIndex: number | null
): Promise<void> {
  await db
    .update(agenda)
    .set({
      currentItemIndex,
      updatedAt: new Date(),
    })
    .where(eq(agenda.id, agendaId));
}

/**
 * Marks the meeting as started.
 */
export async function startMeeting(agendaId: string): Promise<void> {
  await db
    .update(agenda)
    .set({
      meetingStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agenda.id, agendaId));
}

/**
 * Marks the meeting as ended.
 */
export async function endMeeting(agendaId: string): Promise<void> {
  await db
    .update(agenda)
    .set({
      status: "completed",
      meetingEndedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agenda.id, agendaId));
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Deletes an agenda and all its items.
 */
export async function deleteAgenda(agendaId: string): Promise<void> {
  // Items will cascade delete due to foreign key
  await db.delete(agenda).where(eq(agenda.id, agendaId));
}

/**
 * Deletes an agenda by room ID.
 */
export async function deleteAgendaByRoomId(roomId: string): Promise<void> {
  const existing = await getAgendaByRoomId(roomId);
  if (existing) {
    await deleteAgenda(existing.id);
  }
}

// ============================================================================
// Mapping Helpers
// ============================================================================

/**
 * Maps a database agenda row to the Agenda type.
 */
function mapDbAgendaToAgenda(row: typeof agenda.$inferSelect): Agenda {
  return {
    id: row.id,
    roomId: row.roomId,
    createdBy: row.createdBy,
    itemCount: row.itemCount,
    status: row.status as AgendaStatus,
    currentItemIndex: row.currentItemIndex,
    version: row.version,
    meetingStartedAt: row.meetingStartedAt?.toISOString() ?? null,
    meetingEndedAt: row.meetingEndedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

/**
 * Maps a database agenda item row to the AgendaItem type.
 */
function mapDbAgendaItemToAgendaItem(
  row: typeof agendaItem.$inferSelect
): AgendaItem {
  return {
    id: row.id,
    agendaId: row.agendaId,
    title: row.title,
    description: row.description,
    estimatedDuration: row.estimatedDuration,
    presenter: row.presenter,
    orderIndex: row.orderIndex,
    status: row.status as AgendaItemStatus,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    actualDuration: row.actualDuration,
    startTranscriptRef: row.startTranscriptRef,
    endTranscriptRef: row.endTranscriptRef,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}
