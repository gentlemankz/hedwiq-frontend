import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  exchangeCodeForTokens,
  parseOAuthState,
  getGoogleUserInfo,
  calculateTokenExpiry,
} from "@/lib/google-oauth";
import { upsertCalendarIntegration } from "@/lib/db/calendar";

/**
 * GET /api/calendar/callback
 *
 * Handles the OAuth callback from Google.
 * Exchanges the authorization code for tokens and stores them.
 * Redirects to the dashboard with success/error status.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Construct redirect URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  const dashboardUrl = `${appUrl}/dashboard`;

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error from Google:", error);
    const errorDescription = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      `${dashboardUrl}?calendar_error=${encodeURIComponent(errorDescription)}`
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      `${dashboardUrl}?calendar_error=${encodeURIComponent("Missing authorization code or state")}`
    );
  }

  // Parse and validate state
  const parsedState = parseOAuthState(state);
  if (!parsedState) {
    return NextResponse.redirect(
      `${dashboardUrl}?calendar_error=${encodeURIComponent("Invalid or expired state")}`
    );
  }

  // Get current session and verify user matches state
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(
      `${dashboardUrl}?calendar_error=${encodeURIComponent("Session expired. Please sign in and try again.")}`
    );
  }

  if (session.user.id !== parsedState.userId) {
    console.error(
      "User ID mismatch:",
      session.user.id,
      "vs",
      parsedState.userId
    );
    return NextResponse.redirect(
      `${dashboardUrl}?calendar_error=${encodeURIComponent("Session mismatch. Please try again.")}`
    );
  }

  try {
    // Build the callback URL (must match the one used in connect)
    const redirectUri = `${appUrl}/api/calendar/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Get the calendar email from Google
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // Calculate token expiry
    const tokenExpiresAt = calculateTokenExpiry(tokens.expires_in);

    // Store the integration
    await upsertCalendarIntegration({
      userId: session.user.id,
      provider: "google",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt,
      scope: tokens.scope,
      calendarEmail: userInfo.email,
    });

    // Redirect to dashboard with success message
    return NextResponse.redirect(`${dashboardUrl}?calendar_connected=true`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Failed to connect calendar";
    return NextResponse.redirect(
      `${dashboardUrl}?calendar_error=${encodeURIComponent(errorMessage)}`
    );
  }
}
