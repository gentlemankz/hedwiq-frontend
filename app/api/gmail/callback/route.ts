import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  exchangeGmailCodeForTokens,
  parseGmailOAuthState,
  getGmailUserInfo,
  calculateGmailTokenExpiry,
} from "@/lib/gmail-oauth";
import { getAppUrl } from "@/lib/google-oauth-base";
import { upsertGmailIntegration } from "@/lib/db/gmail";

/**
 * GET /api/gmail/callback
 *
 * Handles the OAuth callback from Google.
 * Exchanges the authorization code for tokens and stores them.
 * Redirects to the dashboard with success/error status.
 */
export async function GET(request: NextRequest) {
  // Get app URL first - if this fails, we can't redirect anywhere
  let appUrl: string;
  try {
    appUrl = getAppUrl();
  } catch (error) {
    console.error("App URL configuration error:", error);
    // Return JSON error since we can't redirect
    return NextResponse.json(
      { error: "Server configuration error - cannot determine redirect URL" },
      { status: 500 }
    );
  }

  const dashboardUrl = `${appUrl}/dashboard`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors from Google
  if (error) {
    console.error("Gmail OAuth error from Google:", error);
    const errorDescription = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      `${dashboardUrl}?gmail_error=${encodeURIComponent(errorDescription)}`
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      `${dashboardUrl}?gmail_error=${encodeURIComponent("Missing authorization code or state")}`
    );
  }

  // Parse and validate state (includes CSRF and expiration check)
  const parsedState = parseGmailOAuthState(state);
  if (!parsedState) {
    return NextResponse.redirect(
      `${dashboardUrl}?gmail_error=${encodeURIComponent("Invalid or expired state. Please try again.")}`
    );
  }

  // Get current session and verify user matches state
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(
      `${dashboardUrl}?gmail_error=${encodeURIComponent("Session expired. Please sign in and try again.")}`
    );
  }

  // Verify user ID matches to prevent CSRF attacks
  if (session.user.id !== parsedState.userId) {
    console.error(
      "Gmail OAuth user ID mismatch:",
      session.user.id,
      "vs",
      parsedState.userId
    );
    return NextResponse.redirect(
      `${dashboardUrl}?gmail_error=${encodeURIComponent("Session mismatch. Please try again.")}`
    );
  }

  try {
    // Build the callback URL (must match the one used in connect)
    const redirectUri = `${appUrl}/api/gmail/callback`;

    // Exchange code for tokens
    const tokens = await exchangeGmailCodeForTokens(code, redirectUri);

    // Validate we got an access token
    if (!tokens.access_token) {
      throw new Error("No access token received from Google");
    }

    // Get the Gmail email from Google
    const userInfo = await getGmailUserInfo(tokens.access_token);

    if (!userInfo.email) {
      throw new Error("Could not retrieve email from Google");
    }

    // Calculate token expiry
    const tokenExpiresAt = calculateGmailTokenExpiry(tokens.expires_in);

    // Store the integration
    await upsertGmailIntegration({
      userId: session.user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt,
      scope: tokens.scope,
      gmailEmail: userInfo.email,
    });

    // Redirect to dashboard with success message
    return NextResponse.redirect(`${dashboardUrl}?gmail_connected=true`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Failed to connect Gmail";
    return NextResponse.redirect(
      `${dashboardUrl}?gmail_error=${encodeURIComponent(errorMessage)}`
    );
  }
}
