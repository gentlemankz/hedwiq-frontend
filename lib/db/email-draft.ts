/**
 * Email Draft Database Operations
 *
 * CRUD operations for the email_draft and email_sent tables.
 * Handles AI-generated email draft storage and sent email audit logging.
 */

import { db } from "@/lib/db";
import { emailDraft, emailSent, type EmailRecipientDb, type MeetingContextDb } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { generatePrefixedId } from "@/lib/utils";
import type {
  EmailDraft,
  DraftStatus,
  EmailRecipient,
  MeetingContext,
} from "@/types/email-draft";

// ============================================================================
// Constants
// ============================================================================

/** Prefix for email draft IDs */
const DRAFT_ID_PREFIX = "draft";

/** Prefix for email sent audit log IDs */
const SENT_ID_PREFIX = "sent";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique email draft ID.
 */
export function generateEmailDraftId(): string {
  return generatePrefixedId(DRAFT_ID_PREFIX);
}

/**
 * Generates a unique email sent audit ID.
 */
export function generateEmailSentId(): string {
  return generatePrefixedId(SENT_ID_PREFIX);
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Converts database EmailRecipientDb[] to frontend EmailRecipient[].
 */
function dbRecipientsToFrontend(
  recipients: EmailRecipientDb[] | null
): EmailRecipient[] {
  if (!recipients) return [];
  return recipients.map((r) => ({
    email: r.email,
    name: r.name,
    source: r.source,
  }));
}

/**
 * Converts frontend EmailRecipient[] to database EmailRecipientDb[].
 */
function frontendRecipientsToDb(
  recipients: EmailRecipient[]
): EmailRecipientDb[] {
  return recipients.map((r) => ({
    email: r.email,
    name: r.name,
    source: r.source,
  }));
}

/**
 * Converts database MeetingContextDb to frontend MeetingContext.
 */
function dbContextToFrontend(
  ctx: MeetingContextDb | null
): MeetingContext {
  if (!ctx) {
    return {
      meetingTitle: null,
      meetingDate: null,
      participants: [],
      agendaTopics: [],
      roomId: null,
    };
  }
  return {
    meetingTitle: ctx.meetingTitle ?? null,
    meetingDate: ctx.meetingDate ?? null,
    participants: ctx.participants ?? [],
    agendaTopics: ctx.agendaTopics ?? [],
    roomId: ctx.roomId ?? null,
  };
}

/**
 * Converts frontend MeetingContext to database MeetingContextDb.
 */
function frontendContextToDb(ctx: MeetingContext): MeetingContextDb {
  return {
    meetingTitle: ctx.meetingTitle,
    meetingDate: ctx.meetingDate,
    participants: ctx.participants,
    agendaTopics: ctx.agendaTopics,
    roomId: ctx.roomId,
  };
}

/**
 * Validates status string is a valid DraftStatus.
 */
function isValidDraftStatus(status: string): status is DraftStatus {
  return ["generating", "ready", "edited", "sent", "rejected", "failed"].includes(status);
}

/**
 * Converts a database row to an EmailDraft object.
 */
function rowToEmailDraft(
  row: typeof emailDraft.$inferSelect
): EmailDraft {
  // Validate status instead of blind cast
  const status: DraftStatus = isValidDraftStatus(row.status) ? row.status : "ready";

  return {
    id: row.id,
    actionId: row.actionId,
    originalInsightId: row.originalInsightId,
    meetingId: row.meetingId,
    roomId: row.roomId,
    suggestedTo: dbRecipientsToFrontend(row.toAddresses),
    subject: row.subject,
    body: row.body,
    meetingContext: dbContextToFrontend(row.meetingContext),
    transcriptContext: row.transcriptContext,
    actionContent: row.actionContent,
    actionType: row.actionType,
    speakerName: row.speakerName,
    status,
    generationConfidence: row.generationConfidence / 100, // DB stores 0-100, frontend uses 0-1
    generatedAt: row.generatedAt.getTime(),
    errorMessage: row.errorMessage,
  };
}

// ============================================================================
// Email Draft CRUD Operations
// ============================================================================

/**
 * Gets an email draft by ID.
 * WARNING: This does not check user ownership. Use getEmailDraftByIdForUser for user-facing endpoints.
 * @internal Use for internal/server-to-server operations only.
 */
export async function getEmailDraftById(
  draftId: string
): Promise<EmailDraft | null> {
  const [row] = await db
    .select()
    .from(emailDraft)
    .where(eq(emailDraft.id, draftId))
    .limit(1);

  return row ? rowToEmailDraft(row) : null;
}

/**
 * Gets an email draft by ID, ensuring it belongs to the specified user.
 * SECURITY: Always use this for user-facing endpoints.
 */
export async function getEmailDraftByIdForUser(
  draftId: string,
  userId: string
): Promise<EmailDraft | null> {
  const [row] = await db
    .select()
    .from(emailDraft)
    .where(
      and(
        eq(emailDraft.id, draftId),
        eq(emailDraft.userId, userId)
      )
    )
    .limit(1);

  return row ? rowToEmailDraft(row) : null;
}

/**
 * Gets an email draft by action ID for a specific user.
 */
export async function getEmailDraftByActionId(
  actionId: string,
  userId: string
): Promise<EmailDraft | null> {
  const [row] = await db
    .select()
    .from(emailDraft)
    .where(
      and(
        eq(emailDraft.actionId, actionId),
        eq(emailDraft.userId, userId)
      )
    )
    .limit(1);

  return row ? rowToEmailDraft(row) : null;
}

/**
 * Gets all email drafts for a meeting.
 */
export async function getEmailDraftsByMeeting(
  meetingId: string
): Promise<EmailDraft[]> {
  const rows = await db
    .select()
    .from(emailDraft)
    .where(eq(emailDraft.meetingId, meetingId))
    .orderBy(desc(emailDraft.generatedAt));

  return rows.map(rowToEmailDraft);
}

/**
 * Gets all email drafts for a user.
 */
export async function getEmailDraftsByUser(
  userId: string,
  options?: {
    status?: DraftStatus | DraftStatus[];
    limit?: number;
  }
): Promise<EmailDraft[]> {
  // Build where conditions
  const conditions = [eq(emailDraft.userId, userId)];

  if (options?.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    conditions.push(inArray(emailDraft.status, statuses));
  }

  // Build and execute query
  const rows = await db
    .select()
    .from(emailDraft)
    .where(and(...conditions))
    .orderBy(desc(emailDraft.generatedAt))
    .limit(options?.limit ?? 100);

  return rows.map(rowToEmailDraft);
}

/**
 * Gets pending (ready or edited) drafts for a user.
 */
export async function getPendingEmailDrafts(
  userId: string
): Promise<EmailDraft[]> {
  return getEmailDraftsByUser(userId, {
    status: ["ready", "edited"],
  });
}

/**
 * Creates or updates an email draft.
 * Uses upsert (ON CONFLICT) on action_id + user_id.
 */
export async function upsertEmailDraft(params: {
  actionId: string;
  meetingId: string;
  userId: string;
  roomId: string;
  originalInsightId: string;
  suggestedTo: EmailRecipient[];
  subject: string;
  body: string;
  meetingContext: MeetingContext;
  transcriptContext?: string;
  actionContent: string;
  actionType: string;
  speakerName?: string;
  generationConfidence?: number;
}): Promise<EmailDraft> {
  const draftId = generateEmailDraftId();
  const confidence = params.generationConfidence
    ? Math.round(params.generationConfidence * 100) // Convert 0-1 to 0-100
    : 80;

  const [row] = await db
    .insert(emailDraft)
    .values({
      id: draftId,
      actionId: params.actionId,
      meetingId: params.meetingId,
      userId: params.userId,
      roomId: params.roomId,
      originalInsightId: params.originalInsightId,
      toAddresses: frontendRecipientsToDb(params.suggestedTo),
      ccAddresses: [],
      subject: params.subject,
      body: params.body,
      meetingContext: frontendContextToDb(params.meetingContext),
      transcriptContext: params.transcriptContext ?? null,
      actionContent: params.actionContent,
      actionType: params.actionType,
      speakerName: params.speakerName ?? null,
      status: "ready",
      generationConfidence: confidence,
    })
    .onConflictDoUpdate({
      target: [emailDraft.actionId, emailDraft.userId],
      set: {
        toAddresses: frontendRecipientsToDb(params.suggestedTo),
        subject: params.subject,
        body: params.body,
        meetingContext: frontendContextToDb(params.meetingContext),
        transcriptContext: params.transcriptContext ?? null,
        status: "ready",
        generationConfidence: confidence,
        errorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rowToEmailDraft(row);
}

/**
 * Updates an email draft (for user edits).
 */
export async function updateEmailDraft(
  draftId: string,
  userId: string,
  updates: {
    toAddresses?: EmailRecipient[];
    ccAddresses?: EmailRecipient[];
    subject?: string;
    body?: string;
    status?: DraftStatus;
  }
): Promise<EmailDraft | null> {
  // Build the update object dynamically
  const updateData: Partial<typeof emailDraft.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.toAddresses !== undefined) {
    updateData.toAddresses = frontendRecipientsToDb(updates.toAddresses);
  }
  if (updates.ccAddresses !== undefined) {
    updateData.ccAddresses = frontendRecipientsToDb(updates.ccAddresses);
  }
  if (updates.subject !== undefined) {
    updateData.subject = updates.subject;
  }
  if (updates.body !== undefined) {
    updateData.body = updates.body;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  } else if (
    updates.toAddresses !== undefined ||
    updates.subject !== undefined ||
    updates.body !== undefined
  ) {
    // Auto-set status to 'edited' if content was changed
    updateData.status = "edited";
  }

  const [row] = await db
    .update(emailDraft)
    .set(updateData)
    .where(
      and(
        eq(emailDraft.id, draftId),
        eq(emailDraft.userId, userId)
      )
    )
    .returning();

  return row ? rowToEmailDraft(row) : null;
}

/**
 * Updates draft status (convenience function).
 */
export async function updateEmailDraftStatus(
  draftId: string,
  userId: string,
  status: DraftStatus,
  errorMessage?: string
): Promise<EmailDraft | null> {
  const updateData: Partial<typeof emailDraft.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (errorMessage !== undefined) {
    updateData.errorMessage = errorMessage;
  }

  const [row] = await db
    .update(emailDraft)
    .set(updateData)
    .where(
      and(
        eq(emailDraft.id, draftId),
        eq(emailDraft.userId, userId)
      )
    )
    .returning();

  return row ? rowToEmailDraft(row) : null;
}

/**
 * Marks a draft as sent and records the Gmail message ID.
 */
export async function markDraftAsSent(
  draftId: string,
  userId: string,
  gmailMessageId: string
): Promise<EmailDraft | null> {
  const [row] = await db
    .update(emailDraft)
    .set({
      status: "sent",
      gmailMessageId,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailDraft.id, draftId),
        eq(emailDraft.userId, userId)
      )
    )
    .returning();

  return row ? rowToEmailDraft(row) : null;
}

/**
 * Rejects/dismisses a draft.
 */
export async function rejectEmailDraft(
  draftId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(emailDraft)
    .set({
      status: "rejected",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailDraft.id, draftId),
        eq(emailDraft.userId, userId)
      )
    )
    .returning({ id: emailDraft.id });

  return result.length > 0;
}

/**
 * Deletes an email draft.
 */
export async function deleteEmailDraft(
  draftId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .delete(emailDraft)
    .where(
      and(
        eq(emailDraft.id, draftId),
        eq(emailDraft.userId, userId)
      )
    )
    .returning({ id: emailDraft.id });

  return result.length > 0;
}

// ============================================================================
// Email Sent Audit Log Operations
// ============================================================================

/**
 * Records a sent email in the audit log.
 * This is called after successfully sending an email via Gmail.
 */
export async function recordEmailSent(params: {
  draftId?: string;
  meetingId: string;
  userId: string;
  roomId: string;
  toAddresses: string[];
  ccAddresses?: string[];
  subject: string;
  body: string;
  gmailMessageId: string;
}): Promise<void> {
  await db.insert(emailSent).values({
    id: generateEmailSentId(),
    draftId: params.draftId ?? null,
    meetingId: params.meetingId,
    userId: params.userId,
    roomId: params.roomId,
    toAddresses: params.toAddresses,
    ccAddresses: params.ccAddresses ?? null,
    subject: params.subject,
    body: params.body,
    gmailMessageId: params.gmailMessageId,
    sentAt: new Date(),
  });
}

/**
 * Gets sent emails for a meeting (audit log).
 */
export async function getSentEmailsByMeeting(
  meetingId: string
): Promise<{
  id: string;
  draftId: string | null;
  toAddresses: string[];
  subject: string;
  gmailMessageId: string;
  sentAt: Date;
}[]> {
  const rows = await db
    .select({
      id: emailSent.id,
      draftId: emailSent.draftId,
      toAddresses: emailSent.toAddresses,
      subject: emailSent.subject,
      gmailMessageId: emailSent.gmailMessageId,
      sentAt: emailSent.sentAt,
    })
    .from(emailSent)
    .where(eq(emailSent.meetingId, meetingId))
    .orderBy(desc(emailSent.sentAt));

  return rows;
}

/**
 * Gets sent emails by user (for history view).
 */
export async function getSentEmailsByUser(
  userId: string,
  limit?: number
): Promise<{
  id: string;
  draftId: string | null;
  meetingId: string;
  toAddresses: string[];
  subject: string;
  gmailMessageId: string;
  sentAt: Date;
}[]> {
  return db
    .select({
      id: emailSent.id,
      draftId: emailSent.draftId,
      meetingId: emailSent.meetingId,
      toAddresses: emailSent.toAddresses,
      subject: emailSent.subject,
      gmailMessageId: emailSent.gmailMessageId,
      sentAt: emailSent.sentAt,
    })
    .from(emailSent)
    .where(eq(emailSent.userId, userId))
    .orderBy(desc(emailSent.sentAt))
    .limit(limit ?? 100);
}
