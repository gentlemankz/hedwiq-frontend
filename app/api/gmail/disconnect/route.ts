import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revokeGmailToken } from "@/lib/gmail-oauth";
import {
  getGmailIntegration,
  disconnectGmailIntegration,
} from "@/lib/db/gmail";
import { REVOKED_TOKEN_PLACEHOLDER } from "@/lib/google-oauth-base";

/**
 * POST /api/gmail/disconnect
 *
 * Disconnects the user's Gmail integration.
 * Revokes the tokens with Google and marks the integration as disconnected.
 */
export async function POST() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the current integration to revoke the token
    const integration = await getGmailIntegration(session.user.id);

    if (!integration || integration.status === "disconnected") {
      return NextResponse.json(
        { error: "No Gmail connected" },
        { status: 400 }
      );
    }

    // Revoke tokens with Google (best effort - don't fail if revocation fails)
    // Only attempt if we have valid tokens (not already revoked)
    if (
      integration.accessToken &&
      integration.accessToken !== REVOKED_TOKEN_PLACEHOLDER
    ) {
      await revokeGmailToken(integration.accessToken).catch((err) => {
        // Log but don't fail - the token might already be invalid
        console.warn("Failed to revoke Gmail access token:", err);
      });
    }

    if (integration.refreshToken) {
      await revokeGmailToken(integration.refreshToken).catch((err) => {
        console.warn("Failed to revoke Gmail refresh token:", err);
      });
    }

    // Disconnect in our database (clears all token data)
    const success = await disconnectGmailIntegration(session.user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to disconnect Gmail" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gmail disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }
}
