/**
 * Accept External Team Invitation API Route
 *
 * POST /api/teams/external-invites/accept - Accept invitation via token
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getExternalInvitationByTokenWithDetails,
  acceptExternalInvitation,
} from "@/lib/db/external-team-invitation";
import { normalizeEmail } from "@/lib/validation/invitee";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const userEmail = normalizeEmail(session.user.email);

    // Parse request body
    const body = await request.json();
    const { token } = body as { token: string };

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Get invitation with details
    const invitation = await getExternalInvitationByTokenWithDetails(token);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Verify the invitation is for this user's email
    if (invitation.email !== userEmail) {
      return NextResponse.json(
        {
          error: "This invitation was sent to a different email address",
        },
        { status: 403 }
      );
    }

    // Check invitation status
    if (invitation.status !== "pending") {
      return NextResponse.json(
        {
          error: `This invitation has already been ${invitation.status}`,
        },
        { status: 400 }
      );
    }

    // Check expiration
    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 }
      );
    }

    // Accept the invitation
    const result = await acceptExternalInvitation(token, userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to accept invitation" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      team: {
        id: invitation.team.id,
        name: invitation.team.name,
      },
    });
  } catch (error) {
    console.error("Failed to accept external invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
