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
import { TeamInvitationEmail } from "./templates/team-invitation";
import type { TeamInvitationEmailProps } from "./templates/team-invitation";
import { ExternalTeamInvitationEmail } from "./templates/external-team-invitation";
import type { ExternalTeamInvitationEmailProps } from "./templates/external-team-invitation";
import type { Meeting, MeetingWithHost } from "@/types/meeting";
import { EXTERNAL_INVITE_LIMITS } from "@/types/team";
import type { AgendaWithItems } from "@/types/agenda";
import type { MeetingInvitee } from "@/types/invitee";
import type { TeamRole } from "@/types/team";
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

const FROM_EMAIL = process.env.EMAIL_FROM || "meetings@luframe.com";
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
// Generic Email Sending
// ============================================================================

/**
 * Options for sending a generic email.
 */
export interface GenericEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Send a generic email via Resend.
 * Used by agents for sending custom emails.
 */
export async function sendGenericEmail(
  options: GenericEmailOptions
): Promise<SendInvitationResult> {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    if (error) {
      console.error("Failed to send generic email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error("Error sending generic email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
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

// ============================================================================
// Team Invitation Emails
// ============================================================================

/**
 * Team invitation data for sending emails.
 */
export interface TeamInvitationData {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Team description */
  teamDescription?: string | null;
  /** Team color */
  teamColor?: string | null;
  /** Role being assigned */
  role: TeamRole;
  /** Number of current active members */
  memberCount: number;
  /** Inviter's name */
  inviterName: string;
  /** Inviter's email */
  inviterEmail: string;
}

/**
 * Invitee data for team invitation email.
 */
export interface TeamEmailInvitee {
  /** User ID */
  userId: string;
  /** Invitee's email */
  email: string;
  /** Invitee's name */
  name?: string | null;
}

/**
 * Result of sending team invitation emails.
 */
export interface SendTeamInvitationsResult {
  sent: Array<{ userId: string; email: string; messageId: string }>;
  failed: Array<{ userId: string; email: string; error: string }>;
}

/**
 * Send a team invitation email to a single user.
 */
export async function sendTeamInvitationEmail(
  team: TeamInvitationData,
  invitee: TeamEmailInvitee
): Promise<SendInvitationResult> {
  // Check if Resend API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping team invitation email");
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    // Generate accept/decline links
    const acceptLink = `${APP_URL}/dashboard/teams?accept=${team.teamId}`;
    const declineLink = `${APP_URL}/dashboard/teams?decline=${team.teamId}`;

    // Prepare email props
    const emailProps: TeamInvitationEmailProps = {
      inviteeName: invitee.name || undefined,
      inviterName: team.inviterName,
      inviterEmail: team.inviterEmail,
      teamName: team.teamName,
      teamDescription: team.teamDescription || undefined,
      teamColor: team.teamColor || undefined,
      role: team.role,
      memberCount: team.memberCount,
      acceptLink,
      declineLink,
      appUrl: APP_URL,
    };

    // Send email
    const { data, error } = await getResend()!.emails.send({
      from: FROM_EMAIL,
      to: invitee.email,
      subject: `You've been invited to join ${team.teamName} on Luframe`,
      react: TeamInvitationEmail(emailProps),
    });

    if (error) {
      console.error("Failed to send team invitation email:", error);
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
    console.error("Error sending team invitation email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send team invitation emails to multiple users.
 * Uses batched sending with concurrency limit.
 */
export async function sendTeamInvitationEmails(
  team: TeamInvitationData,
  invitees: TeamEmailInvitee[]
): Promise<SendTeamInvitationsResult> {
  const result: SendTeamInvitationsResult = {
    sent: [],
    failed: [],
  };

  if (invitees.length === 0) {
    return result;
  }

  // Send emails in parallel with concurrency limit
  const chunks: TeamEmailInvitee[][] = [];
  for (let i = 0; i < invitees.length; i += EMAIL_CONCURRENCY_LIMIT) {
    chunks.push(invitees.slice(i, i + EMAIL_CONCURRENCY_LIMIT));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (invitee) => {
        const sendResult = await sendTeamInvitationEmail(team, invitee);
        return { invitee, sendResult };
      })
    );

    for (const { invitee, sendResult } of results) {
      if (sendResult.success && sendResult.messageId) {
        result.sent.push({
          userId: invitee.userId,
          email: invitee.email,
          messageId: sendResult.messageId,
        });
      } else {
        result.failed.push({
          userId: invitee.userId,
          email: invitee.email,
          error: sendResult.error || "Unknown error",
        });
      }
    }
  }

  return result;
}

// ============================================================================
// External Team Invitation Emails
// ============================================================================

/**
 * Data for sending external team invitation emails.
 */
export interface ExternalTeamInvitationData {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Team description */
  teamDescription?: string | null;
  /** Team color */
  teamColor?: string | null;
  /** Role being assigned */
  role: Exclude<TeamRole, "owner">;
  /** Number of current active members */
  memberCount: number;
  /** Inviter's name */
  inviterName: string;
  /** Inviter's email */
  inviterEmail: string;
  /** Invitee's email */
  inviteeEmail: string;
  /** Invitation token for direct acceptance */
  token: string;
}

/**
 * Send an external team invitation email to a non-registered user.
 */
export async function sendExternalTeamInvitationEmail(
  data: ExternalTeamInvitationData
): Promise<SendInvitationResult> {
  // Check if Resend API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "RESEND_API_KEY not configured, skipping external team invitation email"
    );
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    // Generate signup link with invitation token
    const signupLink = `${APP_URL}/sign-in?team_invite=${data.token}`;

    // Prepare email props
    const emailProps: ExternalTeamInvitationEmailProps = {
      inviterName: data.inviterName,
      inviterEmail: data.inviterEmail,
      teamName: data.teamName,
      teamDescription: data.teamDescription || undefined,
      teamColor: data.teamColor || undefined,
      role: data.role,
      memberCount: data.memberCount,
      signupLink,
      expirationDays: EXTERNAL_INVITE_LIMITS.DEFAULT_EXPIRATION_DAYS,
      appUrl: APP_URL,
    };

    // Send email
    const { data: responseData, error } = await getResend()!.emails.send({
      from: FROM_EMAIL,
      to: data.inviteeEmail,
      subject: `${data.inviterName} invited you to join ${data.teamName} on Luframe`,
      react: ExternalTeamInvitationEmail(emailProps),
    });

    if (error) {
      console.error("Failed to send external team invitation email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: responseData?.id,
    };
  } catch (error) {
    console.error("Error sending external team invitation email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
