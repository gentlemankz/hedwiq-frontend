/**
 * Gmail OAuth Utilities
 *
 * Functions for handling Google OAuth flow for Gmail integration.
 * This is separate from Better Auth's Google login and Calendar OAuth -
 * it's specifically for Gmail send access with different scopes.
 *
 * Uses shared utilities from google-oauth-base.ts to avoid code duplication.
 */

import { GOOGLE_GMAIL_OAUTH } from "@/types/gmail";
import {
  buildGoogleAuthUrl as buildAuthUrlBase,
  exchangeCodeForTokens as exchangeCodeBase,
  refreshAccessToken as refreshTokenBase,
  revokeToken as revokeTokenBase,
  getGoogleUserInfo,
  generateOAuthState,
  parseOAuthState,
  calculateTokenExpiry,
  isTokenExpiringSoon,
  type GoogleTokenResponse,
  type GoogleUserInfo,
  type OAuthConfig,
} from "@/lib/google-oauth-base";

// Re-export types for convenience
export type { GoogleTokenResponse, GoogleUserInfo };
export type GmailTokenResponse = GoogleTokenResponse;

// OAuth type identifier for Gmail
const GMAIL_OAUTH_TYPE = "gmail";

// Create config object from constants
const gmailOAuthConfig: OAuthConfig = {
  scopes: GOOGLE_GMAIL_OAUTH.SCOPES,
  authUrl: GOOGLE_GMAIL_OAUTH.AUTH_URL,
  tokenUrl: GOOGLE_GMAIL_OAUTH.TOKEN_URL,
  revokeUrl: GOOGLE_GMAIL_OAUTH.REVOKE_URL,
};

// ============================================================================
// OAuth URL Generation
// ============================================================================

/**
 * Generates the Google OAuth authorization URL for Gmail access.
 *
 * @param state - CSRF protection state (should include user ID or session ID)
 * @param redirectUri - The callback URL
 * @returns The full authorization URL
 */
export function buildGmailAuthUrl(state: string, redirectUri: string): string {
  return buildAuthUrlBase(gmailOAuthConfig, state, redirectUri);
}

// ============================================================================
// Token Exchange
// ============================================================================

/**
 * Exchanges an authorization code for access and refresh tokens.
 *
 * @param code - The authorization code from Google
 * @param redirectUri - The callback URL (must match the one used in auth URL)
 * @returns Token response from Google
 */
export async function exchangeGmailCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GmailTokenResponse> {
  return exchangeCodeBase(GOOGLE_GMAIL_OAUTH.TOKEN_URL, code, redirectUri);
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param refreshToken - The refresh token
 * @returns New token response (may not include new refresh_token)
 */
export async function refreshGmailAccessToken(
  refreshToken: string
): Promise<GmailTokenResponse> {
  return refreshTokenBase(GOOGLE_GMAIL_OAUTH.TOKEN_URL, refreshToken);
}

// ============================================================================
// Token Revocation
// ============================================================================

/**
 * Revokes a Google OAuth token (access or refresh token).
 *
 * @param token - The token to revoke
 * @returns true if revocation succeeded
 */
export async function revokeGmailToken(token: string): Promise<boolean> {
  return revokeTokenBase(GOOGLE_GMAIL_OAUTH.REVOKE_URL, token);
}

// ============================================================================
// User Info
// ============================================================================

/**
 * Gets the user's email from Google using an access token.
 *
 * @param accessToken - Valid Google access token
 * @returns User info including email
 */
export async function getGmailUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  return getGoogleUserInfo(accessToken);
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Generates a secure state string for CSRF protection.
 * The state includes the user ID, integration type, and a random component.
 *
 * @param userId - The user's ID
 * @returns Base64-encoded state string
 */
export function generateGmailOAuthState(userId: string): string {
  return generateOAuthState(userId, GMAIL_OAUTH_TYPE);
}

/**
 * Parses and validates a Gmail OAuth state string.
 *
 * @param state - The state string from the callback
 * @returns Parsed state object or null if invalid
 */
export function parseGmailOAuthState(
  state: string
): { userId: string; timestamp: number } | null {
  return parseOAuthState(state, GMAIL_OAUTH_TYPE);
}

// ============================================================================
// Token Expiry Utilities
// ============================================================================

/**
 * Calculates the token expiry date from expires_in.
 *
 * @param expiresIn - Token lifetime in seconds
 * @returns Token expiry date
 */
export function calculateGmailTokenExpiry(expiresIn: number): Date {
  return calculateTokenExpiry(expiresIn);
}

/**
 * Checks if a token is about to expire (within 5 minutes).
 *
 * @param tokenExpiresAt - Token expiry date
 * @returns true if token is expiring soon or already expired
 */
export { isTokenExpiringSoon };
