import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getCalendarIntegration,
  toPublicCalendarIntegration,
} from "@/lib/db/calendar";

/**
 * GET /api/calendar/status
 *
 * Returns the current calendar connection status for the user.
 * Only returns public-safe information (no tokens).
 */
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await getCalendarIntegration(session.user.id);

  if (!integration || integration.status === "disconnected") {
    return NextResponse.json({
      connected: false,
      integration: null,
    });
  }

  return NextResponse.json({
    connected: integration.status === "connected",
    integration: toPublicCalendarIntegration(integration),
  });
}
