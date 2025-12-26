import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getEmailDraftsByUser,
  getPendingEmailDrafts,
  upsertEmailDraft,
} from "@/lib/db/email-draft";
import { z } from "zod";
import type { EmailRecipient, MeetingContext } from "@/types/email-draft";
import {
  checkFeatureAccess,
  checkEmailDraftLimit,
  featureAccessDeniedResponse,
  usageLimitExceededResponse,
} from "@/lib/polar/server-feature-gates";

/**
 * GET /api/email-drafts
 *
 * Returns email drafts for the authenticated user.
 *
 * Query params:
 * - status: Filter by status (e.g., "ready", "edited", "pending" for ready+edited)
 * - meetingId: Filter by meeting ID
 * - limit: Maximum number of drafts to return
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Server-side feature gate
    const featureCheck = await checkFeatureAccess(session.user.id, "email_drafts");
    if (!featureCheck.allowed) {
      return featureAccessDeniedResponse("email_drafts", featureCheck);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = searchParams.get("limit");

    let drafts;

    if (status === "pending") {
      // Special case: get ready + edited drafts
      drafts = await getPendingEmailDrafts(session.user.id);
    } else if (status) {
      // Filter by specific status(es)
      const statuses = status.split(",") as (
        | "generating"
        | "ready"
        | "edited"
        | "sent"
        | "rejected"
        | "failed"
      )[];
      drafts = await getEmailDraftsByUser(session.user.id, {
        status: statuses,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
    } else {
      // Get all drafts
      drafts = await getEmailDraftsByUser(session.user.id, {
        limit: limit ? parseInt(limit, 10) : undefined,
      });
    }

    return NextResponse.json({
      drafts,
      count: drafts.length,
    });
  } catch (error) {
    console.error("Failed to get email drafts:", error);
    return NextResponse.json(
      { error: "Failed to get email drafts" },
      { status: 500 }
    );
  }
}

// Schema for creating a draft
// Note: meetingId and originalInsightId can be optional since agent may not have them
const createDraftSchema = z.object({
  actionId: z.string().min(1),
  meetingId: z.string().optional(), // Can be derived from roomId
  roomId: z.string().min(1),
  originalInsightId: z.string().optional(), // Can be derived from actionId
  suggestedTo: z.array(
    z.object({
      email: z.string().nullable(),
      name: z.string(),
      source: z.enum(["inferred", "explicit", "participant"]),
    })
  ),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000), // Reduced min to 1, increased max
  meetingContext: z.object({
    meetingTitle: z.string().nullable(),
    meetingDate: z.string().nullable(),
    participants: z.array(z.string()),
    agendaTopics: z.array(z.string()),
    roomId: z.string().nullable(),
  }),
  transcriptContext: z.string().nullable().optional(),
  actionContent: z.string().min(1),
  actionType: z.string().min(1),
  speakerName: z.string().nullable().optional(),
  generationConfidence: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/email-drafts
 *
 * Creates or updates an email draft.
 * Uses upsert on action_id + user_id.
 *
 * Server-side feature gating:
 * - Checks user has email_drafts feature (Pro+ tier)
 * - Checks user hasn't exceeded monthly email draft limit
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Server-side feature gate: Check if user has access to email drafts
    const featureCheck = await checkFeatureAccess(session.user.id, "email_drafts");
    if (!featureCheck.allowed) {
      return featureAccessDeniedResponse("email_drafts", featureCheck);
    }

    // Server-side usage limit: Check if user has remaining email drafts
    const usageCheck = await checkEmailDraftLimit(session.user.id);
    if (!usageCheck.allowed) {
      return usageLimitExceededResponse("email_drafts", usageCheck);
    }

    const body = await request.json();
    const parsed = createDraftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const draft = await upsertEmailDraft({
      actionId: data.actionId,
      // Use roomId as fallback for meetingId (agent may not have meetingId)
      meetingId: data.meetingId || data.roomId,
      userId: session.user.id,
      roomId: data.roomId,
      // Use actionId as fallback for originalInsightId
      originalInsightId: data.originalInsightId || data.actionId,
      suggestedTo: data.suggestedTo as EmailRecipient[],
      subject: data.subject,
      body: data.body,
      meetingContext: data.meetingContext as MeetingContext,
      transcriptContext: data.transcriptContext ?? undefined,
      actionContent: data.actionContent,
      actionType: data.actionType,
      speakerName: data.speakerName ?? undefined,
      generationConfidence: data.generationConfidence,
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    console.error("Failed to create email draft:", error);
    return NextResponse.json(
      { error: "Failed to create email draft" },
      { status: 500 }
    );
  }
}
