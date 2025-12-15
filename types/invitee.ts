/**
 * Meeting Invitee Types for Hedwiq Frontend
 *
 * Types for managing meeting invitations and RSVP tracking.
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * RSVP status for meeting invitations.
 * - pending: Invitation sent, no response yet
 * - accepted: Invitee confirmed attendance
 * - declined: Invitee declined the invitation
 * - tentative: Invitee marked as tentative/maybe
 */
export type RSVPStatus = "pending" | "accepted" | "declined" | "tentative";

// ============================================================================
// Core Types
// ============================================================================

/**
 * A meeting invitee record from the database.
 */
export interface MeetingInvitee {
  /** Unique identifier */
  id: string;
  /** Meeting this invitation is for */
  meetingId: string;
  /** Email address of the invitee */
  email: string;
  /** Display name (optional) */
  name?: string | null;
  /** Current RSVP status */
  status: RSVPStatus;
  /** When the invitee responded */
  respondedAt?: string | null;
  /** When the invitation was created */
  invitedAt: string;
  /** User ID who sent the invitation */
  invitedBy: string;
  /** When the email was sent */
  emailSentAt?: string | null;
  /** When the email was opened */
  emailOpenedAt?: string | null;
  /** Token for unauthenticated RSVP */
  rsvpToken?: string | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Summary of RSVP responses for a meeting.
 */
export interface RSVPSummary {
  /** Total number of invitees */
  total: number;
  /** Number of accepted responses */
  accepted: number;
  /** Number of declined responses */
  declined: number;
  /** Number of tentative responses */
  tentative: number;
  /** Number of pending (no response) */
  pending: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for inviting users to a meeting.
 */
export interface InviteUsersRequest {
  /** Email addresses to invite */
  emails: string[];
  /** Optional names for each email (keyed by email) */
  names?: Record<string, string>;
  /** Whether to send invitation emails immediately */
  sendEmails?: boolean;
}

/**
 * Response from inviting users.
 */
export interface InviteUsersResponse {
  /** Invitations that were created */
  invitations: MeetingInvitee[];
  /** Emails that were already invited */
  alreadyInvited: string[];
  /** Any errors that occurred */
  errors?: Array<{ email: string; error: string }>;
}

/**
 * Request body for updating RSVP status.
 */
export interface UpdateRSVPRequest {
  /** New RSVP status */
  status: RSVPStatus;
  /** RSVP token (for unauthenticated RSVP) */
  token?: string;
}

/**
 * Response from updating RSVP.
 */
export interface UpdateRSVPResponse {
  /** Updated invitee record */
  invitee: MeetingInvitee;
}

/**
 * Response from listing invitees.
 */
export interface ListInviteesResponse {
  /** List of invitees */
  invitees: MeetingInvitee[];
  /** RSVP summary */
  summary: RSVPSummary;
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input for creating an invitation.
 */
export interface InviteeInput {
  /** Email address */
  email: string;
  /** Display name (optional) */
  name?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of invitees per meeting.
 */
export const MAX_INVITEES_PER_MEETING = 100;

/**
 * RSVP status labels for UI display.
 */
export const RSVP_STATUS_LABELS: Record<RSVPStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
};

/**
 * RSVP status colors for UI display.
 */
export const RSVP_STATUS_COLORS: Record<RSVPStatus, string> = {
  pending: "text-muted-foreground",
  accepted: "text-green-600",
  declined: "text-red-600",
  tentative: "text-amber-600",
};
