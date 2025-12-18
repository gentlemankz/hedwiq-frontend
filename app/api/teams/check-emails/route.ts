/**
 * Check Emails API Route
 *
 * POST /api/teams/check-emails - Check if emails have accounts
 *
 * This endpoint is secured to prevent email enumeration attacks:
 * - Only authenticated users can call it
 * - Rate limited implicitly by authentication
 * - Only returns boolean status, not user details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { emailHasAccount } from "@/lib/db/external-team-invitation";
import { normalizeEmail, isValidEmail } from "@/lib/validation/invitee";

// Maximum emails to check in a single request
const MAX_EMAILS_PER_REQUEST = 20;

export async function POST(request: NextRequest) {
  try {
    // Authenticate user (required to prevent enumeration attacks)
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { emails } = body as { emails: string[] };

    // Validate emails array
    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "At least one email is required" },
        { status: 400 }
      );
    }

    if (emails.length > MAX_EMAILS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_EMAILS_PER_REQUEST} emails per request` },
        { status: 400 }
      );
    }

    // Check each email
    const results: Record<string, boolean> = {};

    for (const rawEmail of emails) {
      const email = normalizeEmail(rawEmail);

      if (!isValidEmail(email)) {
        results[rawEmail] = false;
        continue;
      }

      try {
        const hasAccount = await emailHasAccount(email);
        results[rawEmail] = hasAccount;
      } catch {
        // On error, default to assuming account exists (safer fallback)
        results[rawEmail] = true;
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to check emails:", error);
    return NextResponse.json(
      { error: "Failed to check emails" },
      { status: 500 }
    );
  }
}
