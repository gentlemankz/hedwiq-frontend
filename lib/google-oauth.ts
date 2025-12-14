/**
 * Google OAuth Utilities
 *
 * Functions for handling Google OAuth flow for Calendar integration.
 * This is separate from Better Auth's Google login - it's specifically
 * for calendar access with different scopes.
 */

import { GOOGLE_CALENDAR_OAUTH } from "@/types/calendar";

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Gets and validates required Google OAuth credentials.
 * Throws an error with clear message if credentials are missing.
 */
function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw new Error(
      "GOOGLE_CLIENT_ID environment variable is not set. " +
        "Please configure Google OAuth credentials."
    );
  }

  if (!clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_SECRET environment variable is not set. " +
        "Please configure Google OAuth credentials."
    );
  }

  return { clientId, clientSecret };
}

// ============================================================================
// Types
// ============================================================================

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleUserInfo {
  email: string;
  verified_email: boolean;
  name?: string;
  picture?: string;
}

// ============================================================================
// OAuth URL Generation
// ============================================================================

/**
 * Generates the Google OAuth authorization URL.
 *
 * @param state - CSRF protection state (should include user ID or session ID)
 * @param redirectUri - The callback URL
 * @returns The full authorization URL
 */
export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = getGoogleCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_OAUTH.SCOPES.join(" "),
    access_type: "offline", // Required to get refresh_token
    prompt: "consent", // Force consent to always get refresh_token
    state,
  });

  return `${GOOGLE_CALENDAR_OAUTH.AUTH_URL}?${params.toString()}`;
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
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch(GOOGLE_CALENDAR_OAUTH.TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    // Avoid logging full response which might contain sensitive data
    console.error(
      "Token exchange failed with status:",
      response.status,
      response.statusText
    );
    throw new Error(`Failed to exchange code for tokens: ${response.status}`);
  }

  return response.json();
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param refreshToken - The refresh token
 * @returns New token response (may not include new refresh_token)
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch(GOOGLE_CALENDAR_OAUTH.TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    // Avoid logging full response which might contain sensitive data
    console.error(
      "Token refresh failed with status:",
      response.status,
      response.statusText
    );
    throw new Error(`Failed to refresh access token: ${response.status}`);
  }

  return response.json();
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
export async function revokeToken(token: string): Promise<boolean> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_OAUTH.REVOKE_URL}?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  // Google returns 200 on success, 400 on invalid token (already revoked)
  return response.ok || response.status === 400;
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
export async function getGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Generates a secure state string for CSRF protection.
 * The state includes the user ID and a random component.
 *
 * @param userId - The user's ID
 * @returns Base64-encoded state string
 */
export function generateOAuthState(userId: string): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const state = JSON.stringify({
    userId,
    random,
    timestamp: Date.now(),
  });

  return Buffer.from(state).toString("base64url");
}

/**
 * Parses and validates an OAuth state string.
 *
 * @param state - The state string from the callback
 * @returns Parsed state object or null if invalid
 */
export function parseOAuthState(
  state: string
): { userId: string; timestamp: number } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);

    if (!parsed.userId || !parsed.timestamp) {
      return null;
    }

    // Check if state is not too old (10 minutes max)
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - parsed.timestamp > maxAge) {
      console.warn("OAuth state expired");
      return null;
    }

    return {
      userId: parsed.userId,
      timestamp: parsed.timestamp,
    };
  } catch (error) {
    console.error("Failed to parse OAuth state:", error);
    return null;
  }
}

// ============================================================================
// Token Expiry Calculation
// ============================================================================

/**
 * Calculates the token expiry date from expires_in.
 *
 * @param expiresIn - Token lifetime in seconds
 * @returns Token expiry date
 */
export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
