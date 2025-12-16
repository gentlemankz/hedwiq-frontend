import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { z } from "zod";
import { getValidGmailToken } from "@/lib/db/gmail";
import {
  getEmailDraftByIdForUser,
  markDraftAsSent,
  recordEmailSent,
} from "@/lib/db/email-draft";

// ============================================================================
// Types
// ============================================================================

interface GmailSendResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

interface GmailErrorResponse {
  error: {
    code: number;
    message: string;
    errors: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitizes email address to prevent header injection.
 * Removes any newlines or carriage returns that could inject headers.
 */
function sanitizeEmail(email: string): string {
  return email.replace(/[\r\n]/g, "").trim();
}

/**
 * Validates email format strictly.
 */
function isValidEmail(email: string): boolean {
  // Basic email validation - no newlines, has @ symbol, proper structure
  const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
  return emailRegex.test(email) && !email.includes("\r") && !email.includes("\n");
}

/**
 * Sanitizes text to prevent header injection in non-encoded fields.
 */
function sanitizeHeaderText(text: string): string {
  return text.replace(/[\r\n]/g, " ").trim();
}

/**
 * Creates a MIME message for sending via Gmail API.
 * SECURITY: All inputs are sanitized to prevent header injection.
 */
function createMimeMessage(params: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // SECURITY: Sanitize all email addresses
  const sanitizedFrom = sanitizeEmail(params.from);
  const sanitizedTo = params.to.map(sanitizeEmail);
  const sanitizedCc = params.cc?.map(sanitizeEmail);
  // Subject is base64 encoded, but still sanitize for safety
  const sanitizedSubject = sanitizeHeaderText(params.subject);

  const headers = [
    `From: ${sanitizedFrom}`,
    `To: ${sanitizedTo.join(", ")}`,
    sanitizedCc && sanitizedCc.length > 0 ? `Cc: ${sanitizedCc.join(", ")}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(sanitizedSubject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
  ]
    .filter(Boolean)
    .join("\r\n");

  // Plain text version
  const plainText = params.body
    .replace(/<[^>]*>/g, "") // Strip HTML tags if any
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // HTML version (basic formatting)
  const htmlBody = params.body
    .replace(/\n/g, "<br>")
    .replace(/  /g, "&nbsp;&nbsp;");

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    plainText,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</body></html>`,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return headers + "\r\n" + body;
}

/**
 * Encodes the message for Gmail API (URL-safe base64).
 */
function encodeMessage(message: string): string {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sends an email via Gmail API.
 */
async function sendGmailMessage(
  accessToken: string,
  message: string
): Promise<GmailSendResponse> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodeMessage(message),
      }),
    }
  );

  if (!response.ok) {
    const errorData = (await response.json()) as GmailErrorResponse;
    throw new Error(
      errorData.error?.message || `Gmail API error: ${response.status}`
    );
  }

  return response.json() as Promise<GmailSendResponse>;
}

// ============================================================================
// Request Schema
// ============================================================================

const sendEmailSchema = z.object({
  // Option 1: Send from a draft
  draftId: z.string().optional(),

  // Option 2: Send directly with all fields
  meetingId: z.string().optional(),
  roomId: z.string().optional(),
  to: z.array(z.string().email()).optional(),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(10).max(10000).optional(),

  // Override fields (used with draftId)
  override: z
    .object({
      to: z.array(z.string().email()).optional(),
      cc: z.array(z.string().email()).optional(),
      subject: z.string().min(1).max(200).optional(),
      body: z.string().min(10).max(10000).optional(),
    })
    .optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

/**
 * POST /api/gmail/send
 *
 * Sends an email via Gmail API.
 *
 * Two modes:
 * 1. Send from draft: { draftId: string, override?: {...} }
 * 2. Send directly: { meetingId, roomId, to, subject, body }
 *
 * Response:
 * - success: true, messageId: string (Gmail message ID)
 * - error: string (on failure)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const parsed = sendEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // 3. Get valid Gmail token (refreshes if needed)
    const tokenResult = await getValidGmailToken(session.user.id);

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Gmail not connected. Please connect your Gmail account." },
        { status: 403 }
      );
    }

    const { accessToken, gmailEmail } = tokenResult;

    // 4. Determine email content
    let finalTo: string[];
    let finalCc: string[] | undefined;
    let finalSubject: string;
    let finalBody: string;
    let meetingId: string | undefined;
    let roomId: string | undefined;
    let draftId: string | undefined;

    if (data.draftId) {
      // Mode 1: Send from draft
      // SECURITY: Use user-scoped query to ensure ownership
      const draft = await getEmailDraftByIdForUser(data.draftId, session.user.id);

      if (!draft) {
        return NextResponse.json(
          { error: "Draft not found" },
          { status: 404 }
        );
      }

      // Check if draft is sendable
      if (draft.status !== "ready" && draft.status !== "edited") {
        return NextResponse.json(
          { error: `Cannot send draft with status: ${draft.status}` },
          { status: 400 }
        );
      }

      draftId = draft.id;
      // Extract meetingId and roomId from draft for audit logging
      meetingId = draft.meetingId;
      roomId = draft.roomId;

      // Get recipients from draft, allowing overrides
      finalTo =
        data.override?.to ??
        draft.suggestedTo
          .filter((r) => r.email)
          .map((r) => r.email as string);

      finalCc = data.override?.cc;
      finalSubject = data.override?.subject ?? draft.subject;
      finalBody = data.override?.body ?? draft.body;

      // Validate we have at least one recipient
      if (finalTo.length === 0) {
        return NextResponse.json(
          { error: "No valid email recipients found" },
          { status: 400 }
        );
      }
    } else {
      // Mode 2: Send directly
      if (!data.to || !data.subject || !data.body) {
        return NextResponse.json(
          { error: "Missing required fields: to, subject, body" },
          { status: 400 }
        );
      }

      finalTo = data.to;
      finalCc = data.cc;
      finalSubject = data.subject;
      finalBody = data.body;
      meetingId = data.meetingId;
      roomId = data.roomId;
    }

    // 4.5. Validate all email addresses for security
    const invalidToEmails = finalTo.filter((email) => !isValidEmail(email));
    if (invalidToEmails.length > 0) {
      return NextResponse.json(
        { error: `Invalid email addresses: ${invalidToEmails.join(", ")}` },
        { status: 400 }
      );
    }

    if (finalCc && finalCc.length > 0) {
      const invalidCcEmails = finalCc.filter((email) => !isValidEmail(email));
      if (invalidCcEmails.length > 0) {
        return NextResponse.json(
          { error: `Invalid CC email addresses: ${invalidCcEmails.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // 5. Create MIME message
    const mimeMessage = createMimeMessage({
      from: gmailEmail,
      to: finalTo,
      cc: finalCc,
      subject: finalSubject,
      body: finalBody,
    });

    // 6. Send via Gmail API
    let sendResult: GmailSendResponse;
    try {
      sendResult = await sendGmailMessage(accessToken, mimeMessage);
    } catch (sendError) {
      console.error("Gmail send error:", sendError);
      return NextResponse.json(
        {
          error:
            sendError instanceof Error
              ? sendError.message
              : "Failed to send email via Gmail",
        },
        { status: 500 }
      );
    }

    // 7. Update draft status if applicable
    if (draftId) {
      await markDraftAsSent(draftId, session.user.id, sendResult.id);
    }

    // 8. Record in audit log
    if (meetingId && roomId) {
      await recordEmailSent({
        draftId,
        meetingId,
        userId: session.user.id,
        roomId,
        toAddresses: finalTo,
        ccAddresses: finalCc,
        subject: finalSubject,
        body: finalBody,
        gmailMessageId: sendResult.id,
      });
    }

    // 9. Return success
    return NextResponse.json({
      success: true,
      messageId: sendResult.id,
      threadId: sendResult.threadId,
    });
  } catch (error) {
    console.error("Gmail send route error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
