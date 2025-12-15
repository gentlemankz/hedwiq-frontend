/**
 * RSVP API
 *
 * GET /api/rsvp/[token]
 *
 * Gets invitation details for a given RSVP token.
 *
 * POST /api/rsvp/[token]
 *
 * Updates RSVP status for a given token.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getInviteeByToken,
  updateRsvpByToken,
} from "@/lib/db/invitee";
import {
  validateRsvpStatus,
  isValidRsvpToken,
} from "@/lib/validation/invitee";
import type { RSVPStatus } from "@/types/invitee";

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/rsvp/[token]
 *
 * Returns invitation and meeting details for a given RSVP token.
 * This endpoint is public (no auth required) to allow email link access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validate token format
  if (!isValidRsvpToken(token)) {
    return NextResponse.json(
      { error: "Invalid RSVP token" },
      { status: 400 }
    );
  }

  try {
    const inviteeWithMeeting = await getInviteeByToken(token);

    if (!inviteeWithMeeting) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Don't expose sensitive data
    return NextResponse.json({
      invitee: {
        email: inviteeWithMeeting.email,
        name: inviteeWithMeeting.name,
        status: inviteeWithMeeting.status,
        respondedAt: inviteeWithMeeting.respondedAt,
      },
      meeting: inviteeWithMeeting.meeting,
    });
  } catch (error) {
    console.error("Get RSVP error:", error);
    return NextResponse.json(
      { error: "Failed to get invitation" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rsvp/[token]
 *
 * Updates RSVP status for a given token.
 * This endpoint is public (no auth required) to allow email link access.
 *
 * Request body:
 * {
 *   status: "accepted" | "declined" | "tentative"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validate token format
  if (!isValidRsvpToken(token)) {
    return NextResponse.json(
      { error: "Invalid RSVP token" },
      { status: 400 }
    );
  }

  // Parse request body
  let body: { status?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate status
  const validation = validateRsvpStatus(body.status);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Don't allow setting status back to pending
  if (body.status === "pending") {
    return NextResponse.json(
      { error: "Cannot set status to pending" },
      { status: 400 }
    );
  }

  try {
    const updatedInvitee = await updateRsvpByToken(
      token,
      body.status as RSVPStatus
    );

    if (!updatedInvitee) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      invitee: {
        email: updatedInvitee.email,
        name: updatedInvitee.name,
        status: updatedInvitee.status,
        respondedAt: updatedInvitee.respondedAt,
      },
    });
  } catch (error) {
    console.error("Update RSVP error:", error);
    return NextResponse.json(
      { error: "Failed to update RSVP" },
      { status: 500 }
    );
  }
}
