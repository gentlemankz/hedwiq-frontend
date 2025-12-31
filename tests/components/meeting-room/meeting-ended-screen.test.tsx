/**
 * Tests for MeetingEndedScreen Component
 *
 * Verifies the meeting ended screen displays correct content and actions
 * based on different disconnect reasons. Uses the shared getDisconnectScreenContent
 * utility to ensure consistency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DisconnectReason } from "livekit-client";
import { MeetingEndedScreen } from "@/app/meetings/[roomId]/components/meeting-ended-screen";
import { getDisconnectScreenContent, canRejoinMeeting } from "@/lib/meeting";

// ============================================================================
// Tests
// ============================================================================

describe("MeetingEndedScreen", () => {
  const mockGoToDashboard = vi.fn();
  const mockRejoin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Room Deleted (Host ended meeting)", () => {
    it("displays correct title and message from shared utility", () => {
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_DELETED);

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
    });

    it("shows meeting name when provided", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          meetingName="Team Standup"
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText("Team Standup")).toBeInTheDocument();
    });

    it("displays success icon", () => {
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_DELETED);
      expect(content.icon).toBe("success");

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      // The icon should have the success color class
      const container = screen.getByText("Meeting Ended").closest("div");
      expect(container?.parentElement?.querySelector("svg")).toHaveClass(
        "text-green-500"
      );
    });

    it("does not show rejoin button based on canRejoinMeeting", () => {
      expect(canRejoinMeeting(DisconnectReason.ROOM_DELETED)).toBe(false);

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          onGoToDashboard={mockGoToDashboard}
          onRejoin={mockRejoin}
        />
      );

      expect(screen.queryByText("Rejoin Meeting")).not.toBeInTheDocument();
    });
  });

  describe("Room Closed (All participants left)", () => {
    it("displays correct title and message", () => {
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_CLOSED);

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_CLOSED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
    });
  });

  describe("Participant Removed", () => {
    it("displays removal message", () => {
      const content = getDisconnectScreenContent(
        DisconnectReason.PARTICIPANT_REMOVED
      );

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.PARTICIPANT_REMOVED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
    });

    it("displays error icon", () => {
      const content = getDisconnectScreenContent(
        DisconnectReason.PARTICIPANT_REMOVED
      );
      expect(content.icon).toBe("error");

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.PARTICIPANT_REMOVED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      const container = screen
        .getByText("Removed from Meeting")
        .closest("div");
      expect(container?.parentElement?.querySelector("svg")).toHaveClass(
        "text-destructive"
      );
    });

    it("does not show meeting name for removal", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.PARTICIPANT_REMOVED}
          meetingName="Team Standup"
          onGoToDashboard={mockGoToDashboard}
        />
      );

      // Meeting name should not appear for removal scenarios
      expect(screen.queryByText("Team Standup")).not.toBeInTheDocument();
    });
  });

  describe("Duplicate Identity", () => {
    it("displays duplicate identity message", () => {
      const content = getDisconnectScreenContent(
        DisconnectReason.DUPLICATE_IDENTITY
      );

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.DUPLICATE_IDENTITY}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
    });

    it("shows rejoin button when onRejoin provided", () => {
      expect(canRejoinMeeting(DisconnectReason.DUPLICATE_IDENTITY)).toBe(true);

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.DUPLICATE_IDENTITY}
          onGoToDashboard={mockGoToDashboard}
          onRejoin={mockRejoin}
        />
      );

      expect(screen.getByText("Rejoin Meeting")).toBeInTheDocument();
    });

    it("calls onRejoin when rejoin button clicked", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.DUPLICATE_IDENTITY}
          onGoToDashboard={mockGoToDashboard}
          onRejoin={mockRejoin}
        />
      );

      fireEvent.click(screen.getByText("Rejoin Meeting"));
      expect(mockRejoin).toHaveBeenCalledTimes(1);
    });

    it("displays warning icon", () => {
      const content = getDisconnectScreenContent(
        DisconnectReason.DUPLICATE_IDENTITY
      );
      expect(content.icon).toBe("warning");

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.DUPLICATE_IDENTITY}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      const container = screen.getByText("Connected Elsewhere").closest("div");
      expect(container?.parentElement?.querySelector("svg")).toHaveClass(
        "text-amber-500"
      );
    });
  });

  describe("Server Shutdown", () => {
    it("displays maintenance message", () => {
      const content = getDisconnectScreenContent(
        DisconnectReason.SERVER_SHUTDOWN
      );

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.SERVER_SHUTDOWN}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
    });

    it("shows rejoin button", () => {
      expect(canRejoinMeeting(DisconnectReason.SERVER_SHUTDOWN)).toBe(true);

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.SERVER_SHUTDOWN}
          onGoToDashboard={mockGoToDashboard}
          onRejoin={mockRejoin}
        />
      );

      expect(screen.getByText("Rejoin Meeting")).toBeInTheDocument();
    });
  });

  describe("Unknown/Default Reason", () => {
    it("displays generic disconnected message", () => {
      const content = getDisconnectScreenContent(
        DisconnectReason.UNKNOWN_REASON
      );

      render(
        <MeetingEndedScreen
          reason={DisconnectReason.UNKNOWN_REASON}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
    });
  });

  describe("Dashboard Navigation", () => {
    it("always shows Go to Dashboard button", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    });

    it("calls onGoToDashboard when button clicked", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      fireEvent.click(screen.getByText("Go to Dashboard"));
      expect(mockGoToDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe("Meeting Name Display", () => {
    it("shows meeting name for ended meetings", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          meetingName="Weekly Planning"
          onGoToDashboard={mockGoToDashboard}
        />
      );

      expect(screen.getByText("Weekly Planning")).toBeInTheDocument();
    });

    it("handles undefined meeting name gracefully", () => {
      render(
        <MeetingEndedScreen
          reason={DisconnectReason.ROOM_DELETED}
          onGoToDashboard={mockGoToDashboard}
        />
      );

      // Should not crash and should use default text from utility
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_DELETED);
      expect(
        screen.getByText(content.description, { exact: false })
      ).toBeInTheDocument();
    });
  });
});
