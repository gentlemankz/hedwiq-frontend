import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getEmailDraftByIdForUser,
  updateEmailDraft,
  updateEmailDraftStatus,
  deleteEmailDraft,
  rejectEmailDraft,
} from "@/lib/db/email-draft";
import { z } from "zod";
import type { EmailRecipient, DraftStatus } from "@/types/email-draft";

interface RouteParams {
  params: Promise<{ draftId: string }>;
}

/**
 * GET /api/email-drafts/[draftId]
 *
 * Returns a single email draft by ID.
 * Only returns the draft if it belongs to the authenticated user.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { draftId } = await params;
    // SECURITY: Only return draft if it belongs to the authenticated user
    const draft = await getEmailDraftByIdForUser(draftId, session.user.id);

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Failed to get email draft:", error);
    return NextResponse.json(
      { error: "Failed to get email draft" },
      { status: 500 }
    );
  }
}

// Schema for updating a draft
const updateDraftSchema = z.object({
  toAddresses: z
    .array(
      z.object({
        email: z.string().nullable(),
        name: z.string(),
        source: z.enum(["inferred", "explicit", "participant"]),
      })
    )
    .optional(),
  ccAddresses: z
    .array(
      z.object({
        email: z.string().nullable(),
        name: z.string(),
        source: z.enum(["inferred", "explicit", "participant"]),
      })
    )
    .optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(10).max(5000).optional(),
  status: z
    .enum(["generating", "ready", "edited", "sent", "rejected", "failed"])
    .optional(),
});

/**
 * PATCH /api/email-drafts/[draftId]
 *
 * Updates an email draft.
 * Can update content (subject, body, recipients) or status.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { draftId } = await params;
    const body = await request.json();
    const parsed = updateDraftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Special case: if only status is being updated, use the simpler function
    if (
      data.status &&
      !data.toAddresses &&
      !data.ccAddresses &&
      !data.subject &&
      !data.body
    ) {
      const draft = await updateEmailDraftStatus(
        draftId,
        session.user.id,
        data.status
      );

      if (!draft) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }

      return NextResponse.json({ draft });
    }

    // Update draft content
    const draft = await updateEmailDraft(draftId, session.user.id, {
      toAddresses: data.toAddresses as EmailRecipient[] | undefined,
      ccAddresses: data.ccAddresses as EmailRecipient[] | undefined,
      subject: data.subject,
      body: data.body,
      status: data.status as DraftStatus | undefined,
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Failed to update email draft:", error);
    return NextResponse.json(
      { error: "Failed to update email draft" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email-drafts/[draftId]
 *
 * Deletes an email draft.
 * Use ?reject=true to mark as rejected instead of deleting.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { draftId } = await params;
    const { searchParams } = new URL(request.url);
    const reject = searchParams.get("reject") === "true";

    let success: boolean;

    if (reject) {
      // Mark as rejected instead of deleting
      success = await rejectEmailDraft(draftId, session.user.id);
    } else {
      // Permanently delete
      success = await deleteEmailDraft(draftId, session.user.id);
    }

    if (!success) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete email draft:", error);
    return NextResponse.json(
      { error: "Failed to delete email draft" },
      { status: 500 }
    );
  }
}
