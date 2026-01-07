/**
 * Tests for PreJoinScreen Meeting Ended Check
 *
 * Verifies that the pre-join screen correctly shows the MeetingEndedScreen
 * component when attempting to join a meeting that has already concluded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MeetingData } from "@/app/meetings/[roomId]/pre-join-screen";
import { getDisconnectScreenContent } from "@/lib/meeting";
import { DisconnectReason } from "livekit-client";

// ============================================================================
// Mocks
// ============================================================================

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock media devices hook
vi.mock("@/hooks/use-media-devices", () => ({
  useMediaDevices: () => ({
    videoEnabled: false,
    videoStream: null,
    videoDevices: [],
    selectedVideoDevice: "",
    audioEnabled: false,
    audioDevices: [],
    selectedAudioDevice: "",
    toggleVideo: vi.fn(),
    toggleAudio: vi.fn(),
    setSelectedVideoDevice: vi.fn(),
    setSelectedAudioDevice: vi.fn(),
    permissionError: null,
    isTogglingVideo: false,
    isTogglingAudio: false,
    stopAllStreams: vi.fn(),
  }),
}));

// Mock folders hook
vi.mock("@/hooks/use-folders", () => ({
  useFolders: () => ({
    folders: [],
    foldersLoading: false,
    defaultFolderId: null,
  }),
}));

// Mock child components
vi.mock("@/app/meetings/[roomId]/components/video-preview", () => ({
  VideoPreview: () => <div data-testid="video-preview">Video Preview</div>,
}));

vi.mock("@/app/meetings/[roomId]/components/media-controls", () => ({
  MediaControls: () => <div data-testid="media-controls">Media Controls</div>,
}));

vi.mock("@/app/meetings/[roomId]/components/username-form", () => ({
  UsernameForm: () => <div data-testid="username-form">Username Form</div>,
}));

vi.mock("@/components/documents", () => ({
  DocumentUpload: () => (
    <div data-testid="document-upload">Document Upload</div>
  ),
}));

vi.mock("@/app/meetings/[roomId]/components/agenda-builder", () => ({
  AgendaBuilder: () => <div data-testid="agenda-builder">Agenda Builder</div>,
}));

vi.mock("@/components/folders", () => ({
  FolderSelect: () => <div data-testid="folder-select">Folder Select</div>,
}));

// ============================================================================
// Test Setup
// ============================================================================

// Import after mocks are set up
import { PreJoinScreen } from "@/app/meetings/[roomId]/pre-join-screen";

const mockUser = {
  id: "user-123",
  name: "Test User",
  email: "test@example.com",
  image: null,
};

const createMeetingData = (status: string, title?: string): MeetingData => ({
  meeting: {
    id: "meeting-123",
    roomId: "room-123",
    hostId: "host-123",
    title: title || "Test Meeting",
    status: status as "scheduled" | "live" | "ended",
    type: "scheduled",
    scheduledAt: new Date().toISOString(),
    endedAt: status === "ended" ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderId: null,
    templateId: null,
    meetingGoal: null,
    planningAnswers: {},
    durationMinutes: 60,
  },
  agenda: null,
  initialAgendaItems: undefined,
});

// ============================================================================
// Tests
// ============================================================================

describe("PreJoinScreen - Meeting Ended Check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Meeting Status: Ended", () => {
    it("shows MeetingEndedScreen instead of pre-join form", () => {
      // When meeting is ended, PreJoinScreen now uses MeetingEndedScreen with ROOM_CLOSED reason
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_CLOSED);

      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={createMeetingData("ended")}
        />
      );

      // Should show the MeetingEndedScreen content
      expect(screen.getByText(content.title)).toBeInTheDocument();
      expect(screen.queryByTestId("username-form")).not.toBeInTheDocument();
    });

    it("displays meeting title when available", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={createMeetingData("ended", "Team Retrospective")}
        />
      );

      expect(screen.getByText("Team Retrospective")).toBeInTheDocument();
    });

    it("provides Go to Dashboard button", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={createMeetingData("ended")}
        />
      );

      expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    });
  });

  describe("Meeting Status: Live or Scheduled", () => {
    it("shows pre-join form for live meetings", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={createMeetingData("live")}
        />
      );

      const content = getDisconnectScreenContent(DisconnectReason.ROOM_CLOSED);
      expect(screen.queryByText(content.title)).not.toBeInTheDocument();
      expect(screen.getByTestId("username-form")).toBeInTheDocument();
    });

    it("shows pre-join form for scheduled meetings", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={createMeetingData("scheduled")}
        />
      );

      expect(screen.getByTestId("username-form")).toBeInTheDocument();
    });
  });

  describe("No Meeting Data (Instant Meetings)", () => {
    it("shows pre-join form when no meeting data", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={null}
        />
      );

      expect(screen.getByTestId("username-form")).toBeInTheDocument();
    });

    it("shows pre-join form when meeting data is undefined", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
        />
      );

      expect(screen.getByTestId("username-form")).toBeInTheDocument();
    });
  });

  describe("Meeting Data with Null Meeting", () => {
    it("shows pre-join form when meeting object is null", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={{
            meeting: null,
            agenda: null,
            initialAgendaItems: undefined,
          }}
        />
      );

      expect(screen.getByTestId("username-form")).toBeInTheDocument();
    });
  });
});

describe("PreJoinScreen - User Experience Flow", () => {
  describe("Scenario: User tries to rejoin an ended meeting", () => {
    it("immediately shows ended state without loading", () => {
      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          isLoadingMeetingData={false}
          error={null}
          meetingData={createMeetingData("ended")}
        />
      );

      // Should show ended state, not loading
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_CLOSED);
      expect(screen.getByText(content.title)).toBeInTheDocument();
      expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: User accesses meeting that was just ended", () => {
    it("shows MeetingEndedScreen with meeting details", () => {
      const content = getDisconnectScreenContent(DisconnectReason.ROOM_CLOSED);

      render(
        <PreJoinScreen
          roomId="room-123"
          user={mockUser}
          onSubmit={vi.fn()}
          isConnecting={false}
          error={null}
          meetingData={createMeetingData("ended", "Q4 Planning Session")}
        />
      );

      expect(screen.getByText(content.title)).toBeInTheDocument();
      expect(screen.getByText("Q4 Planning Session")).toBeInTheDocument();
      expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    });
  });
});
