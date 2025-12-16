/**
 * Gmail Integration Types for Hedwiq Frontend
 *
 * These types support the Gmail OAuth integration feature for Real-Time Actions.
 * Used for connecting, managing, and sending emails via Gmail API.
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * Gmail integration status.
 * - connected: Integration active and working
 * - disconnected: User disconnected the integration
 * - error: Token refresh failed or other error
 */
export type GmailIntegrationStatus = "connected" | "disconnected" | "error";

// ============================================================================
// Core Types
// ============================================================================

/**
 * A Gmail integration record from the database.
 */
export interface GmailIntegration {
  /** Unique identifier */
  id: string;
  /** User ID who owns this integration */
  userId: string;
  /** OAuth access token (sensitive - not returned to client) */
  accessToken?: string;
  /** OAuth refresh token (sensitive - not returned to client) */
  refreshToken?: string;
  /** Token expiry timestamp (ISO string) */
  tokenExpiresAt?: string | null;
  /** OAuth scopes granted */
  scope?: string | null;
  /** Email associated with the Gmail account */
  gmailEmail?: string | null;
  /** Connection status */
  status: GmailIntegrationStatus;
  /** Error message if status is 'error' */
  errorMessage?: string | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Public Gmail integration info (safe to expose to client).
 * Excludes sensitive token information.
 */
export interface GmailIntegrationPublic {
  /** Unique identifier */
  id: string;
  /** Email associated with the Gmail account */
  gmailEmail: string | null;
  /** Connection status */
  status: GmailIntegrationStatus;
  /** Error message if status is 'error' */
  errorMessage: string | null;
  /** Creation timestamp */
  createdAt: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from getting Gmail status.
 */
export interface GmailStatusResponse {
  connected: boolean;
  integration: GmailIntegrationPublic | null;
}

/**
 * Response from Gmail connect initiation.
 */
export interface GmailConnectResponse {
  authUrl: string;
}

/**
 * Response from Gmail disconnect.
 */
export interface GmailDisconnectResponse {
  success: boolean;
}

// ============================================================================
// OAuth Constants
// ============================================================================

/**
 * Google OAuth configuration constants for Gmail access.
 * Uses minimal scopes required for sending emails.
 */
export const GOOGLE_GMAIL_OAUTH = {
  /** OAuth scopes required for Gmail send access */
  SCOPES: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
  /** OAuth authorization endpoint */
  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  /** OAuth token endpoint */
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  /** OAuth revoke endpoint */
  REVOKE_URL: "https://oauth2.googleapis.com/revoke",
} as const;
