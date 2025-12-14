import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { buildGoogleAuthUrl, generateOAuthState } from "@/lib/google-oauth";
import { getCalendarIntegration } from "@/lib/db/calendar";

/**
 * GET /api/calendar/connect
 *
 * Initiates the Google Calendar OAuth flow.
 * Returns the authorization URL that the client should redirect to.
 */
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user already has a connected calendar
  const existing = await getCalendarIntegration(session.user.id);
  if (existing?.status === "connected") {
    return NextResponse.json(
      { error: "Calendar already connected" },
      { status: 400 }
    );
  }

  // Build the callback URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (!appUrl) {
    console.error("Missing NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/calendar/callback`;

  // Generate state for CSRF protection
  const state = generateOAuthState(session.user.id);

  // Build the authorization URL
  const authUrl = buildGoogleAuthUrl(state, redirectUri);

  return NextResponse.json({ authUrl });
}
