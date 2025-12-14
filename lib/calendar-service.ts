/**
 * Calendar Service
 *
 * High-level service for calendar operations.
 * Handles token refresh and provides a valid access token.
 */

import {
  refreshAccessToken,
  calculateTokenExpiry,
} from "@/lib/google-oauth";
import {
  getCalendarIntegration,
  updateCalendarTokens,
  setCalendarIntegrationError,
} from "@/lib/db/calendar";
import type { CalendarIntegration } from "@/types/calendar";

// ============================================================================
// Token Management
// ============================================================================

/**
 * Gets a valid access token for a user's calendar integration.
 * Automatically refreshes the token if it's expired or about to expire.
 *
 * @param userId - The user's ID
 * @returns Valid access token or null if refresh failed/no integration
 */
export async function getValidAccessToken(
  userId: string
): Promise<string | null> {
  const integration = await getCalendarIntegration(userId);

  if (!integration || integration.status !== "connected") {
    return null;
  }

  // Check if token needs refresh (expires within 5 minutes)
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  const tokenExpiry = integration.tokenExpiresAt
    ? new Date(integration.tokenExpiresAt)
    : null;

  if (tokenExpiry && tokenExpiry > fiveMinutesFromNow) {
    // Token is still valid - accessToken is guaranteed to exist if status is "connected"
    if (!integration.accessToken) {
      console.error("Connected integration missing access token");
      return null;
    }
    return integration.accessToken;
  }

  // Token needs refresh
  if (!integration.refreshToken) {
    // No refresh token - mark as error
    await setCalendarIntegrationError(
      integration.id,
      "No refresh token available. Please reconnect your calendar."
    );
    return null;
  }

  try {
    const newTokens = await refreshAccessToken(integration.refreshToken);
    const newExpiry = calculateTokenExpiry(newTokens.expires_in);

    await updateCalendarTokens(integration.id, {
      accessToken: newTokens.access_token,
      // Google may or may not return a new refresh token
      refreshToken: newTokens.refresh_token || integration.refreshToken,
      tokenExpiresAt: newExpiry,
    });

    return newTokens.access_token;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    await setCalendarIntegrationError(
      integration.id,
      "Failed to refresh token. Please reconnect your calendar."
    );
    return null;
  }
}

/**
 * Ensures the calendar integration has valid tokens.
 * Returns the full integration with refreshed tokens.
 *
 * @param userId - The user's ID
 * @returns Updated integration or null
 */
export async function ensureValidIntegration(
  userId: string
): Promise<CalendarIntegration | null> {
  // First get a valid token (this handles refresh)
  const accessToken = await getValidAccessToken(userId);

  if (!accessToken) {
    return null;
  }

  // Return the updated integration
  return getCalendarIntegration(userId);
}

// ============================================================================
// Calendar API Helpers
// ============================================================================

/**
 * Makes an authenticated request to the Google Calendar API.
 *
 * @param userId - The user's ID
 * @param endpoint - Calendar API endpoint (e.g., '/calendars/primary/events')
 * @param options - Fetch options (method, body, etc.)
 * @returns Response from the Calendar API
 */
export async function calendarApiFetch(
  userId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await getValidAccessToken(userId);

  if (!accessToken) {
    throw new Error("No valid calendar access token");
  }

  const baseUrl = "https://www.googleapis.com/calendar/v3";
  const url = `${baseUrl}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ============================================================================
// Future: Calendar Event Operations (Phase 3)
// ============================================================================

// These will be implemented in Phase 3 when we add event sync:
// - createCalendarEvent()
// - updateCalendarEvent()
// - deleteCalendarEvent()
// - listCalendarEvents()
