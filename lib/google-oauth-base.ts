/**
 * Google OAuth Base Utilities
 *
 * Shared functions for handling Google OAuth flows.
 * Used by both Calendar and Gmail OAuth integrations.
 * This eliminates code duplication between google-oauth.ts and gmail-oauth.ts.
 */

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Gets and validates required Google OAuth credentials.
 * Throws an error with clear message if credentials are missing.
 */
export function getGoogleCredentials(): {
  clientId: string;
  clientSecret: string;
} {
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

export interface OAuthConfig {
  scopes: readonly string[];
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
}

export interface OAuthStatePayload {
  userId: string;
  type?: string;
  random: string;
  timestamp: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Magic string used as placeholder when token is revoked */
export const REVOKED_TOKEN_PLACEHOLDER = "REVOKED";

/** Maximum age for OAuth state (10 minutes) */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Token refresh buffer (5 minutes before expiry) */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ============================================================================
// OAuth URL Generation
// ============================================================================

/**
 * Generates a Google OAuth authorization URL.
 *
 * @param config - OAuth configuration (scopes, authUrl)
 * @param state - CSRF protection state
 * @param redirectUri - The callback URL
 * @returns The full authorization URL
 */
export function buildGoogleAuthUrl(
  config: OAuthConfig,
  state: string,
  redirectUri: string
): string {
  const { clientId } = getGoogleCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    access_type: "offline", // Required to get refresh_token
    prompt: "consent", // Force consent to always get refresh_token
    state,
  });

  return `${config.authUrl}?${params.toString()}`;
}

// ============================================================================
// Token Exchange
// ============================================================================

/**
 * Exchanges an authorization code for access and refresh tokens.
 *
 * @param tokenUrl - Google token endpoint URL
 * @param code - The authorization code from Google
 * @param redirectUri - The callback URL (must match the one used in auth URL)
 * @returns Token response from Google
 */
export async function exchangeCodeForTokens(
  tokenUrl: string,
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch(tokenUrl, {
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
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(
      "Token exchange failed:",
      response.status,
      response.statusText,
      errorText
    );
    throw new Error(`Failed to exchange code for tokens: ${response.status}`);
  }

  return response.json();
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param tokenUrl - Google token endpoint URL
 * @param refreshToken - The refresh token
 * @returns New token response (may not include new refresh_token)
 */
export async function refreshAccessToken(
  tokenUrl: string,
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch(tokenUrl, {
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
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(
      "Token refresh failed:",
      response.status,
      response.statusText,
      errorText
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
 * @param revokeUrl - Google revoke endpoint URL
 * @param token - The token to revoke
 * @returns true if revocation succeeded
 */
export async function revokeToken(
  revokeUrl: string,
  token: string
): Promise<boolean> {
  const response = await fetch(
    `${revokeUrl}?token=${encodeURIComponent(token)}`,
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
 * The state includes the user ID, type, and a random component.
 *
 * @param userId - The user's ID
 * @param type - Optional type to differentiate OAuth flows (e.g., "gmail", "calendar")
 * @returns Base64-encoded state string
 */
export function generateOAuthState(userId: string, type?: string): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const state: OAuthStatePayload = {
    userId,
    type,
    random,
    timestamp: Date.now(),
  };

  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/**
 * Parses and validates an OAuth state string.
 *
 * @param state - The state string from the callback
 * @param expectedType - Optional type to validate against
 * @returns Parsed state object or null if invalid
 */
export function parseOAuthState(
  state: string,
  expectedType?: string
): { userId: string; timestamp: number } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as OAuthStatePayload;

    // Verify type if expected
    if (expectedType && parsed.type !== expectedType) {
      console.warn(`OAuth state type mismatch: expected ${expectedType}, got ${parsed.type}`);
      return null;
    }

    if (!parsed.userId || !parsed.timestamp) {
      return null;
    }

    // Check if state is not too old
    if (Date.now() - parsed.timestamp > OAUTH_STATE_MAX_AGE_MS) {
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
// Token Expiry Utilities
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

/**
 * Checks if a token is about to expire (within buffer time).
 *
 * @param tokenExpiresAt - Token expiry date
 * @param bufferMs - Buffer time in milliseconds (default: 5 minutes)
 * @returns true if token is expiring soon or already expired
 */
export function isTokenExpiringSoon(
  tokenExpiresAt: Date | string | null | undefined,
  bufferMs: number = TOKEN_REFRESH_BUFFER_MS
): boolean {
  if (!tokenExpiresAt) return true;

  const expiryDate =
    typeof tokenExpiresAt === "string"
      ? new Date(tokenExpiresAt)
      : tokenExpiresAt;

  const bufferTime = new Date(Date.now() + bufferMs);
  return expiryDate <= bufferTime;
}

// ============================================================================
// App URL Utilities
// ============================================================================

/**
 * Gets the application URL from environment variables.
 * Throws if not configured.
 */
export function getAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;

  if (!appUrl) {
    throw new Error(
      "Neither NEXT_PUBLIC_APP_URL nor BETTER_AUTH_URL is configured. " +
        "Please set one of these environment variables."
    );
  }

  return appUrl;
}
