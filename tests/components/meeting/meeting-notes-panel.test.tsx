/**
 * Tests for MeetingNotesPanel Component
 *
 * Tests cover:
 * - Rendering in collapsed and expanded states
 * - Controlled vs uncontrolled mode
 * - User interactions (click, keyboard)
 * - Accessibility (ARIA attributes, keyboard navigation)
 * - Block-based notes functionality
 * - Callback stability
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingNotesPanel } from "@/components/meeting/meeting-notes-panel";
import type { NoteBlock, TranscriptNote } from "@/types/transcript-note";

// ============================================================================
// Test Helpers
// ============================================================================

const renderPanel = (props: Partial<React.ComponentProps<typeof MeetingNotesPanel>> = {}) => {
  return render(<MeetingNotesPanel {...props} />);
};

const createTextBlock = (content: string, id = "text-1"): NoteBlock => ({
  type: "text",
  id,
  content,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const createTranscriptNote = (content: string, id = "tnote-1"): TranscriptNote => ({
  id,
  content,
  reference: {
    transcriptId: "transcript-1",
    participantIdentity: "user@example.com",
    participantName: "John Doe",
    transcriptText: "This is what was said in the meeting.",
    transcriptTimestamp: Date.now(),
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const createTranscriptBlock = (noteId: string, blockId = "block-1"): NoteBlock => ({
  type: "transcript",
  id: blockId,
  transcriptNoteId: noteId,
  createdAt: Date.now(),
});

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

    it("renders textarea placeholder when expanded with no blocks", () => {
      renderPanel({ isExpanded: true, blocks: [] });

      expect(screen.getByPlaceholderText(/Type your notes here/)).toBeInTheDocument();
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
  // Block-based Notes Tests
  // --------------------------------------------------------------------------

  describe("Block-based Notes", () => {
    it("renders text blocks when provided", () => {
      const blocks = [createTextBlock("Test notes content")];
      renderPanel({ isExpanded: true, blocks });

      expect(screen.getByDisplayValue("Test notes content")).toBeInTheDocument();
    });

    it("renders multiple text blocks", () => {
      const blocks = [
        createTextBlock("First block", "text-1"),
        createTextBlock("Second block", "text-2"),
      ];
      renderPanel({ isExpanded: true, blocks });

      expect(screen.getByDisplayValue("First block")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Second block")).toBeInTheDocument();
    });

    it("renders transcript blocks with notes", () => {
      const note = createTranscriptNote("My note about this");
      const block = createTranscriptBlock(note.id, "block-1");
      renderPanel({
        isExpanded: true,
        blocks: [block],
        transcriptNotes: { [note.id]: note },
      });

      expect(screen.getByText("My note about this")).toBeInTheDocument();
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("calls onAddTextBlock when typing in empty state", async () => {
      const user = userEvent.setup();
      const mockOnAddTextBlock = vi.fn();
      renderPanel({
        isExpanded: true,
        blocks: [],
        onAddTextBlock: mockOnAddTextBlock,
      });

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "New content");

      // Should call onAddTextBlock when content is added
      expect(mockOnAddTextBlock).toHaveBeenCalled();
    });

    it("calls onUpdateTextBlock when editing existing block", async () => {
      const user = userEvent.setup();
      const mockOnUpdateTextBlock = vi.fn();
      const blocks = [createTextBlock("Initial content")];
      renderPanel({
        isExpanded: true,
        blocks,
        onUpdateTextBlock: mockOnUpdateTextBlock,
      });

      const textarea = screen.getByDisplayValue("Initial content");
      await user.clear(textarea);
      await user.type(textarea, "Updated content");

      expect(mockOnUpdateTextBlock).toHaveBeenCalled();
    });

    it("shows block count when collapsed with content", () => {
      const blocks = [
        createTextBlock("Text 1", "text-1"),
        createTextBlock("Text 2", "text-2"),
      ];
      renderPanel({ isExpanded: false, blocks });

      expect(screen.getByText(/2 text/)).toBeInTheDocument();
    });

    it("shows linked count when collapsed with transcript blocks", () => {
      const note = createTranscriptNote("Note");
      const blocks = [createTranscriptBlock(note.id)];
      renderPanel({
        isExpanded: false,
        blocks,
        transcriptNotes: { [note.id]: note },
      });

      expect(screen.getByText(/1 linked/)).toBeInTheDocument();
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

      // Should show header
      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
    });

    it("works in partially controlled mode (only expanded)", async () => {
      const user = userEvent.setup();
      const mockOnExpandedChange = vi.fn();
      renderPanel({
        isExpanded: true,
        onExpandedChange: mockOnExpandedChange,
      });

      // Collapse (controlled) - click the chevron button
      await user.click(screen.getByRole("button", { name: /^collapse notes$/i }));
      expect(mockOnExpandedChange).toHaveBeenCalledWith(false);
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

    it("handles special characters in text blocks", () => {
      const specialChars = '<script>alert("xss")</script>';
      const blocks = [createTextBlock(specialChars)];
      renderPanel({ isExpanded: true, blocks });

      // Should render as text, not execute
      expect(screen.getByDisplayValue(specialChars)).toBeInTheDocument();
    });

    it("handles unicode characters in text blocks", () => {
      const unicodeText = "会議メモ 📝 العربية";
      const blocks = [createTextBlock(unicodeText)];
      renderPanel({ isExpanded: true, blocks });

      expect(screen.getByDisplayValue(unicodeText)).toBeInTheDocument();
    });

    it("handles multiline text in blocks", () => {
      const multilineText = "Line 1\nLine 2\nLine 3";
      const blocks = [createTextBlock(multilineText)];
      renderPanel({ isExpanded: true, blocks });

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
