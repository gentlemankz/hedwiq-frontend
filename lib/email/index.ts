/**
 * Email Service
 *
 * Handles sending transactional emails via Resend.
 */

import { Resend } from "resend";
import { MeetingInvitationEmail } from "./templates/meeting-invitation";
import type { MeetingInvitationEmailProps } from "./templates/meeting-invitation";
import { MeetingUpdatedEmail } from "./templates/meeting-updated";
import type { MeetingUpdatedEmailProps } from "./templates/meeting-updated";
import { MeetingCancelledEmail } from "./templates/meeting-cancelled";
import type { MeetingCancelledEmailProps } from "./templates/meeting-cancelled";
import type { Meeting, MeetingWithHost } from "@/types/meeting";
import type { AgendaWithItems } from "@/types/agenda";
import type { MeetingInvitee } from "@/types/invitee";
import { generateCalendarLinks } from "@/lib/calendar/links";

// ============================================================================
// Configuration
// ============================================================================

// Lazy-loaded Resend client to avoid build-time errors when API key is not set
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "meetings@hedwiq.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ============================================================================
// Types
// ============================================================================

export interface SendInvitationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendInvitationsResult {
  sent: Array<{ email: string; messageId: string }>;
  failed: Array<{ email: string; error: string }>;
}

export interface MeetingChanges {
  previousScheduledAt?: string;
  previousDurationMinutes?: number;
  previousTitle?: string;
}

// ============================================================================
// Batch Email Helper
// ============================================================================

/**
 * Concurrency limit for batch email sending.
 */
const EMAIL_CONCURRENCY_LIMIT = 5;

/**
 * Send emails to multiple invitees in batches.
 * This is a generic helper used by all batch email functions.
 */
async function sendEmailsInBatches<T extends MeetingInvitee>(
  invitees: T[],
  sendFn: (invitee: T) => Promise<SendInvitationResult>
): Promise<SendInvitationsResult> {
  const result: SendInvitationsResult = {
    sent: [],
    failed: [],
  };

  if (invitees.length === 0) {
    return result;
  }

  // Send emails in parallel with concurrency limit
  const chunks: T[][] = [];
  for (let i = 0; i < invitees.length; i += EMAIL_CONCURRENCY_LIMIT) {
    chunks.push(invitees.slice(i, i + EMAIL_CONCURRENCY_LIMIT));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (invitee) => {
        const sendResult = await sendFn(invitee);
        return { invitee, sendResult };
      })
    );

    for (const { invitee, sendResult } of results) {
      if (sendResult.success && sendResult.messageId) {
        result.sent.push({
          email: invitee.email,
          messageId: sendResult.messageId,
        });
      } else {
        result.failed.push({
          email: invitee.email,
          error: sendResult.error || "Unknown error",
        });
      }
    }
  }

  return result;
}

// ============================================================================
// Email Sending Functions
// ============================================================================

/**
 * Send a meeting invitation email to a single invitee.
 */
export async function sendMeetingInvitation(
  meeting: MeetingWithHost,
  invitee: MeetingInvitee,
  agenda?: AgendaWithItems | null
): Promise<SendInvitationResult> {
  // Validate required meeting data
  if (!meeting.scheduledAt) {
    return {
      success: false,
      error: "Cannot send invitation for meeting without scheduled time",
    };
  }

  // Check if Resend API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    const meetingLink = `${APP_URL}/meetings/${meeting.roomId}`;

    // Generate calendar links
    const calendarLinks = generateCalendarLinks(meeting as Meeting, agenda);

    // Generate RSVP links
    const rsvpBaseUrl = `${APP_URL}/rsvp/${invitee.rsvpToken}`;
    const rsvpLinks = {
      accept: `${rsvpBaseUrl}?status=accepted`,
      decline: `${rsvpBaseUrl}?status=declined`,
      tentative: `${rsvpBaseUrl}?status=tentative`,
    };

    // Prepare email props
    const emailProps: MeetingInvitationEmailProps = {
      inviteeName: invitee.name || undefined,
      hostName: meeting.host.name,
      hostEmail: meeting.host.email,
      meetingTitle: meeting.title,
      meetingDescription: meeting.description || undefined,
      scheduledAt: meeting.scheduledAt,
      durationMinutes: meeting.durationMinutes,
      roomId: meeting.roomId,
      meetingLink,
      agendaItems: agenda?.items?.map((item) => ({
        title: item.title,
        estimatedDuration: item.estimatedDuration,
        description: item.description,
      })),
      calendarLinks: {
        google: calendarLinks.google,
        outlook: calendarLinks.outlook,
        ics: calendarLinks.ics,
      },
      rsvpLinks,
      appUrl: APP_URL,
    };

    // Send email (getResend()! is safe since we checked RESEND_API_KEY above)
    const { data, error } = await getResend()!.emails.send({
      from: FROM_EMAIL,
      to: invitee.email,
      subject: `Meeting Invitation: ${meeting.title}`,
      react: MeetingInvitationEmail(emailProps),
    });

    if (error) {
      console.error("Failed to send invitation email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send meeting invitation emails to multiple invitees.
 */
export async function sendMeetingInvitations(
  meeting: MeetingWithHost,
  invitees: MeetingInvitee[],
  agenda?: AgendaWithItems | null
): Promise<SendInvitationsResult> {
  return sendEmailsInBatches(invitees, (invitee) =>
    sendMeetingInvitation(meeting, invitee, agenda)
  );
}

/**
 * Send a meeting update notification email to a single invitee.
 */
async function sendMeetingUpdateEmail(
  meeting: MeetingWithHost,
  invitee: MeetingInvitee,
  changes: MeetingChanges,
  agenda?: AgendaWithItems | null
): Promise<SendInvitationResult> {
  if (!meeting.scheduledAt) {
    return {
      success: false,
      error: "Cannot send update for meeting without scheduled time",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    const meetingLink = `${APP_URL}/meetings/${meeting.roomId}`;
    const calendarLinks = generateCalendarLinks(meeting as Meeting, agenda);

    const isReschedule = !!changes.previousScheduledAt;

    const emailProps: MeetingUpdatedEmailProps = {
      inviteeName: invitee.name || undefined,
      hostName: meeting.host.name,
      hostEmail: meeting.host.email,
      meetingTitle: meeting.title,
      meetingDescription: meeting.description || undefined,
      scheduledAt: meeting.scheduledAt,
      durationMinutes: meeting.durationMinutes,
      meetingLink,
      changes: {
        previousScheduledAt: changes.previousScheduledAt,
        previousDurationMinutes: changes.previousDurationMinutes,
        previousTitle: changes.previousTitle,
        isReschedule,
      },
      calendarLinks: {
        google: calendarLinks.google,
        outlook: calendarLinks.outlook,
        ics: calendarLinks.ics,
      },
      appUrl: APP_URL,
    };

    const subjectPrefix = isReschedule ? "Rescheduled" : "Updated";

    const { data, error } = await getResend()!.emails.send({
      from: FROM_EMAIL,
      to: invitee.email,
      subject: `Meeting ${subjectPrefix}: ${meeting.title}`,
      react: MeetingUpdatedEmail(emailProps),
    });

    if (error) {
      console.error("Failed to send update email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error("Error sending update email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a meeting cancellation email to a single invitee.
 */
async function sendMeetingCancelledEmail(
  meeting: MeetingWithHost,
  invitee: MeetingInvitee,
  cancellationReason?: string
): Promise<SendInvitationResult> {
  if (!meeting.scheduledAt) {
    return {
      success: false,
      error: "Cannot send cancellation for meeting without scheduled time",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    const emailProps: MeetingCancelledEmailProps = {
      inviteeName: invitee.name || undefined,
      hostName: meeting.host.name,
      hostEmail: meeting.host.email,
      meetingTitle: meeting.title,
      scheduledAt: meeting.scheduledAt,
      durationMinutes: meeting.durationMinutes,
      cancellationReason,
      appUrl: APP_URL,
    };

    const { data, error } = await getResend()!.emails.send({
      from: FROM_EMAIL,
      to: invitee.email,
      subject: `Meeting Cancelled: ${meeting.title}`,
      react: MeetingCancelledEmail(emailProps),
    });

    if (error) {
      console.error("Failed to send cancellation email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error("Error sending cancellation email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send meeting update/reschedule notification emails to multiple invitees.
 */
export async function sendMeetingUpdateNotifications(
  meeting: MeetingWithHost,
  invitees: MeetingInvitee[],
  changes: MeetingChanges,
  agenda?: AgendaWithItems | null
): Promise<SendInvitationsResult> {
  return sendEmailsInBatches(invitees, (invitee) =>
    sendMeetingUpdateEmail(meeting, invitee, changes, agenda)
  );
}

/**
 * Send meeting cancellation notification emails to multiple invitees.
 */
export async function sendMeetingCancellationNotifications(
  meeting: MeetingWithHost,
  invitees: MeetingInvitee[],
  cancellationReason?: string
): Promise<SendInvitationsResult> {
  return sendEmailsInBatches(invitees, (invitee) =>
    sendMeetingCancelledEmail(meeting, invitee, cancellationReason)
  );
}

/**
 * Send a meeting update notification email (legacy wrapper for backward compatibility).
 * @deprecated Use sendMeetingUpdateNotifications or sendMeetingCancellationNotifications instead.
 */
export async function sendMeetingUpdateNotification(
  meeting: MeetingWithHost,
  invitees: MeetingInvitee[],
  updateType: "rescheduled" | "cancelled" | "updated",
  options?: {
    changes?: MeetingChanges;
    cancellationReason?: string;
    agenda?: AgendaWithItems | null;
  }
): Promise<SendInvitationsResult> {
  if (updateType === "cancelled") {
    return sendMeetingCancellationNotifications(
      meeting,
      invitees,
      options?.cancellationReason
    );
  }

  // For rescheduled and updated, use the update notifications
  return sendMeetingUpdateNotifications(
    meeting,
    invitees,
    options?.changes || {},
    options?.agenda
  );
}

// ============================================================================
// Email Preview (for development)
// ============================================================================

/**
 * Generate email HTML preview (for development/testing).
 */
export async function previewInvitationEmail(
  meeting: MeetingWithHost,
  inviteeName?: string
): Promise<string> {
  // This is a simplified preview - in production, use @react-email/render
  const meetingLink = `${APP_URL}/meetings/${meeting.roomId}`;
  const calendarLinks = generateCalendarLinks(meeting as Meeting);

  return `
    <html>
      <body>
        <h1>Meeting Invitation Preview</h1>
        <p>This would be sent to: ${inviteeName || "invitee"}</p>
        <hr />
        <p><strong>Meeting:</strong> ${meeting.title}</p>
        <p><strong>Date:</strong> ${meeting.scheduledAt}</p>
        <p><strong>Host:</strong> ${meeting.host.name}</p>
        <p><strong>Link:</strong> <a href="${meetingLink}">${meetingLink}</a></p>
        <hr />
        <p><strong>Calendar Links:</strong></p>
        <ul>
          <li><a href="${calendarLinks.google}">Google Calendar</a></li>
          <li><a href="${calendarLinks.outlook}">Outlook</a></li>
          <li><a href="${calendarLinks.ics}">Download ICS</a></li>
        </ul>
      </body>
    </html>
  `;
}
