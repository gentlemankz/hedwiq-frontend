/**
 * Tests for Leave Confirmation Dialog in Custom Control Bar
 *
 * Verifies that the leave meeting button shows a confirmation dialog
 * before disconnecting the user.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomControlBar } from "@/components/meeting/custom-control-bar";

// ============================================================================
// Mocks
// ============================================================================

// Mock LiveKit hooks
const mockDisconnect = vi.fn();
const mockToggle = vi.fn();

vi.mock("@livekit/components-react", () => ({
  useDisconnectButton: () => ({
    buttonProps: {
      onClick: mockDisconnect,
      disabled: false,
    },
  }),
  useTrackToggle: () => ({
    enabled: true,
    pending: false,
    toggle: mockToggle,
  }),
  useLocalParticipantPermissions: () => ({
    canPublish: true,
  }),
  usePersistentUserChoices: () => ({
    saveAudioInputEnabled: vi.fn(),
    saveVideoInputEnabled: vi.fn(),
  }),
  useChatToggle: () => ({
    mergedProps: {
      onClick: vi.fn(),
    },
  }),
}));

// ============================================================================
// Tests
// ============================================================================

describe("Leave Confirmation Dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dialog Display", () => {
    it("does not show confirmation dialog initially", () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      expect(screen.queryByText("Leave Meeting?")).not.toBeInTheDocument();
    });

    it("shows confirmation dialog when leave button is clicked", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      const leaveButton = screen.getByRole("button", { name: /leave meeting/i });
      fireEvent.click(leaveButton);

      await waitFor(() => {
        expect(screen.getByText("Leave Meeting?")).toBeInTheDocument();
      });
    });

    it("shows descriptive message in dialog", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Are you sure you want to leave/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Dialog Actions", () => {
    it("closes dialog when Stay in Meeting is clicked", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

      await waitFor(() => {
        expect(screen.getByText("Stay in Meeting")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Stay in Meeting"));

      await waitFor(() => {
        expect(screen.queryByText("Leave Meeting?")).not.toBeInTheDocument();
      });
    });

    it("does not disconnect when Stay in Meeting is clicked", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

      await waitFor(() => {
        expect(screen.getByText("Stay in Meeting")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Stay in Meeting"));

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("disconnects when Leave Meeting is confirmed", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

      await waitFor(() => {
        // Find the Leave Meeting button inside the dialog
        const confirmButton = screen
          .getAllByText("Leave Meeting")
          .find((el) => el.closest('[role="alertdialog"]'));
        expect(confirmButton).toBeInTheDocument();
        fireEvent.click(confirmButton!);
      });

      // The disconnect should be called via the hidden button
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it("closes dialog after confirming leave", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

      await waitFor(() => {
        const confirmButton = screen
          .getAllByText("Leave Meeting")
          .find((el) => el.closest('[role="alertdialog"]'));
        fireEvent.click(confirmButton!);
      });

      await waitFor(() => {
        expect(screen.queryByText("Leave Meeting?")).not.toBeInTheDocument();
      });
    });
  });

  describe("Button States", () => {
    it("leave button has destructive styling", () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      const leaveButton = screen.getByRole("button", { name: /leave meeting/i });
      // Button should have destructive variant class
      expect(leaveButton).toHaveClass("bg-destructive");
    });
  });

  describe("Accessibility", () => {
    it("leave button has accessible label", () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      expect(
        screen.getByRole("button", { name: /leave meeting/i })
      ).toBeInTheDocument();
    });

    it("dialog is accessible", async () => {
      render(<CustomControlBar controls={{ leave: true }} />);

      fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

      await waitFor(() => {
        // Dialog should be accessible
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      });
    });
  });
});

describe("Control Bar Without Leave Button", () => {
  it("does not render leave button when leave control is false", () => {
    render(<CustomControlBar controls={{ leave: false, microphone: true }} />);

    expect(
      screen.queryByRole("button", { name: /leave meeting/i })
    ).not.toBeInTheDocument();
  });
});
