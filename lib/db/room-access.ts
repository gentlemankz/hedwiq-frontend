import { db } from "@/lib/db";
import { roomParticipant } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Records a user's participation in a room.
 * Updates last_accessed_at if the user has already joined the room.
 */
export async function recordRoomParticipation(
  userId: string,
  roomId: string
): Promise<void> {
  const id = `${userId}-${roomId}`;
  const now = new Date();

  // Upsert: insert or update last_accessed_at
  await db
    .insert(roomParticipant)
    .values({
      id,
      userId,
      roomId,
      joinedAt: now,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: roomParticipant.id,
      set: {
        lastAccessedAt: now,
      },
    });
}

/**
 * Checks if a user has ever joined a room.
 * Returns true if the user is a room participant, false otherwise.
 */
export async function isRoomParticipant(
  userId: string,
  roomId: string
): Promise<boolean> {
  const [participant] = await db
    .select({ id: roomParticipant.id })
    .from(roomParticipant)
    .where(
      and(
        eq(roomParticipant.userId, userId),
        eq(roomParticipant.roomId, roomId)
      )
    )
    .limit(1);

  return !!participant;
}

/**
 * Validates room access for a user.
 * Returns an error message if access is denied, null if access is allowed.
 */
export async function validateRoomAccess(
  userId: string,
  roomId: string
): Promise<string | null> {
  const hasAccess = await isRoomParticipant(userId, roomId);

  if (!hasAccess) {
    return "You do not have access to this room's documents";
  }

  return null;
}
