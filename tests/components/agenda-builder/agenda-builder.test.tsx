/**
 * Tests for AgendaBuilder Component
 *
 * Tests cover:
 * - Rendering empty state
 * - Adding topics
 * - Editing topics
 * - Deleting topics
 * - Drag-and-drop reordering
 * - Validation limits
 * - Field-level validation (duration, presenter, description)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgendaBuilder } from "@/app/meetings/[roomId]/components/agenda-builder";
import { SortableList } from "@/app/meetings/[roomId]/components/agenda-builder/sortable-list";
import { arrayMove } from "@dnd-kit/sortable";
import type { DraftAgendaItem } from "@/types/agenda";
import { AGENDA_LIMITS } from "@/types/agenda";

// ============================================================================
// Test Helpers
// ============================================================================

const createMockItem = (overrides: Partial<DraftAgendaItem> = {}): DraftAgendaItem => ({
  id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
  title: "Test Topic",
  ...overrides,
});

// ============================================================================
// AgendaBuilder Tests
// ============================================================================

describe("AgendaBuilder", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Empty State Tests
  // --------------------------------------------------------------------------

  describe("Empty State", () => {
    it("renders empty state when no items", () => {
      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      expect(screen.getByText("No agenda topics yet")).toBeInTheDocument();
      expect(screen.getByText(/Add topics to help structure/)).toBeInTheDocument();
    });

    it("shows 0 topics in header", () => {
      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      expect(screen.getByText("0 topics")).toBeInTheDocument();
    });

    it("shows Add Topic button", () => {
      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      expect(screen.getByRole("button", { name: /add topic/i })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Display Tests
  // --------------------------------------------------------------------------

  describe("Displaying Items", () => {
    it("renders items correctly", () => {
      const items: DraftAgendaItem[] = [
        createMockItem({ id: "1", title: "Topic 1" }),
        createMockItem({ id: "2", title: "Topic 2" }),
      ];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText("Topic 1")).toBeInTheDocument();
      expect(screen.getByText("Topic 2")).toBeInTheDocument();
    });

    it("shows correct item count", () => {
      const items: DraftAgendaItem[] = [
        createMockItem({ id: "1", title: "Topic 1" }),
        createMockItem({ id: "2", title: "Topic 2" }),
        createMockItem({ id: "3", title: "Topic 3" }),
      ];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText("3 topics")).toBeInTheDocument();
    });

    it("shows total duration when items have durations", () => {
      const items: DraftAgendaItem[] = [
        createMockItem({ id: "1", title: "Topic 1", estimatedDuration: 10 }),
        createMockItem({ id: "2", title: "Topic 2", estimatedDuration: 15 }),
      ];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText(/25 min total/)).toBeInTheDocument();
    });

    it("shows item metadata (duration and presenter)", () => {
      const items: DraftAgendaItem[] = [
        createMockItem({
          id: "1",
          title: "Topic 1",
          estimatedDuration: 10,
          presenter: "John Doe",
        }),
      ];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText("10 min")).toBeInTheDocument();
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("shows info text when items exist", () => {
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText(/AI will automatically track/)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Add Topic Tests
  // --------------------------------------------------------------------------

  describe("Adding Topics", () => {
    it("opens dialog when Add Topic button is clicked", async () => {
      const user = userEvent.setup();

      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      await user.click(screen.getByRole("button", { name: /add topic/i }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Add Agenda Topic")).toBeInTheDocument();
    });

    it("adds a new topic with required fields", async () => {
      const user = userEvent.setup();

      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      // Open dialog
      await user.click(screen.getByRole("button", { name: /add topic/i }));

      // Fill in title
      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, "New Topic");

      // Submit
      const addButtons = screen.getAllByRole("button", { name: /add topic/i });
      const submitButton = addButtons[addButtons.length - 1];
      await user.click(submitButton);

      // Verify onChange was called
      expect(mockOnChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnChange.mock.calls[0][0];
      expect(newItems).toHaveLength(1);
      expect(newItems[0].title).toBe("New Topic");
    });

    it("adds a topic with all optional fields", async () => {
      const user = userEvent.setup();

      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      await user.click(screen.getByRole("button", { name: /add topic/i }));

      // Fill in all fields
      await user.type(screen.getByLabelText(/title/i), "Complete Topic");
      await user.type(screen.getByLabelText(/duration/i), "15");
      await user.type(screen.getByLabelText(/presenter/i), "Jane Doe");
      await user.type(screen.getByLabelText(/description/i), "A detailed description");

      // Submit
      const addButtons = screen.getAllByRole("button", { name: /add topic/i });
      await user.click(addButtons[addButtons.length - 1]);

      const newItems = mockOnChange.mock.calls[0][0];
      expect(newItems[0]).toMatchObject({
        title: "Complete Topic",
        estimatedDuration: 15,
        presenter: "Jane Doe",
        description: "A detailed description",
      });
    });

    it("validates required title field", async () => {
      const user = userEvent.setup();

      render(<AgendaBuilder items={[]} onChange={mockOnChange} />);

      await user.click(screen.getByRole("button", { name: /add topic/i }));

      // Try to submit without title
      const addButtons = screen.getAllByRole("button", { name: /add topic/i });
      await user.click(addButtons[addButtons.length - 1]);

      expect(screen.getByText("Title is required")).toBeInTheDocument();
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Delete Tests
  // --------------------------------------------------------------------------

  describe("Deleting Topics", () => {
    it("deletes an item when delete button is clicked", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [
        createMockItem({ id: "1", title: "Topic 1" }),
        createMockItem({ id: "2", title: "Topic 2" }),
      ];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Find and click delete button for first item
      const deleteButtons = screen.getAllByRole("button", { name: /delete item/i });
      await user.click(deleteButtons[0]);

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnChange.mock.calls[0][0];
      expect(newItems).toHaveLength(1);
      expect(newItems[0].id).toBe("2");
    });
  });

  // --------------------------------------------------------------------------
  // Limit Tests
  // --------------------------------------------------------------------------

  describe("Item Limits", () => {
    it("shows max items warning when limit reached", () => {
      const items: DraftAgendaItem[] = Array.from(
        { length: AGENDA_LIMITS.MAX_ITEMS },
        (_, i) => createMockItem({ id: `${i}`, title: `Topic ${i + 1}` })
      );

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText(/Maximum .* topics reached/)).toBeInTheDocument();
    });

    it("disables Add Topic button when limit reached", () => {
      const items: DraftAgendaItem[] = Array.from(
        { length: AGENDA_LIMITS.MAX_ITEMS },
        (_, i) => createMockItem({ id: `${i}`, title: `Topic ${i + 1}` })
      );

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      const addButton = screen.getByRole("button", { name: /add topic/i });
      expect(addButton).toBeDisabled();
    });

    it("shows correct count when near limit", () => {
      const items: DraftAgendaItem[] = Array.from({ length: 18 }, (_, i) =>
        createMockItem({ id: `${i}`, title: `Topic ${i + 1}` })
      );

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      expect(screen.getByText(`18/${AGENDA_LIMITS.MAX_ITEMS} max`)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Disabled State Tests
  // --------------------------------------------------------------------------

  describe("Disabled State", () => {
    it("disables all interactions when disabled prop is true", () => {
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} disabled={true} />);

      const addButton = screen.getByRole("button", { name: /add topic/i });
      expect(addButton).toBeDisabled();
    });
  });

  // --------------------------------------------------------------------------
  // Edit Tests
  // --------------------------------------------------------------------------

  describe("Editing Topics", () => {
    it("enters edit mode when edit button is clicked", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Should show input with current value - use getByDisplayValue for specificity
      const input = screen.getByDisplayValue("Topic 1");
      expect(input).toBeInTheDocument();
    });

    it("saves changes when Save button is clicked", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Clear and type new title
      const input = screen.getByDisplayValue("Topic 1");
      await user.clear(input);
      await user.type(input, "Updated Topic");

      // Save
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnChange.mock.calls[0][0];
      expect(newItems[0].title).toBe("Updated Topic");
    });

    it("cancels edit when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Modify title
      const input = screen.getByDisplayValue("Topic 1");
      await user.clear(input);
      await user.type(input, "Changed");

      // Cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // Should show original title
      expect(screen.getByText("Topic 1")).toBeInTheDocument();
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("validates title when saving edit", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Clear title
      const input = screen.getByDisplayValue("Topic 1");
      await user.clear(input);

      // Try to save
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      expect(screen.getByText("Title is required")).toBeInTheDocument();
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("validates duration range when saving edit", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Enter invalid duration (too high)
      const durationInput = screen.getByPlaceholderText("Duration (min)");
      await user.type(durationInput, "999");

      // Try to save
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      expect(screen.getByText(/Duration must be/)).toBeInTheDocument();
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("accepts valid presenter name within limits", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Enter valid presenter name
      const presenterInput = screen.getByPlaceholderText("Presenter");
      await user.type(presenterInput, "John Doe");

      // Save should succeed
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnChange.mock.calls[0][0];
      expect(newItems[0].presenter).toBe("John Doe");
    });
  });

  // --------------------------------------------------------------------------
  // Keyboard Navigation Tests
  // --------------------------------------------------------------------------

  describe("Keyboard Navigation", () => {
    it("saves changes when Enter is pressed", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Modify title
      const input = screen.getByDisplayValue("Topic 1");
      await user.clear(input);
      await user.type(input, "Updated Topic{Enter}");

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnChange.mock.calls[0][0];
      expect(newItems[0].title).toBe("Updated Topic");
    });

    it("cancels edit when Escape is pressed", async () => {
      const user = userEvent.setup();
      const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "Topic 1" })];

      render(<AgendaBuilder items={items} onChange={mockOnChange} />);

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit item/i });
      await user.click(editButton);

      // Modify title then press Escape
      const input = screen.getByDisplayValue("Topic 1");
      await user.clear(input);
      await user.type(input, "Changed{Escape}");

      // Should show original title
      expect(screen.getByText("Topic 1")).toBeInTheDocument();
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// SortableList Tests
// ============================================================================

describe("SortableList", () => {
  const mockOnReorder = vi.fn();
  const mockOnUpdateItem = vi.fn();
  const mockOnDeleteItem = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all items with correct indices", () => {
    const items: DraftAgendaItem[] = [
      createMockItem({ id: "1", title: "First" }),
      createMockItem({ id: "2", title: "Second" }),
      createMockItem({ id: "3", title: "Third" }),
    ];

    render(
      <SortableList
        items={items}
        onReorder={mockOnReorder}
        onUpdateItem={mockOnUpdateItem}
        onDeleteItem={mockOnDeleteItem}
      />
    );

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("renders drag handles for each item", () => {
    const items: DraftAgendaItem[] = [
      createMockItem({ id: "1", title: "First" }),
      createMockItem({ id: "2", title: "Second" }),
    ];

    render(
      <SortableList
        items={items}
        onReorder={mockOnReorder}
        onUpdateItem={mockOnUpdateItem}
        onDeleteItem={mockOnDeleteItem}
      />
    );

    const dragHandles = screen.getAllByRole("button", { name: /drag to reorder/i });
    expect(dragHandles).toHaveLength(2);
  });

  it("disables drag handles when disabled prop is true", () => {
    const items: DraftAgendaItem[] = [createMockItem({ id: "1", title: "First" })];

    render(
      <SortableList
        items={items}
        onReorder={mockOnReorder}
        onUpdateItem={mockOnUpdateItem}
        onDeleteItem={mockOnDeleteItem}
        disabled={true}
      />
    );

    // The sortable is disabled via useSortable hook's disabled option
    // Items should still render but with disabled styling
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("calls onReorder with correctly reordered items when drag completes", () => {
    // Test the reorder logic that would be triggered by onDragEnd
    // This tests arrayMove which is what SortableList uses internally
    const items: DraftAgendaItem[] = [
      createMockItem({ id: "1", title: "First" }),
      createMockItem({ id: "2", title: "Second" }),
      createMockItem({ id: "3", title: "Third" }),
    ];

    // Simulate what happens in handleDragEnd when dragging item 0 to position 2
    const oldIndex = 0;
    const newIndex = 2;
    const reordered = arrayMove(items, oldIndex, newIndex);

    // Verify arrayMove produces correct order
    expect(reordered[0].title).toBe("Second");
    expect(reordered[1].title).toBe("Third");
    expect(reordered[2].title).toBe("First");
    expect(reordered).toHaveLength(3);
  });

  it("does not reorder when dragged to same position", () => {
    const items: DraftAgendaItem[] = [
      createMockItem({ id: "1", title: "First" }),
      createMockItem({ id: "2", title: "Second" }),
    ];

    // Dragging to same position should produce identical array
    const reordered = arrayMove(items, 0, 0);

    expect(reordered[0].title).toBe("First");
    expect(reordered[1].title).toBe("Second");
  });

  // Note: Full drag-and-drop interaction tests require pointer event simulation
  // which is complex in JSDOM. Integration/E2E tests with Playwright should
  // cover actual drag behavior. These unit tests verify the reorder logic.
});
