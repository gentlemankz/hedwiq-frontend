import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { buildGmailAuthUrl, generateGmailOAuthState } from "@/lib/gmail-oauth";
import { getGmailIntegration } from "@/lib/db/gmail";
import { getAppUrl } from "@/lib/google-oauth-base";

/**
 * GET /api/gmail/connect
 *
 * Initiates the Gmail OAuth flow.
 * Returns the authorization URL that the client should redirect to.
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user already has a connected Gmail account
    const existing = await getGmailIntegration(session.user.id);
    if (existing?.status === "connected") {
      return NextResponse.json(
        { error: "Gmail already connected" },
        { status: 400 }
      );
    }

    // Get app URL with validation
    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch (error) {
      console.error("App URL configuration error:", error);
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const redirectUri = `${appUrl}/api/gmail/callback`;

    // Generate state for CSRF protection
    const state = generateGmailOAuthState(session.user.id);

    // Build the authorization URL
    const authUrl = buildGmailAuthUrl(state, redirectUri);

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("Gmail connect error:", error);
    return NextResponse.json(
      { error: "Failed to initiate Gmail connection" },
      { status: 500 }
    );
  }
}
