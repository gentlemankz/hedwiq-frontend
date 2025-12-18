/**
 * Get Pending External Team Invitations API Route
 *
 * GET /api/teams/external-invites/pending - Get pending invitations for current user's email
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPendingInvitationsForEmail } from "@/lib/db/external-team-invitation";

export async function GET() {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userEmail = session.user.email;

    // Get pending invitations for this email
    const invitations = await getPendingInvitationsForEmail(userEmail);

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Failed to get pending external invitations:", error);
    return NextResponse.json(
      { error: "Failed to get pending invitations" },
      { status: 500 }
    );
  }
}
