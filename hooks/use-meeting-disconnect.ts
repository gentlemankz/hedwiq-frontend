/**
 * Meeting Disconnect Hook
 *
 * Handles LiveKit disconnect events with proper cleanup, state management,
 * and navigation routing based on disconnect reasons.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DisconnectReason } from "livekit-client";
import {
  getDisconnectResult,
  canRejoinMeeting,
  type DisconnectResult,
} from "@/lib/meeting";

// ============================================================================
// Types
// ============================================================================

interface MeetingInfo {
  meetingId?: string;
  isHost: boolean;
}

interface UseMeetingDisconnectOptions {
  /** Meeting information for cleanup operations */
  meetingInfo: MeetingInfo;
  /** Callback when returning to pre-join (for state reset) */
  onReturnToPreJoin?: (errorMessage: string | null) => void;
}

interface UseMeetingDisconnectReturn {
  /** The reason the meeting ended (null if not ended) */
  meetingEndedReason: DisconnectReason | null;
  /** Handle a disconnect event from LiveKit */
  handleDisconnect: (reason?: DisconnectReason) => Promise<void>;
  /** Clear the ended reason (for rejoin attempts) */
  clearEndedReason: () => void;
  /** Check if the current reason allows rejoining */
  canRejoin: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing meeting disconnect state and navigation.
 *
 * Responsibilities:
 * - Tracks meeting ended state
 * - Routes disconnect events to appropriate actions
 * - Handles cleanup of meeting status on host disconnect
 * - Manages abort controller for in-flight requests
 */
export function useMeetingDisconnect({
  meetingInfo,
  onReturnToPreJoin,
}: UseMeetingDisconnectOptions): UseMeetingDisconnectReturn {
  const router = useRouter();
  const [meetingEndedReason, setMeetingEndedReason] =
    useState<DisconnectReason | null>(null);

  // Track meeting info in ref to avoid stale closures
  const meetingInfoRef = useRef(meetingInfo);
  useEffect(() => {
    meetingInfoRef.current = meetingInfo;
  }, [meetingInfo]);

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  /**
   * Handle disconnect event from LiveKit.
   * Routes to appropriate action based on disconnect reason.
   */
  const handleDisconnect = useCallback(
    async (reason?: DisconnectReason) => {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      const { meetingId, isHost } = meetingInfoRef.current;

      // If host is disconnecting, update meeting status
      if (meetingId && isHost) {
        try {
          abortControllerRef.current = new AbortController();
          await fetch(`/api/meetings/${meetingId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ended" }),
            signal: abortControllerRef.current.signal,
          });
        } catch (err) {
          // Ignore abort errors, log others
          if (err instanceof Error && err.name !== "AbortError") {
            console.error("Failed to update meeting status:", err);
          }
        }
      }

      // Get the appropriate action for this disconnect reason
      const result: DisconnectResult = getDisconnectResult(reason);

      switch (result.action) {
        case "navigate_dashboard":
          router.push("/dashboard");
          break;

        case "show_meeting_ended":
          if (result.reason !== undefined) {
            setMeetingEndedReason(result.reason);
          }
          break;

        case "show_prejoin_error":
          onReturnToPreJoin?.(result.errorMessage ?? null);
          break;

        case "show_prejoin":
          onReturnToPreJoin?.(null);
          break;
      }
    },
    [router, onReturnToPreJoin]
  );

  /**
   * Clear the ended reason to allow rejoin attempts.
   */
  const clearEndedReason = useCallback(() => {
    setMeetingEndedReason(null);
  }, []);

  /**
   * Check if the current disconnect reason allows rejoining.
   */
  const canRejoin = meetingEndedReason
    ? canRejoinMeeting(meetingEndedReason)
    : false;

  return {
    meetingEndedReason,
    handleDisconnect,
    clearEndedReason,
    canRejoin,
  };
}
