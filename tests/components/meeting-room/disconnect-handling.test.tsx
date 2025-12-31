/**
 * Tests for Meeting Room Disconnect Handling
 *
 * Verifies the disconnect flow behavior based on different disconnect reasons:
 * - CLIENT_INITIATED: User left intentionally → Navigate to dashboard
 * - ROOM_DELETED/ROOM_CLOSED/PARTICIPANT_REMOVED: → Show meeting ended screen
 * - DUPLICATE_IDENTITY/SERVER_SHUTDOWN: → Show meeting ended screen with rejoin option
 * - Network issues: → Show pre-join screen with error for reconnection
 *
 * Uses the shared getDisconnectResult utility to ensure consistency
 * between tests and production code.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DisconnectReason } from "livekit-client";
import {
  getDisconnectResult,
  canRejoinMeeting,
  shouldShowMeetingEndedScreen,
} from "@/lib/meeting";

// ============================================================================
// Test Setup
// ============================================================================

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// Tests - Using shared utility (no logic duplication)
// ============================================================================

describe("Disconnect Handling - getDisconnectResult", () => {
  describe("Client Initiated Disconnect (User clicks leave)", () => {
    it("navigates to dashboard when user intentionally leaves", () => {
      const result = getDisconnectResult(DisconnectReason.CLIENT_INITIATED);

      expect(result.action).toBe("navigate_dashboard");
    });
  });

  describe("Room Ended by Host/Server", () => {
    it("shows meeting ended screen when room is deleted", () => {
      const result = getDisconnectResult(DisconnectReason.ROOM_DELETED);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.ROOM_DELETED);
    });

    it("shows meeting ended screen when room is closed (all left)", () => {
      const result = getDisconnectResult(DisconnectReason.ROOM_CLOSED);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.ROOM_CLOSED);
    });

    it("shows meeting ended screen when participant is removed", () => {
      const result = getDisconnectResult(DisconnectReason.PARTICIPANT_REMOVED);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.PARTICIPANT_REMOVED);
    });
  });

  describe("Duplicate Identity (User joined elsewhere)", () => {
    it("shows meeting ended screen with duplicate identity reason", () => {
      const result = getDisconnectResult(DisconnectReason.DUPLICATE_IDENTITY);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.DUPLICATE_IDENTITY);
    });
  });

  describe("Server Shutdown", () => {
    it("shows meeting ended screen for server shutdown", () => {
      const result = getDisconnectResult(DisconnectReason.SERVER_SHUTDOWN);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.SERVER_SHUTDOWN);
    });
  });

  describe("Network Issues and Recoverable Errors", () => {
    it("shows pre-join with error for join failure", () => {
      const result = getDisconnectResult(DisconnectReason.JOIN_FAILURE);

      expect(result.action).toBe("show_prejoin_error");
      expect(result.errorMessage).toBe(
        "Failed to join the meeting. Please try again."
      );
    });

    it("shows pre-join with error for signal close (connection lost)", () => {
      const result = getDisconnectResult(DisconnectReason.SIGNAL_CLOSE);

      expect(result.action).toBe("show_prejoin_error");
      expect(result.errorMessage).toBe(
        "Connection lost. Please try reconnecting."
      );
    });

    it("shows pre-join without error for unknown reason", () => {
      const result = getDisconnectResult(DisconnectReason.UNKNOWN_REASON);

      expect(result.action).toBe("show_prejoin");
      expect(result.errorMessage).toBeUndefined();
    });

    it("shows pre-join without error for state mismatch", () => {
      const result = getDisconnectResult(DisconnectReason.STATE_MISMATCH);

      expect(result.action).toBe("show_prejoin");
    });

    it("shows pre-join without error for migration", () => {
      const result = getDisconnectResult(DisconnectReason.MIGRATION);

      expect(result.action).toBe("show_prejoin");
    });
  });

  describe("Undefined Disconnect Reason", () => {
    it("treats undefined reason as UNKNOWN_REASON", () => {
      const result = getDisconnectResult(undefined);

      expect(result.action).toBe("show_prejoin");
    });
  });
});

describe("canRejoinMeeting utility", () => {
  it("allows rejoin for duplicate identity", () => {
    expect(canRejoinMeeting(DisconnectReason.DUPLICATE_IDENTITY)).toBe(true);
  });

  it("allows rejoin for server shutdown", () => {
    expect(canRejoinMeeting(DisconnectReason.SERVER_SHUTDOWN)).toBe(true);
  });

  it("does not allow rejoin for room deleted", () => {
    expect(canRejoinMeeting(DisconnectReason.ROOM_DELETED)).toBe(false);
  });

  it("does not allow rejoin for participant removed", () => {
    expect(canRejoinMeeting(DisconnectReason.PARTICIPANT_REMOVED)).toBe(false);
  });
});

describe("shouldShowMeetingEndedScreen utility", () => {
  it("returns true for meeting ended scenarios", () => {
    expect(shouldShowMeetingEndedScreen(DisconnectReason.ROOM_DELETED)).toBe(
      true
    );
    expect(shouldShowMeetingEndedScreen(DisconnectReason.ROOM_CLOSED)).toBe(
      true
    );
    expect(
      shouldShowMeetingEndedScreen(DisconnectReason.PARTICIPANT_REMOVED)
    ).toBe(true);
    expect(
      shouldShowMeetingEndedScreen(DisconnectReason.DUPLICATE_IDENTITY)
    ).toBe(true);
    expect(shouldShowMeetingEndedScreen(DisconnectReason.SERVER_SHUTDOWN)).toBe(
      true
    );
  });

  it("returns false for recoverable scenarios", () => {
    expect(shouldShowMeetingEndedScreen(DisconnectReason.JOIN_FAILURE)).toBe(
      false
    );
    expect(shouldShowMeetingEndedScreen(DisconnectReason.SIGNAL_CLOSE)).toBe(
      false
    );
    expect(shouldShowMeetingEndedScreen(DisconnectReason.UNKNOWN_REASON)).toBe(
      false
    );
  });
});

describe("Disconnect Scenarios - User Flow", () => {
  describe("Scenario: Host ends meeting", () => {
    it("host clicking leave navigates to dashboard", () => {
      const result = getDisconnectResult(DisconnectReason.CLIENT_INITIATED);

      expect(result.action).toBe("navigate_dashboard");
    });
  });

  describe("Scenario: Participant leaves meeting", () => {
    it("participant clicking leave navigates to dashboard", () => {
      const result = getDisconnectResult(DisconnectReason.CLIENT_INITIATED);

      expect(result.action).toBe("navigate_dashboard");
    });
  });

  describe("Scenario: Meeting ended by host (participants get kicked)", () => {
    it("participants see meeting ended screen when room deleted", () => {
      const result = getDisconnectResult(DisconnectReason.ROOM_DELETED);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.ROOM_DELETED);
    });
  });

  describe("Scenario: User joins from another device", () => {
    it("original session sees duplicate identity screen with rejoin option", () => {
      const result = getDisconnectResult(DisconnectReason.DUPLICATE_IDENTITY);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.DUPLICATE_IDENTITY);
      expect(canRejoinMeeting(DisconnectReason.DUPLICATE_IDENTITY)).toBe(true);
    });
  });

  describe("Scenario: Network disconnection", () => {
    it("connection lost shows reconnection option", () => {
      const result = getDisconnectResult(DisconnectReason.SIGNAL_CLOSE);

      expect(result.action).toBe("show_prejoin_error");
      expect(result.errorMessage).toContain("reconnecting");
    });
  });

  describe("Scenario: Host removes participant", () => {
    it("removed participant sees removal message without rejoin", () => {
      const result = getDisconnectResult(DisconnectReason.PARTICIPANT_REMOVED);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.PARTICIPANT_REMOVED);
      expect(canRejoinMeeting(DisconnectReason.PARTICIPANT_REMOVED)).toBe(false);
    });
  });

  describe("Scenario: Server maintenance", () => {
    it("shows meeting ended screen with rejoin option", () => {
      const result = getDisconnectResult(DisconnectReason.SERVER_SHUTDOWN);

      expect(result.action).toBe("show_meeting_ended");
      expect(result.reason).toBe(DisconnectReason.SERVER_SHUTDOWN);
      expect(canRejoinMeeting(DisconnectReason.SERVER_SHUTDOWN)).toBe(true);
    });
  });
});
