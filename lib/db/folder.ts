/**
 * Folder Database Operations
 *
 * CRUD operations for the meeting_folder table.
 * Handles folder creation, updates, deletion, and reordering.
 */

import { db } from "@/lib/db";
import { meetingFolder, meeting } from "@/lib/db/schema";
import { eq, and, desc, sql, ne } from "drizzle-orm";
import { secureRandomString } from "@/lib/utils";
import type { Folder } from "@/types/folder";
import { DEFAULT_FOLDER_NAME } from "@/types/folder";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique folder ID.
 */
export function generateFolderId(userId: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `folder-${userId.slice(0, 8)}-${timestamp}-${random}`;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to a Folder object.
 */
function rowToFolder(
  row: typeof meetingFolder.$inferSelect,
  meetingCount?: number
): Folder {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    icon: row.icon,
    orderIndex: row.orderIndex,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(meetingCount !== undefined && { meetingCount }),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Creates a new folder for a user.
 * Uses a transaction to prevent race conditions on orderIndex assignment.
 */
export async function createFolder(params: {
  userId: string;
  name: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
}): Promise<Folder> {
  const folderId = generateFolderId(params.userId);

  // Use transaction to prevent race condition on orderIndex
  const row = await db.transaction(async (tx) => {
    // Get the next order index for this user (within transaction)
    const [maxOrder] = await tx
      .select({ maxIndex: sql<number>`COALESCE(MAX(order_index), -1)` })
      .from(meetingFolder)
      .where(eq(meetingFolder.userId, params.userId));

    const nextOrderIndex = (maxOrder?.maxIndex ?? -1) + 1;

    const [inserted] = await tx
      .insert(meetingFolder)
      .values({
        id: folderId,
        userId: params.userId,
        name: params.name.trim(),
        color: params.color ?? null,
        icon: params.icon ?? null,
        orderIndex: nextOrderIndex,
        isDefault: params.isDefault ?? false,
      })
      .returning();

    return inserted;
  });

  return rowToFolder(row);
}

/**
 * Gets or creates the default folder for a user.
 * This ensures every user has a "General" folder for uncategorized meetings.
 * RACE-SAFE: Uses INSERT ... ON CONFLICT DO NOTHING followed by SELECT
 * to handle concurrent requests atomically.
 */
export async function getOrCreateDefaultFolder(userId: string): Promise<Folder> {
  const folderId = generateFolderId(userId);

  // Use transaction for atomicity
  return db.transaction(async (tx) => {
    // Attempt to insert with conflict handling
    // If another concurrent request already created the default folder,
    // this will do nothing due to the unique constraint on (userId, isDefault=true)
    await tx
      .insert(meetingFolder)
      .values({
        id: folderId,
        userId,
        name: DEFAULT_FOLDER_NAME,
        isDefault: true,
        orderIndex: 0,
      })
      .onConflictDoNothing();

    // Now fetch the default folder (either just created or existing)
    const [folder] = await tx
      .select()
      .from(meetingFolder)
      .where(and(eq(meetingFolder.userId, userId), eq(meetingFolder.isDefault, true)))
      .limit(1);

    if (!folder) {
      // This should never happen if the unique constraint exists
      throw new Error("Failed to create or retrieve default folder");
    }

    return rowToFolder(folder);
  });
}

/**
 * Gets a folder by ID.
 */
export async function getFolderById(folderId: string): Promise<Folder | null> {
  const [row] = await db
    .select()
    .from(meetingFolder)
    .where(eq(meetingFolder.id, folderId))
    .limit(1);

  return row ? rowToFolder(row) : null;
}

/**
 * Gets a folder by ID with ownership check.
 */
export async function getFolderByIdForUser(
  folderId: string,
  userId: string
): Promise<Folder | null> {
  const [row] = await db
    .select()
    .from(meetingFolder)
    .where(and(eq(meetingFolder.id, folderId), eq(meetingFolder.userId, userId)))
    .limit(1);

  return row ? rowToFolder(row) : null;
}

/**
 * Lists all folders for a user, ordered by orderIndex.
 * Optionally includes meeting counts.
 * Creates a default folder only if no folders exist (lazy initialization).
 */
export async function listFoldersByUser(
  userId: string,
  options: { includeMeetingCounts?: boolean } = {}
): Promise<Folder[]> {
  let folders: Folder[];

  if (options.includeMeetingCounts) {
    // Query with meeting counts - only count meetings owned by this user
    const rows = await db
      .select({
        folder: meetingFolder,
        meetingCount: sql<number>`COUNT(${meeting.id})::int`,
      })
      .from(meetingFolder)
      .leftJoin(
        meeting,
        and(eq(meeting.folderId, meetingFolder.id), eq(meeting.hostId, userId))
      )
      .where(eq(meetingFolder.userId, userId))
      .groupBy(meetingFolder.id)
      .orderBy(meetingFolder.orderIndex, desc(meetingFolder.createdAt));

    folders = rows.map((row) => rowToFolder(row.folder, row.meetingCount));
  } else {
    // Simple query without counts
    const rows = await db
      .select()
      .from(meetingFolder)
      .where(eq(meetingFolder.userId, userId))
      .orderBy(meetingFolder.orderIndex, desc(meetingFolder.createdAt));

    folders = rows.map((row) => rowToFolder(row));
  }

  // Lazy initialization: only create default folder if user has no folders
  if (folders.length === 0) {
    const defaultFolder = await getOrCreateDefaultFolder(userId);
    return [defaultFolder];
  }

  return folders;
}

/**
 * Updates a folder.
 * Cannot update a folder to have the same name as another folder for the same user.
 */
export async function updateFolder(
  folderId: string,
  userId: string,
  updates: {
    name?: string;
    color?: string | null;
    icon?: string | null;
  }
): Promise<Folder | null> {
  const updateData: Partial<typeof meetingFolder.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }
  if (updates.icon !== undefined) {
    updateData.icon = updates.icon;
  }

  const [row] = await db
    .update(meetingFolder)
    .set(updateData)
    .where(and(eq(meetingFolder.id, folderId), eq(meetingFolder.userId, userId)))
    .returning();

  return row ? rowToFolder(row) : null;
}

/**
 * Deletes a folder and moves all its meetings to the default folder.
 * Cannot delete the default folder.
 * Uses a transaction to ensure atomicity of all operations.
 */
export async function deleteFolder(
  folderId: string,
  userId: string
): Promise<{ success: boolean; meetingsMoved: number }> {
  // Use transaction to ensure atomicity of all operations including default folder creation
  const result = await db.transaction(async (tx) => {
    // Get the folder to check if it's the default (within transaction for consistency)
    const [folder] = await tx
      .select()
      .from(meetingFolder)
      .where(and(eq(meetingFolder.id, folderId), eq(meetingFolder.userId, userId)))
      .limit(1);

    if (!folder) {
      return { success: false, meetingsMoved: 0 };
    }

    if (folder.isDefault) {
      throw new Error("Cannot delete the default folder");
    }

    // Find or create the default folder within transaction
    let [defaultFolder] = await tx
      .select()
      .from(meetingFolder)
      .where(and(eq(meetingFolder.userId, userId), eq(meetingFolder.isDefault, true)))
      .limit(1);

    if (!defaultFolder) {
      // Create default folder within transaction
      const defaultFolderId = generateFolderId(userId);
      [defaultFolder] = await tx
        .insert(meetingFolder)
        .values({
          id: defaultFolderId,
          userId,
          name: DEFAULT_FOLDER_NAME,
          isDefault: true,
          orderIndex: 0,
        })
        .returning();
    }

    // Move all meetings owned by this user from this folder to the default folder
    // SECURITY: Only move meetings where hostId matches to prevent cross-tenant data issues
    const moveResult = await tx
      .update(meeting)
      .set({ folderId: defaultFolder.id, updatedAt: new Date() })
      .where(and(eq(meeting.folderId, folderId), eq(meeting.hostId, userId)))
      .returning({ id: meeting.id });

    // Delete the folder
    const deleteResult = await tx
      .delete(meetingFolder)
      .where(and(eq(meetingFolder.id, folderId), eq(meetingFolder.userId, userId)))
      .returning({ id: meetingFolder.id });

    return {
      success: deleteResult.length > 0,
      meetingsMoved: moveResult.length,
    };
  });

  return result;
}

/**
 * Reorders folders by updating their orderIndex values.
 * OPTIMIZED: Uses single SQL UPDATE with CASE expression instead of N updates.
 */
export async function reorderFolders(
  userId: string,
  folderIds: string[]
): Promise<boolean> {
  if (folderIds.length === 0) return true;

  // Verify all folders belong to this user
  const userFolders = await db
    .select({ id: meetingFolder.id })
    .from(meetingFolder)
    .where(eq(meetingFolder.userId, userId));

  const userFolderIds = new Set(userFolders.map((f) => f.id));

  // Check that all provided IDs belong to the user
  for (const id of folderIds) {
    if (!userFolderIds.has(id)) {
      throw new Error(`Folder ${id} does not belong to user`);
    }
  }

  // OPTIMIZED: Build a single UPDATE with CASE expression
  // UPDATE meeting_folder SET order_index = CASE
  //   WHEN id = 'id1' THEN 0
  //   WHEN id = 'id2' THEN 1
  //   ...
  // END, updated_at = NOW()
  // WHERE id IN ('id1', 'id2', ...) AND user_id = userId
  const caseClause = folderIds
    .map((id, index) => `WHEN id = '${id}' THEN ${index}`)
    .join(" ");

  await db.execute(sql`
    UPDATE meeting_folder
    SET order_index = CASE ${sql.raw(caseClause)} END,
        updated_at = NOW()
    WHERE id IN ${folderIds}
      AND user_id = ${userId}
  `);

  return true;
}

/**
 * Checks if a folder name already exists for a user (case-insensitive).
 */
export async function folderNameExists(
  userId: string,
  name: string,
  excludeFolderId?: string
): Promise<boolean> {
  const normalizedName = name.trim().toLowerCase();

  // Build conditions array
  const conditions = [
    eq(meetingFolder.userId, userId),
    sql`LOWER(${meetingFolder.name}) = ${normalizedName}`,
  ];

  // Add exclusion if provided
  if (excludeFolderId) {
    conditions.push(ne(meetingFolder.id, excludeFolderId));
  }

  const [existing] = await db
    .select({ id: meetingFolder.id })
    .from(meetingFolder)
    .where(and(...conditions))
    .limit(1);

  return !!existing;
}

/**
 * Gets the count of meetings in a specific folder for a user.
 * SECURITY: Only counts meetings owned by the specified user.
 */
export async function getMeetingCountInFolder(
  folderId: string,
  userId: string
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(meeting)
    .where(and(eq(meeting.folderId, folderId), eq(meeting.hostId, userId)));

  return result?.count ?? 0;
}

/**
 * Checks if a user owns a folder.
 */
export async function isFolderOwner(
  folderId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: meetingFolder.id })
    .from(meetingFolder)
    .where(and(eq(meetingFolder.id, folderId), eq(meetingFolder.userId, userId)))
    .limit(1);

  return !!row;
}
