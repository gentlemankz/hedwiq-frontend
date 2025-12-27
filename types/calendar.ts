/**
 * Calendar Integration Types for Luframe Frontend
 *
 * These types support the Google Calendar OAuth integration feature.
 * Used for connecting, syncing, and managing calendar integrations.
 */

// ============================================================================
// Provider and Status Types
// ============================================================================

/**
 * Supported calendar providers.
 */
export type CalendarProvider = "google";

/**
 * Calendar integration status.
 * - connected: Integration active and working
 * - disconnected: User disconnected the integration
 * - error: Token refresh failed or other error
 */
export type CalendarIntegrationStatus = "connected" | "disconnected" | "error";

/**
 * Calendar event sync status.
 * - synced: Event is in sync with external calendar
 * - pending: Event creation/update pending
 * - failed: Sync failed (check syncError for details)
 * - deleted: Event was deleted from external calendar
 */
export type CalendarEventSyncStatus = "synced" | "pending" | "failed" | "deleted";

// ============================================================================
// Core Types
// ============================================================================

/**
 * A calendar integration record from the database.
 */
export interface CalendarIntegration {
  /** Unique identifier */
  id: string;
  /** User ID who owns this integration */
  userId: string;
  /** Calendar provider */
  provider: CalendarProvider;
  /** OAuth access token (sensitive - not returned to client) */
  accessToken?: string;
  /** OAuth refresh token (sensitive - not returned to client) */
  refreshToken?: string;
  /** Token expiry timestamp (ISO string) */
  tokenExpiresAt?: string | null;
  /** OAuth scopes granted */
  scope?: string | null;
  /** Email associated with the calendar account */
  calendarEmail?: string | null;
  /** Connection status */
  status: CalendarIntegrationStatus;
  /** Last sync timestamp (ISO string) */
  lastSyncedAt?: string | null;
  /** Error message if status is 'error' */
  errorMessage?: string | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Public calendar integration info (safe to expose to client).
 * Excludes sensitive token information.
 */
export interface CalendarIntegrationPublic {
  /** Unique identifier */
  id: string;
  /** Calendar provider */
  provider: CalendarProvider;
  /** Email associated with the calendar account */
  calendarEmail: string | null;
  /** Connection status */
  status: CalendarIntegrationStatus;
  /** Last sync timestamp (ISO string) */
  lastSyncedAt: string | null;
  /** Error message if status is 'error' */
  errorMessage: string | null;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * A calendar event record that maps a meeting to an external calendar event.
 */
export interface CalendarEvent {
  /** Unique identifier */
  id: string;
  /** Meeting ID this event is linked to */
  meetingId: string;
  /** Calendar integration ID */
  integrationId: string;
  /** External calendar event ID */
  providerEventId: string;
  /** Link to the event in the external calendar */
  providerEventLink: string | null;
  /** Sync status */
  syncStatus: CalendarEventSyncStatus;
  /** Last sync timestamp (ISO string) */
  lastSyncedAt: string | null;
  /** Error message if sync failed */
  syncError: string | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Public calendar event info (for client display).
 */
export interface CalendarEventPublic {
  /** External calendar event link */
  providerEventLink: string | null;
  /** Sync status */
  syncStatus: CalendarEventSyncStatus;
  /** Sync error message if any */
  syncError: string | null;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from getting calendar status.
 */
export interface CalendarStatusResponse {
  connected: boolean;
  integration: CalendarIntegrationPublic | null;
}

/**
 * Response from calendar connect initiation.
 */
export interface CalendarConnectResponse {
  authUrl: string;
}

/**
 * Response from calendar disconnect.
 */
export interface CalendarDisconnectResponse {
  success: boolean;
}

// ============================================================================
// OAuth Constants
// ============================================================================

/**
 * Google OAuth configuration constants.
 */
export const GOOGLE_CALENDAR_OAUTH = {
  /** OAuth scopes required for calendar access */
  SCOPES: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
  /** OAuth authorization endpoint */
  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  /** OAuth token endpoint */
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  /** OAuth revoke endpoint */
  REVOKE_URL: "https://oauth2.googleapis.com/revoke",
} as const;
