/**
 * Tests for MeetingNotesPanel Component
 *
 * Tests cover:
 * - Rendering in collapsed and expanded states
 * - Controlled vs uncontrolled mode
 * - User interactions (click, keyboard)
 * - Accessibility (ARIA attributes, keyboard navigation)
 * - Character count display
 * - Callback stability
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingNotesPanel } from "@/components/meeting/meeting-notes-panel";

// ============================================================================
// Test Helpers
// ============================================================================

const renderPanel = (props: Partial<React.ComponentProps<typeof MeetingNotesPanel>> = {}) => {
  return render(<MeetingNotesPanel {...props} />);
};

// ============================================================================
// MeetingNotesPanel Tests
// ============================================================================

describe("MeetingNotesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Rendering Tests
  // --------------------------------------------------------------------------

  describe("Rendering", () => {
    it("renders in collapsed state by default", () => {
      renderPanel();

      expect(screen.getByText("Click to open notes")).toBeInTheDocument();
      expect(screen.queryByText("Meeting Notes")).not.toBeInTheDocument();
    });

    it("renders in expanded state when isExpanded is true", () => {
      renderPanel({ isExpanded: true });

      expect(screen.queryByText("Click to open notes")).not.toBeInTheDocument();
      // The header should show when expanded
      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
    });

    it("displays the meeting title when expanded", () => {
      renderPanel({ isExpanded: true, meetingTitle: "Weekly Standup" });

      expect(screen.getByText("Weekly Standup")).toBeInTheDocument();
    });

    it("uses default meeting title when not provided", () => {
      renderPanel({ isExpanded: true });

      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
    });

    it("renders textarea placeholder when expanded", () => {
      renderPanel({ isExpanded: true });

      expect(screen.getByPlaceholderText(/Start typing your meeting notes/)).toBeInTheDocument();
    });

    it("does not render content area when collapsed", () => {
      renderPanel({ isExpanded: false });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Expand/Collapse Interaction Tests
  // --------------------------------------------------------------------------

  describe("Expand/Collapse Interactions", () => {
    it("expands when grabber is clicked (uncontrolled)", async () => {
      const user = userEvent.setup();
      renderPanel();

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      await user.click(grabber);

      // Should now show the header
      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
    });

    it("collapses when chevron button is clicked (uncontrolled)", async () => {
      const user = userEvent.setup();
      renderPanel();

      // First expand it
      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      await user.click(grabber);

      // Verify it's expanded
      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();

      // Now collapse via the chevron button
      const collapseButton = screen.getByRole("button", { name: /^collapse notes$/i });
      await user.click(collapseButton);

      // Should be collapsed now
      expect(screen.queryByText("Meeting Notes")).not.toBeInTheDocument();
    });

    it("calls onExpandedChange when toggled (controlled)", async () => {
      const user = userEvent.setup();
      const mockOnExpandedChange = vi.fn();
      renderPanel({ isExpanded: false, onExpandedChange: mockOnExpandedChange });

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      await user.click(grabber);

      expect(mockOnExpandedChange).toHaveBeenCalledWith(true);
    });

    it("toggles via keyboard Enter key", async () => {
      const user = userEvent.setup();
      const mockOnExpandedChange = vi.fn();
      renderPanel({ isExpanded: false, onExpandedChange: mockOnExpandedChange });

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      grabber.focus();
      await user.keyboard("{Enter}");

      expect(mockOnExpandedChange).toHaveBeenCalledWith(true);
    });

    it("toggles via keyboard Space key", async () => {
      const user = userEvent.setup();
      const mockOnExpandedChange = vi.fn();
      renderPanel({ isExpanded: false, onExpandedChange: mockOnExpandedChange });

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      grabber.focus();
      await user.keyboard(" ");

      expect(mockOnExpandedChange).toHaveBeenCalledWith(true);
    });
  });

  // --------------------------------------------------------------------------
  // Notes Input Tests
  // --------------------------------------------------------------------------

  describe("Notes Input", () => {
    it("displays notes content when provided", () => {
      renderPanel({ isExpanded: true, notes: "Test notes content" });

      expect(screen.getByDisplayValue("Test notes content")).toBeInTheDocument();
    });

    it("calls onNotesChange when typing (controlled)", async () => {
      const user = userEvent.setup();
      const mockOnNotesChange = vi.fn();
      renderPanel({
        isExpanded: true,
        notes: "",
        onNotesChange: mockOnNotesChange,
      });

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hi");

      // Should be called for each character
      expect(mockOnNotesChange).toHaveBeenCalledTimes(2);
      // First call should be "H", second should be "i" (since notes prop stays "")
      expect(mockOnNotesChange).toHaveBeenNthCalledWith(1, "H");
      expect(mockOnNotesChange).toHaveBeenNthCalledWith(2, "i");
    });

    it("updates internal state when typing (uncontrolled)", async () => {
      const user = userEvent.setup();
      renderPanel({ isExpanded: true });

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");

      expect(screen.getByDisplayValue("Hello world")).toBeInTheDocument();
    });

    it("handles long text input", async () => {
      const longText = "A".repeat(5000);
      renderPanel({ isExpanded: true, notes: longText });

      expect(screen.getByDisplayValue(longText)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Character Count Tests
  // --------------------------------------------------------------------------

  describe("Character Count", () => {
    it("does not show character count when notes are empty", () => {
      renderPanel({ isExpanded: true, notes: "" });

      expect(screen.queryByText(/characters/)).not.toBeInTheDocument();
    });

    it("shows character count when notes have content", () => {
      renderPanel({ isExpanded: true, notes: "Test" });

      expect(screen.getByText("4 characters")).toBeInTheDocument();
    });

    it("formats large character counts with locale formatting", () => {
      const longText = "A".repeat(1234);
      renderPanel({ isExpanded: true, notes: longText });

      expect(screen.getByText("1,234 characters")).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Accessibility Tests
  // --------------------------------------------------------------------------

  describe("Accessibility", () => {
    it("has correct aria-expanded attribute when collapsed", () => {
      renderPanel({ isExpanded: false });

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      expect(grabber).toHaveAttribute("aria-expanded", "false");
    });

    it("has correct aria-expanded attribute when expanded", () => {
      renderPanel({ isExpanded: true });

      const grabber = screen.getByRole("button", { name: /collapse notes panel/i });
      expect(grabber).toHaveAttribute("aria-expanded", "true");
    });

    it("grabber is focusable via tab", async () => {
      const user = userEvent.setup();
      renderPanel({ isExpanded: false });

      await user.tab();

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });
      expect(grabber).toHaveFocus();
    });

    it("collapse chevron button has proper aria-label", () => {
      renderPanel({ isExpanded: true });

      // Specifically get the chevron button (not grabber)
      expect(screen.getByRole("button", { name: /^collapse notes$/i })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Controlled vs Uncontrolled Mode Tests
  // --------------------------------------------------------------------------

  describe("Controlled vs Uncontrolled Mode", () => {
    it("works in fully uncontrolled mode", async () => {
      const user = userEvent.setup();
      renderPanel();

      // Expand
      await user.click(screen.getByRole("button", { name: /expand notes panel/i }));

      // Type in textarea
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Notes");

      expect(screen.getByDisplayValue("Notes")).toBeInTheDocument();
    });

    it("works in partially controlled mode (only expanded)", async () => {
      const user = userEvent.setup();
      const mockOnExpandedChange = vi.fn();
      renderPanel({
        isExpanded: true,
        onExpandedChange: mockOnExpandedChange,
        // notes is uncontrolled
      });

      // Type in textarea (uncontrolled)
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Text");

      expect(screen.getByDisplayValue("Text")).toBeInTheDocument();

      // Collapse (controlled) - click the chevron button
      await user.click(screen.getByRole("button", { name: /^collapse notes$/i }));
      expect(mockOnExpandedChange).toHaveBeenCalledWith(false);
    });

    it("does not update controlled notes internally", async () => {
      const user = userEvent.setup();
      const mockOnNotesChange = vi.fn();
      renderPanel({
        isExpanded: true,
        notes: "Initial",
        onNotesChange: mockOnNotesChange,
      });

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, " more");

      // The displayed value should still be "Initial" because it's controlled
      // and we're not updating the notes prop
      expect(screen.getByDisplayValue("Initial")).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe("Edge Cases", () => {
    it("handles rapid clicking on grabber in uncontrolled mode", async () => {
      const user = userEvent.setup();
      renderPanel();

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });

      // Rapid clicks - should toggle state
      await user.click(grabber); // expand
      await user.click(grabber); // collapse
      await user.click(grabber); // expand

      // Should end up expanded
      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
    });

    it("calls onExpandedChange for each click in controlled mode", async () => {
      const user = userEvent.setup();
      const mockOnExpandedChange = vi.fn();
      // Note: In controlled mode, isExpanded doesn't change unless parent updates it
      // So each click will always pass !isExpanded (which is !false = true)
      renderPanel({ isExpanded: false, onExpandedChange: mockOnExpandedChange });

      const grabber = screen.getByRole("button", { name: /expand notes panel/i });

      await user.click(grabber);
      await user.click(grabber);
      await user.click(grabber);

      // All calls will be true because isExpanded prop stays false
      expect(mockOnExpandedChange).toHaveBeenCalledTimes(3);
      expect(mockOnExpandedChange).toHaveBeenCalledWith(true);
    });

    it("handles empty meeting title gracefully", () => {
      renderPanel({ isExpanded: true, meetingTitle: "" });

      // Empty string means the heading will be empty
      const header = screen.getByRole("heading", { level: 3 });
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent("");
    });

    it("handles special characters in notes", async () => {
      const specialChars = '<script>alert("xss")</script>';
      renderPanel({ isExpanded: true, notes: specialChars });

      // Should render as text, not execute
      expect(screen.getByDisplayValue(specialChars)).toBeInTheDocument();
    });

    it("handles unicode characters in notes", () => {
      const unicodeText = "🎉 会議メモ 📝 العربية";
      renderPanel({ isExpanded: true, notes: unicodeText });

      expect(screen.getByDisplayValue(unicodeText)).toBeInTheDocument();
    });

    it("handles multiline notes", () => {
      const multilineText = "Line 1\nLine 2\nLine 3";
      renderPanel({ isExpanded: true, notes: multilineText });

      // Textarea value can be checked directly
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue(multilineText);
    });
  });

  // --------------------------------------------------------------------------
  // Styling/Class Tests
  // --------------------------------------------------------------------------

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = renderPanel({ className: "custom-class" });

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has correct height style when collapsed", () => {
      const { container } = renderPanel({ isExpanded: false });

      expect(container.firstChild).toHaveStyle({ height: "28px" });
    });

    it("has correct height style when expanded", () => {
      const { container } = renderPanel({ isExpanded: true });

      // 400 + 28 = 428px
      expect(container.firstChild).toHaveStyle({ height: "428px" });
    });
  });
});
