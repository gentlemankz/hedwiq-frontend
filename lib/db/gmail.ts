/**
 * Gmail Integration Database Operations
 *
 * CRUD operations for the gmail_integration table.
 * Handles Gmail OAuth token storage and management.
 */

import { db } from "@/lib/db";
import { gmailIntegration } from "@/lib/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { generatePrefixedId } from "@/lib/utils";
import {
  REVOKED_TOKEN_PLACEHOLDER,
  isTokenExpiringSoon,
} from "@/lib/google-oauth-base";
import {
  refreshGmailAccessToken,
  calculateGmailTokenExpiry,
} from "@/lib/gmail-oauth";
import type {
  GmailIntegration,
  GmailIntegrationPublic,
  GmailIntegrationStatus,
} from "@/types/gmail";

// ============================================================================
// Constants
// ============================================================================

/** Prefix for Gmail integration IDs */
const GMAIL_ID_PREFIX = "gmail";

// In-memory lock to prevent concurrent token refreshes for the same user
// Note: This only works for single-instance deployments. For distributed systems,
// use a distributed lock (e.g., Redis SETNX) or optimistic locking with version field.
const tokenRefreshLocks = new Map<string, Promise<void>>();

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique Gmail integration ID.
 */
export function generateGmailIntegrationId(): string {
  return generatePrefixedId(GMAIL_ID_PREFIX);
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts a database row to a GmailIntegration object.
 */
function rowToGmailIntegration(
  row: typeof gmailIntegration.$inferSelect
): GmailIntegration {
  return {
    id: row.id,
    userId: row.userId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken ?? undefined,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    scope: row.scope,
    gmailEmail: row.gmailEmail,
    status: row.status as GmailIntegrationStatus,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Converts a GmailIntegration to a public-safe version (no tokens).
 */
export function toPublicGmailIntegration(
  integration: GmailIntegration
): GmailIntegrationPublic {
  return {
    id: integration.id,
    gmailEmail: integration.gmailEmail ?? null,
    status: integration.status,
    errorMessage: integration.errorMessage ?? null,
    createdAt: integration.createdAt,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Gets a user's Gmail integration.
 */
export async function getGmailIntegration(
  userId: string
): Promise<GmailIntegration | null> {
  const [row] = await db
    .select()
    .from(gmailIntegration)
    .where(eq(gmailIntegration.userId, userId))
    .limit(1);

  return row ? rowToGmailIntegration(row) : null;
}

/**
 * Gets a Gmail integration by ID.
 */
export async function getGmailIntegrationById(
  integrationId: string
): Promise<GmailIntegration | null> {
  const [row] = await db
    .select()
    .from(gmailIntegration)
    .where(eq(gmailIntegration.id, integrationId))
    .limit(1);

  return row ? rowToGmailIntegration(row) : null;
}

/**
 * Creates or updates a Gmail integration.
 * If one already exists for the user, it updates the tokens.
 * Uses ON CONFLICT to handle race conditions atomically.
 */
export async function upsertGmailIntegration(params: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scope?: string;
  gmailEmail?: string;
}): Promise<GmailIntegration> {
  const integrationId = generateGmailIntegrationId();

  // Use INSERT ... ON CONFLICT DO UPDATE for atomic upsert
  const [row] = await db
    .insert(gmailIntegration)
    .values({
      id: integrationId,
      userId: params.userId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? null,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      scope: params.scope ?? null,
      gmailEmail: params.gmailEmail ?? null,
      status: "connected",
    })
    .onConflictDoUpdate({
      // Use the unique constraint on user_id
      target: [gmailIntegration.userId],
      set: {
        accessToken: params.accessToken,
        // Keep existing refresh token if new one not provided
        refreshToken: params.refreshToken ?? gmailIntegration.refreshToken,
        tokenExpiresAt: params.tokenExpiresAt ?? null,
        scope: params.scope ?? gmailIntegration.scope,
        gmailEmail: params.gmailEmail ?? gmailIntegration.gmailEmail,
        status: "connected",
        errorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rowToGmailIntegration(row);
}

/**
 * Updates Gmail integration tokens (for refresh flow).
 */
export async function updateGmailTokens(
  integrationId: string,
  params: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
  }
): Promise<GmailIntegration | null> {
  const [row] = await db
    .update(gmailIntegration)
    .set({
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      status: "connected",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(gmailIntegration.id, integrationId))
    .returning();

  return row ? rowToGmailIntegration(row) : null;
}

/**
 * Sets the integration status to error.
 */
export async function setGmailIntegrationError(
  integrationId: string,
  errorMessage: string
): Promise<GmailIntegration | null> {
  const [row] = await db
    .update(gmailIntegration)
    .set({
      status: "error",
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(gmailIntegration.id, integrationId))
    .returning();

  return row ? rowToGmailIntegration(row) : null;
}

/**
 * Disconnects a Gmail integration (soft delete - marks as disconnected).
 * Clears all sensitive token data for security.
 */
export async function disconnectGmailIntegration(
  userId: string
): Promise<boolean> {
  const result = await db
    .update(gmailIntegration)
    .set({
      status: "disconnected",
      // Completely clear all sensitive token data
      accessToken: REVOKED_TOKEN_PLACEHOLDER, // Non-null placeholder (required field)
      refreshToken: null,
      tokenExpiresAt: null,
      scope: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(gmailIntegration.userId, userId))
    .returning({ id: gmailIntegration.id });

  return result.length > 0;
}

/**
 * Permanently deletes a Gmail integration.
 */
export async function deleteGmailIntegration(userId: string): Promise<boolean> {
  const result = await db
    .delete(gmailIntegration)
    .where(eq(gmailIntegration.userId, userId))
    .returning({ id: gmailIntegration.id });

  return result.length > 0;
}

/**
 * Checks if a user has a connected Gmail account.
 */
export async function hasConnectedGmail(userId: string): Promise<boolean> {
  const integration = await getGmailIntegration(userId);
  return integration?.status === "connected";
}

/**
 * Checks if a Gmail integration is actually usable (connected and has valid token data).
 */
export function isGmailIntegrationUsable(
  integration: GmailIntegration | null
): boolean {
  if (!integration) return false;
  if (integration.status !== "connected") return false;
  if (!integration.accessToken) return false;
  if (integration.accessToken === REVOKED_TOKEN_PLACEHOLDER) return false;
  if (!integration.gmailEmail) return false;
  return true;
}

/**
 * Gets all Gmail integrations that need token refresh (expiring within 5 minutes).
 * Uses SQL filtering for better performance.
 */
export async function getGmailIntegrationsNeedingRefresh(): Promise<
  GmailIntegration[]
> {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // Filter in SQL for better performance
  const rows = await db
    .select()
    .from(gmailIntegration)
    .where(
      and(
        eq(gmailIntegration.status, "connected"),
        lt(gmailIntegration.tokenExpiresAt, fiveMinutesFromNow)
      )
    );

  // Only return rows that have a refresh token
  return rows
    .filter((row) => row.refreshToken !== null)
    .map(rowToGmailIntegration);
}

// ============================================================================
// Token Refresh Service
// ============================================================================

/**
 * Refreshes tokens for a Gmail integration.
 * Handles the refresh flow with proper error handling.
 *
 * @param integration - The integration to refresh
 * @returns Updated integration or null if refresh failed
 */
async function refreshIntegrationTokens(
  integration: GmailIntegration
): Promise<GmailIntegration | null> {
  if (!integration.refreshToken) {
    console.error("Cannot refresh tokens: no refresh token available");
    await setGmailIntegrationError(
      integration.id,
      "No refresh token available. Please reconnect Gmail."
    );
    return null;
  }

  try {
    const tokens = await refreshGmailAccessToken(integration.refreshToken);
    const newExpiry = calculateGmailTokenExpiry(tokens.expires_in);

    return await updateGmailTokens(integration.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: newExpiry,
    });
  } catch (error) {
    console.error("Failed to refresh Gmail token:", error);
    await setGmailIntegrationError(
      integration.id,
      "Token refresh failed. Please reconnect Gmail."
    );
    return null;
  }
}

/**
 * Gets a valid access token for a user, refreshing if necessary.
 * This is a convenience function for API routes that need to send emails.
 *
 * Uses a simple lock to prevent concurrent refreshes for the same user.
 * Note: This is suitable for single-instance deployments. For distributed
 * systems, consider using Redis locks or optimistic locking.
 *
 * @param userId - The user's ID
 * @returns Object with accessToken and gmailEmail, or null if not connected
 */
export async function getValidGmailToken(
  userId: string
): Promise<{ accessToken: string; gmailEmail: string } | null> {
  // Check for existing lock
  const existingLock = tokenRefreshLocks.get(userId);
  if (existingLock) {
    // Wait for the existing refresh to complete
    await existingLock;
  }

  const integration = await getGmailIntegration(userId);

  if (!isGmailIntegrationUsable(integration)) {
    return null;
  }

  // TypeScript knows integration is non-null here due to isGmailIntegrationUsable check
  const validIntegration = integration!;

  // Check if token is expiring soon
  if (isTokenExpiringSoon(validIntegration.tokenExpiresAt)) {
    if (!validIntegration.refreshToken) {
      return null;
    }

    // Create a lock promise for this refresh
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    tokenRefreshLocks.set(userId, lockPromise);

    try {
      const refreshedIntegration = await refreshIntegrationTokens(validIntegration);

      if (!refreshedIntegration || !isGmailIntegrationUsable(refreshedIntegration)) {
        return null;
      }

      return {
        accessToken: refreshedIntegration.accessToken!,
        gmailEmail: refreshedIntegration.gmailEmail!,
      };
    } finally {
      // Release the lock
      tokenRefreshLocks.delete(userId);
      resolveLock!();
    }
  }

  return {
    accessToken: validIntegration.accessToken!,
    gmailEmail: validIntegration.gmailEmail!,
  };
}
