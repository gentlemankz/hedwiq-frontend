import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revokeToken } from "@/lib/google-oauth";
import {
  getCalendarIntegration,
  disconnectCalendarIntegration,
} from "@/lib/db/calendar";

/**
 * POST /api/calendar/disconnect
 *
 * Disconnects the user's Google Calendar integration.
 * Revokes the tokens with Google and marks the integration as disconnected.
 */
export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the current integration to revoke the token
  const integration = await getCalendarIntegration(session.user.id);

  if (!integration || integration.status === "disconnected") {
    return NextResponse.json(
      { error: "No calendar connected" },
      { status: 400 }
    );
  }

  try {
    // Revoke the token with Google (best effort)
    if (integration.accessToken) {
      await revokeToken(integration.accessToken).catch((err) => {
        // Log but don't fail - the token might already be invalid
        console.warn("Failed to revoke access token:", err);
      });
    }

    if (integration.refreshToken) {
      await revokeToken(integration.refreshToken).catch((err) => {
        console.warn("Failed to revoke refresh token:", err);
      });
    }

    // Disconnect in our database
    const success = await disconnectCalendarIntegration(session.user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to disconnect calendar" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect calendar" },
      { status: 500 }
    );
  }
}
