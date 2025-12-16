import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getGmailIntegration,
  toPublicGmailIntegration,
  isGmailIntegrationUsable,
} from "@/lib/db/gmail";

/**
 * GET /api/gmail/status
 *
 * Returns the current Gmail connection status for the user.
 * Only returns public-safe information (no tokens).
 *
 * Response states:
 * - connected: true, integration: {...} - Gmail is connected and usable
 * - connected: false, integration: {...} - Gmail exists but has error status
 * - connected: false, integration: null - No Gmail integration exists
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const integration = await getGmailIntegration(session.user.id);

    // No integration exists or it's disconnected
    if (!integration || integration.status === "disconnected") {
      return NextResponse.json({
        connected: false,
        integration: null,
      });
    }

    // Integration exists - check if it's actually usable
    const isUsable = isGmailIntegrationUsable(integration);

    return NextResponse.json({
      // Only report as connected if the integration is actually usable
      connected: isUsable,
      integration: toPublicGmailIntegration(integration),
    });
  } catch (error) {
    console.error("Gmail status error:", error);
    return NextResponse.json(
      { error: "Failed to get Gmail status" },
      { status: 500 }
    );
  }
}
