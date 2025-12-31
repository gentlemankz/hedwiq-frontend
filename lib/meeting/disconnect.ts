/**
 * Meeting Disconnect Utilities
 *
 * Centralized handling of LiveKit disconnect reasons with consistent
 * messaging and action routing across the application.
 */

import { DisconnectReason } from "livekit-client";

// ============================================================================
// Types
// ============================================================================

export type DisconnectAction =
  | "navigate_dashboard"
  | "show_meeting_ended"
  | "show_prejoin_error"
  | "show_prejoin";

export interface DisconnectResult {
  action: DisconnectAction;
  reason?: DisconnectReason;
  errorMessage?: string | null;
}

export interface DisconnectScreenContent {
  icon: "success" | "error" | "warning" | "info";
  title: string;
  description: string;
  showRejoin: boolean;
}

// ============================================================================
// Disconnect Screen Content Map
// ============================================================================

/**
 * Maps disconnect reasons to their corresponding screen content.
 * Uses an object map for O/C principle compliance - add new reasons without
 * modifying existing logic.
 */
const DISCONNECT_SCREEN_CONTENT: Partial<
  Record<DisconnectReason, (meetingName?: string) => DisconnectScreenContent>
> = {
  [DisconnectReason.ROOM_DELETED]: (meetingName) => ({
    icon: "success",
    title: "Meeting Ended",
    description: `${meetingName || "The meeting"} has been ended by the host. Thank you for participating!`,
    showRejoin: false,
  }),

  [DisconnectReason.ROOM_CLOSED]: (meetingName) => ({
    icon: "success",
    title: "Meeting Closed",
    description: `${meetingName || "The meeting"} has closed because all participants left. The session has ended.`,
    showRejoin: false,
  }),

  [DisconnectReason.PARTICIPANT_REMOVED]: () => ({
    icon: "error",
    title: "Removed from Meeting",
    description: "You have been removed from this meeting.",
    showRejoin: false,
  }),

  [DisconnectReason.DUPLICATE_IDENTITY]: () => ({
    icon: "warning",
    title: "Connected Elsewhere",
    description:
      "You joined this meeting from another device or browser tab. This session has been disconnected.",
    showRejoin: true,
  }),

  [DisconnectReason.SERVER_SHUTDOWN]: () => ({
    icon: "warning",
    title: "Server Maintenance",
    description:
      "The meeting server is undergoing maintenance. Please try again in a few moments.",
    showRejoin: true,
  }),
};

/**
 * Default content for unhandled disconnect reasons
 */
const DEFAULT_SCREEN_CONTENT: DisconnectScreenContent = {
  icon: "info",
  title: "Disconnected",
  description: "You have been disconnected from the meeting.",
  showRejoin: false,
};

// ============================================================================
// Error Messages for Pre-join Screen
// ============================================================================

/**
 * Maps disconnect reasons to error messages shown on the pre-join screen.
 * These are for recoverable scenarios where the user can retry.
 */
const PREJOIN_ERROR_MESSAGES: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.JOIN_FAILURE]:
    "Failed to join the meeting. Please try again.",
  [DisconnectReason.SIGNAL_CLOSE]: "Connection lost. Please try reconnecting.",
};

// ============================================================================
// Disconnect Reasons That Show Meeting Ended Screen
// ============================================================================

/**
 * Disconnect reasons that should show the meeting ended screen
 * instead of returning to pre-join.
 */
const MEETING_ENDED_REASONS = new Set<DisconnectReason>([
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.SERVER_SHUTDOWN,
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the screen content for a disconnect reason.
 * Returns content with icon type, title, description, and rejoin availability.
 */
export function getDisconnectScreenContent(
  reason: DisconnectReason,
  meetingName?: string
): DisconnectScreenContent {
  const contentFn = DISCONNECT_SCREEN_CONTENT[reason];
  return contentFn ? contentFn(meetingName) : DEFAULT_SCREEN_CONTENT;
}

/**
 * Determine the appropriate action and messaging for a disconnect event.
 * This is the core routing logic for disconnect handling.
 */
export function getDisconnectResult(
  reason: DisconnectReason | undefined
): DisconnectResult {
  const disconnectReason = reason ?? DisconnectReason.UNKNOWN_REASON;

  // User intentionally left - navigate to dashboard
  if (disconnectReason === DisconnectReason.CLIENT_INITIATED) {
    return { action: "navigate_dashboard" };
  }

  // Meeting ended scenarios - show dedicated screen
  if (MEETING_ENDED_REASONS.has(disconnectReason)) {
    return { action: "show_meeting_ended", reason: disconnectReason };
  }

  // Recoverable errors - show pre-join with error message
  const errorMessage = PREJOIN_ERROR_MESSAGES[disconnectReason];
  if (errorMessage) {
    return { action: "show_prejoin_error", errorMessage };
  }

  // Unknown/other reasons - show pre-join for retry
  return { action: "show_prejoin" };
}

/**
 * Check if a disconnect reason allows rejoining the meeting.
 */
export function canRejoinMeeting(reason: DisconnectReason): boolean {
  const content = getDisconnectScreenContent(reason);
  return content.showRejoin;
}

/**
 * Check if a disconnect reason should show the meeting ended screen.
 */
export function shouldShowMeetingEndedScreen(
  reason: DisconnectReason
): boolean {
  return MEETING_ENDED_REASONS.has(reason);
}
