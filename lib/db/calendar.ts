/**
 * Calendar Integration Database Operations
 *
 * CRUD operations for the calendar_integration table.
 * Handles Google Calendar OAuth token storage and management.
 */

import { db } from "@/lib/db";
import { calendarIntegration } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import type {
  CalendarIntegration,
  CalendarIntegrationPublic,
  CalendarProvider,
  CalendarIntegrationStatus,
} from "@/types/calendar";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a cryptographically secure random string.
 */
function secureRandomString(length: number, charset: string): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (num) => charset[num % charset.length]).join("");
}

/**
 * Generates a unique calendar integration ID.
 */
export function generateCalendarIntegrationId(): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, "abcdefghijklmnopqrstuvwxyz0123456789");
  return `cal-${timestamp}-${random}`;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to a CalendarIntegration object.
 */
function rowToCalendarIntegration(
  row: typeof calendarIntegration.$inferSelect
): CalendarIntegration {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider as CalendarProvider,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken ?? undefined,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    scope: row.scope,
    calendarEmail: row.calendarEmail,
    status: row.status as CalendarIntegrationStatus,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Converts a CalendarIntegration to a public-safe version (no tokens).
 */
export function toPublicCalendarIntegration(
  integration: CalendarIntegration
): CalendarIntegrationPublic {
  return {
    id: integration.id,
    provider: integration.provider,
    calendarEmail: integration.calendarEmail ?? null,
    status: integration.status,
    lastSyncedAt: integration.lastSyncedAt ?? null,
    errorMessage: integration.errorMessage ?? null,
    createdAt: integration.createdAt,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Gets a user's calendar integration by provider.
 */
export async function getCalendarIntegration(
  userId: string,
  provider: CalendarProvider = "google"
): Promise<CalendarIntegration | null> {
  const [row] = await db
    .select()
    .from(calendarIntegration)
    .where(
      and(
        eq(calendarIntegration.userId, userId),
        eq(calendarIntegration.provider, provider)
      )
    )
    .limit(1);

  return row ? rowToCalendarIntegration(row) : null;
}

/**
 * Gets a user's calendar integration by ID.
 */
export async function getCalendarIntegrationById(
  integrationId: string
): Promise<CalendarIntegration | null> {
  const [row] = await db
    .select()
    .from(calendarIntegration)
    .where(eq(calendarIntegration.id, integrationId))
    .limit(1);

  return row ? rowToCalendarIntegration(row) : null;
}

/**
 * Creates or updates a calendar integration.
 * If one already exists for the user+provider, it updates the tokens.
 * Uses ON CONFLICT to handle race conditions atomically.
 */
export async function upsertCalendarIntegration(params: {
  userId: string;
  provider?: CalendarProvider;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scope?: string;
  calendarEmail?: string;
}): Promise<CalendarIntegration> {
  const provider = params.provider ?? "google";
  const integrationId = generateCalendarIntegrationId();

  // Use INSERT ... ON CONFLICT DO UPDATE for atomic upsert
  // This prevents race conditions from check-then-update pattern
  const [row] = await db
    .insert(calendarIntegration)
    .values({
      id: integrationId,
      userId: params.userId,
      provider,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? null,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      scope: params.scope ?? null,
      calendarEmail: params.calendarEmail ?? null,
      status: "connected",
    })
    .onConflictDoUpdate({
      // Use the unique constraint on (user_id, provider)
      target: [calendarIntegration.userId, calendarIntegration.provider],
      set: {
        accessToken: params.accessToken,
        // Keep existing refresh token if new one not provided
        refreshToken: params.refreshToken ?? calendarIntegration.refreshToken,
        tokenExpiresAt: params.tokenExpiresAt ?? null,
        scope: params.scope ?? calendarIntegration.scope,
        calendarEmail: params.calendarEmail ?? calendarIntegration.calendarEmail,
        status: "connected",
        errorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rowToCalendarIntegration(row);
}

/**
 * Updates calendar integration tokens (for refresh flow).
 */
export async function updateCalendarTokens(
  integrationId: string,
  params: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
  }
): Promise<CalendarIntegration | null> {
  const [row] = await db
    .update(calendarIntegration)
    .set({
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      status: "connected",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegration.id, integrationId))
    .returning();

  return row ? rowToCalendarIntegration(row) : null;
}

/**
 * Sets the integration status to error.
 */
export async function setCalendarIntegrationError(
  integrationId: string,
  errorMessage: string
): Promise<CalendarIntegration | null> {
  const [row] = await db
    .update(calendarIntegration)
    .set({
      status: "error",
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegration.id, integrationId))
    .returning();

  return row ? rowToCalendarIntegration(row) : null;
}

/**
 * Updates the last synced timestamp.
 */
export async function updateCalendarLastSynced(
  integrationId: string
): Promise<void> {
  await db
    .update(calendarIntegration)
    .set({
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegration.id, integrationId));
}

/**
 * Disconnects a calendar integration (soft delete - marks as disconnected).
 * Clears all sensitive token data for security.
 */
export async function disconnectCalendarIntegration(
  userId: string,
  provider: CalendarProvider = "google"
): Promise<boolean> {
  const result = await db
    .update(calendarIntegration)
    .set({
      status: "disconnected",
      // Completely clear all sensitive token data
      accessToken: "REVOKED", // Non-null placeholder (required field)
      refreshToken: null,
      tokenExpiresAt: null,
      scope: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(calendarIntegration.userId, userId),
        eq(calendarIntegration.provider, provider)
      )
    )
    .returning({ id: calendarIntegration.id });

  return result.length > 0;
}

/**
 * Permanently deletes a calendar integration.
 */
export async function deleteCalendarIntegration(
  userId: string,
  provider: CalendarProvider = "google"
): Promise<boolean> {
  const result = await db
    .delete(calendarIntegration)
    .where(
      and(
        eq(calendarIntegration.userId, userId),
        eq(calendarIntegration.provider, provider)
      )
    )
    .returning({ id: calendarIntegration.id });

  return result.length > 0;
}

/**
 * Checks if a user has a connected calendar.
 */
export async function hasConnectedCalendar(
  userId: string,
  provider: CalendarProvider = "google"
): Promise<boolean> {
  const integration = await getCalendarIntegration(userId, provider);
  return integration?.status === "connected";
}

/**
 * Gets all integrations that need token refresh (expiring within 5 minutes).
 * Uses SQL filtering for better performance.
 */
export async function getIntegrationsNeedingRefresh(): Promise<
  CalendarIntegration[]
> {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // Filter in SQL for better performance
  const rows = await db
    .select()
    .from(calendarIntegration)
    .where(
      and(
        eq(calendarIntegration.status, "connected"),
        lt(calendarIntegration.tokenExpiresAt, fiveMinutesFromNow)
      )
    );

  // Only return rows that have a refresh token (can't filter null in SQL easily with drizzle)
  return rows
    .filter((row) => row.refreshToken !== null)
    .map(rowToCalendarIntegration);
}
