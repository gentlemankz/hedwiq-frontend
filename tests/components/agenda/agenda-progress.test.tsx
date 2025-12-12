/**
 * Tests for Agenda Progress Components (Phase 3)
 *
 * Tests cover:
 * - AgendaProgress component rendering
 * - Loading, error, and empty states
 * - Progress calculations
 * - Item status display
 * - ProgressIndicator visual states
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AgendaProgress,
  AgendaProgressCompact,
} from "@/components/agenda/agenda-progress";
import { AgendaProgressItem } from "@/components/agenda/agenda-progress-item";
import { ProgressIndicator, ConnectorLine } from "@/components/agenda/progress-indicator";
import type { AgendaItem } from "@/types/agenda";

// ============================================================================
// Mock useAgenda hook
// ============================================================================

const mockUseAgenda = vi.fn();

vi.mock("@/hooks/use-agenda", () => ({
  useAgenda: () => mockUseAgenda(),
  formatDuration: (minutes: number | null | undefined) => {
    if (!minutes) return "";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} hr`;
    return `${hours} hr ${remainingMinutes} min`;
  },
  formatActualDuration: (seconds: number | null | undefined) => {
    if (!seconds) return "";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) return `${remainingSeconds}s`;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  },
}));

// ============================================================================
// Test Helpers
// ============================================================================

const createMockItem = (overrides: Partial<AgendaItem> = {}): AgendaItem => ({
  id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
  agendaId: "agenda-test-123",
  title: "Test Topic",
  orderIndex: 0,
  status: "pending",
  ...overrides,
});

const defaultMockState = {
  agenda: null,
  isLoading: false,
  error: null,
  currentItem: null,
  currentItemIndex: null,
  completedItems: [],
  pendingItems: [],
  skippedItems: [],
  progressPercentage: 0,
  estimatedRemainingTime: 0,
  isMeetingStarted: false,
  isMeetingEnded: false,
  getTopicForTranscript: () => null,
  refreshAgenda: vi.fn(),
  progressSummary: null,
  remainingTimeLabel: "",
  isCurrentItem: () => false,
  hasAgenda: false,
};

// ============================================================================
// ProgressIndicator Tests
// ============================================================================

describe("ProgressIndicator", () => {
  it("renders pending state correctly", () => {
    render(<ProgressIndicator status="pending" />);

    const indicator = screen.getByRole("status");
    expect(indicator).toHaveAttribute("aria-label", "Upcoming topic");
    expect(indicator).toHaveClass("border-2");
    expect(indicator).toHaveClass("bg-transparent");
  });

  it("renders in_progress state with pulse animation", () => {
    render(<ProgressIndicator status="in_progress" isCurrent />);

    const indicator = screen.getByRole("status");
    expect(indicator).toHaveAttribute("aria-label", "Topic in progress");
    expect(indicator).toHaveClass("bg-primary");
    expect(indicator).toHaveClass("animate-pulse");
  });

  it("renders completed state with checkmark", () => {
    render(<ProgressIndicator status="completed" />);

    const indicator = screen.getByRole("status");
    expect(indicator).toHaveAttribute("aria-label", "Completed topic");
    expect(indicator).toHaveClass("bg-green-500");
  });

  it("renders skipped state", () => {
    render(<ProgressIndicator status="skipped" />);

    const indicator = screen.getByRole("status");
    expect(indicator).toHaveAttribute("aria-label", "Skipped topic");
  });

  it("applies correct size classes", () => {
    const { rerender } = render(<ProgressIndicator status="pending" size="sm" />);
    expect(screen.getByRole("status")).toHaveClass("size-4");

    rerender(<ProgressIndicator status="pending" size="md" />);
    expect(screen.getByRole("status")).toHaveClass("size-5");

    rerender(<ProgressIndicator status="pending" size="lg" />);
    expect(screen.getByRole("status")).toHaveClass("size-6");
  });
});

// ============================================================================
// ConnectorLine Tests
// ============================================================================

describe("ConnectorLine", () => {
  it("renders nothing when isLast is true", () => {
    const { container } = render(<ConnectorLine status="pending" isLast />);
    expect(container.firstChild).toBeNull();
  });

  it("renders connector line when not last", () => {
    const { container } = render(<ConnectorLine status="pending" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("applies completed style for completed items", () => {
    const { container } = render(<ConnectorLine status="completed" />);
    expect(container.firstChild).toHaveClass("bg-green-500/40");
  });

  it("applies pending style for pending items", () => {
    const { container } = render(<ConnectorLine status="pending" />);
    expect(container.firstChild).toHaveClass("bg-muted-foreground/20");
  });
});

// ============================================================================
// AgendaProgressItem Tests
// ============================================================================

describe("AgendaProgressItem", () => {
  it("renders item title", () => {
    const item = createMockItem({ title: "Test Topic" });
    render(
      <AgendaProgressItem item={item} isCurrent={false} isLast={false} index={1} />
    );

    expect(screen.getByText("Test Topic")).toBeInTheDocument();
  });

  it("shows Now badge for current item", () => {
    const item = createMockItem({ title: "Current Topic", status: "in_progress" });
    render(
      <AgendaProgressItem item={item} isCurrent={true} isLast={false} index={1} />
    );

    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  it("shows estimated duration", () => {
    const item = createMockItem({ estimatedDuration: 15 });
    render(
      <AgendaProgressItem item={item} isCurrent={false} isLast={false} index={1} />
    );

    expect(screen.getByText("15 min")).toBeInTheDocument();
  });

  it("shows presenter when set", () => {
    const item = createMockItem({ presenter: "John Doe" });
    render(
      <AgendaProgressItem item={item} isCurrent={false} isLast={false} index={1} />
    );

    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("shows description for current item only", () => {
    const item = createMockItem({
      description: "A detailed description",
      status: "in_progress",
    });

    const { rerender } = render(
      <AgendaProgressItem item={item} isCurrent={true} isLast={false} index={1} />
    );
    expect(screen.getByText("A detailed description")).toBeInTheDocument();

    rerender(
      <AgendaProgressItem item={item} isCurrent={false} isLast={false} index={1} />
    );
    expect(screen.queryByText("A detailed description")).not.toBeInTheDocument();
  });

  it("applies strikethrough for completed items", () => {
    const item = createMockItem({ title: "Completed Topic", status: "completed" });
    render(
      <AgendaProgressItem item={item} isCurrent={false} isLast={false} index={1} />
    );

    expect(screen.getByText("Completed Topic")).toHaveClass("line-through");
  });

  it("applies highlight styling for current item", () => {
    const item = createMockItem({ status: "in_progress" });
    const { container } = render(
      <AgendaProgressItem item={item} isCurrent={true} isLast={false} index={1} />
    );

    expect(container.firstChild).toHaveClass("bg-primary/5");
  });
});

// ============================================================================
// AgendaProgress Tests
// ============================================================================

describe("AgendaProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgenda.mockReturnValue(defaultMockState);
  });

  describe("Loading State", () => {
    it("shows skeleton UI when loading", () => {
      mockUseAgenda.mockReturnValue({
        ...defaultMockState,
        isLoading: true,
      });

      render(<AgendaProgress />);

      // Check for skeleton elements (they have data-slot="skeleton")
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Error State", () => {
    it("shows error message with retry button", () => {
      const mockRefresh = vi.fn();
      mockUseAgenda.mockReturnValue({
        ...defaultMockState,
        error: "Failed to load agenda",
        refreshAgenda: mockRefresh,
      });

      render(<AgendaProgress />);

      expect(screen.getByText("Failed to load agenda")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("shows no agenda message when hasAgenda is false", () => {
      mockUseAgenda.mockReturnValue({
        ...defaultMockState,
        hasAgenda: false,
      });

      render(<AgendaProgress />);

      expect(screen.getByText("No agenda for this meeting")).toBeInTheDocument();
    });
  });

  describe("Active Agenda", () => {
    it("renders agenda items", () => {
      const items = [
        createMockItem({ id: "1", title: "Topic 1", orderIndex: 0 }),
        createMockItem({ id: "2", title: "Topic 2", orderIndex: 1 }),
      ];

      mockUseAgenda.mockReturnValue({
        ...defaultMockState,
        hasAgenda: true,
        agenda: {
          id: "agenda-1",
          roomId: "room-1",
          createdBy: "user-1",
          itemCount: 2,
          status: "active",
          currentItemIndex: null,
          version: 1,
          items,
        },
        progressPercentage: 0,
        progressSummary: { done: 0, total: 2, label: "0/2" },
        isCurrentItem: () => false,
      });

      render(<AgendaProgress />);

      expect(screen.getByText("Topic 1")).toBeInTheDocument();
      expect(screen.getByText("Topic 2")).toBeInTheDocument();
    });

    it("displays progress percentage", () => {
      mockUseAgenda.mockReturnValue({
        ...defaultMockState,
        hasAgenda: true,
        agenda: {
          id: "agenda-1",
          roomId: "room-1",
          createdBy: "user-1",
          itemCount: 2,
          status: "active",
          currentItemIndex: null,
          version: 1,
          items: [
            createMockItem({ id: "1", status: "completed" }),
            createMockItem({ id: "2", status: "pending" }),
          ],
        },
        progressPercentage: 50,
        progressSummary: { done: 1, total: 2, label: "1/2" },
        isCurrentItem: () => false,
      });

      render(<AgendaProgress />);

      expect(screen.getByText("1/2")).toBeInTheDocument();
    });

    it("shows estimated remaining time", () => {
      mockUseAgenda.mockReturnValue({
        ...defaultMockState,
        hasAgenda: true,
        agenda: {
          id: "agenda-1",
          roomId: "room-1",
          createdBy: "user-1",
          itemCount: 1,
          status: "active",
          currentItemIndex: null,
          version: 1,
          items: [createMockItem({ estimatedDuration: 30 })],
        },
        remainingTimeLabel: "30 min",
        progressSummary: { done: 0, total: 1, label: "0/1" },
        isCurrentItem: () => false,
      });

      render(<AgendaProgress />);

      expect(screen.getByText(/Est. remaining: 30 min/)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AgendaProgressCompact Tests
// ============================================================================

describe("AgendaProgressCompact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgenda.mockReturnValue(defaultMockState);
  });

  it("renders nothing when no agenda", () => {
    mockUseAgenda.mockReturnValue({
      ...defaultMockState,
      hasAgenda: false,
    });

    const { container } = render(<AgendaProgressCompact />);
    expect(container.firstChild).toBeNull();
  });

  it("shows current topic when agenda exists", () => {
    const currentItem = createMockItem({
      title: "Current Topic",
      status: "in_progress",
    });

    mockUseAgenda.mockReturnValue({
      ...defaultMockState,
      hasAgenda: true,
      currentItem,
      progressPercentage: 50,
      progressSummary: { done: 1, total: 2, label: "1/2" },
    });

    render(<AgendaProgressCompact />);

    expect(screen.getByText("Current Topic")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Now:")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const mockOnClick = vi.fn();

    mockUseAgenda.mockReturnValue({
      ...defaultMockState,
      hasAgenda: true,
      progressSummary: { done: 0, total: 1, label: "0/1" },
    });

    render(<AgendaProgressCompact onClick={mockOnClick} />);

    const button = screen.getByRole("button");
    await button.click();

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
