/**
 * Tests for useNotesPanel Hook
 *
 * Tests cover:
 * - Initial state
 * - localStorage persistence
 * - Debounced saving
 * - State updates
 * - Hydration handling
 * - Clear functionality
 * - Dirty state tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotesPanel } from "@/hooks/use-notes-panel";

// ============================================================================
// Mocks
// ============================================================================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// ============================================================================
// useNotesPanel Tests
// ============================================================================

describe("useNotesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Initial State Tests
  // --------------------------------------------------------------------------

  describe("Initial State", () => {
    it("returns empty notes initially", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      expect(result.current.notes).toBe("");
    });

    it("returns collapsed state initially", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      expect(result.current.isExpanded).toBe(false);
    });

    it("respects initialExpanded option", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", initialExpanded: true })
      );

      expect(result.current.isExpanded).toBe(true);
    });

    it("is not dirty initially", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      expect(result.current.isDirty).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // localStorage Persistence Tests
  // --------------------------------------------------------------------------

  describe("localStorage Persistence", () => {
    it("loads notes from localStorage on mount", () => {
      localStorageMock.setItem(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "Saved notes", isExpanded: false })
      );

      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      // Wait for hydration
      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.notes).toBe("Saved notes");
    });

    it("loads expanded state from localStorage", () => {
      localStorageMock.setItem(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "", isExpanded: true })
      );

      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.isExpanded).toBe(true);
    });

    it("saves notes to localStorage after debounce", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", debounceMs: 500 })
      );

      // Trigger hydration
      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setNotes("New content");
      });

      // Before debounce
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        expect.stringContaining("New content")
      );

      // After debounce
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "New content", isExpanded: false })
      );
    });

    it("saves expanded state immediately (no debounce)", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setExpanded(true);
      });

      // Should save immediately without waiting for debounce
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "", isExpanded: true })
      );
    });

    it("handles corrupted localStorage data gracefully", () => {
      localStorageMock.setItem("luframe-meeting-notes-test-room", "not-valid-json");

      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      // Should not throw, should use defaults
      expect(result.current.notes).toBe("");
      expect(result.current.isExpanded).toBe(false);
    });

    it("handles localStorage errors gracefully", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error("Storage error");
      });

      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      expect(result.current.notes).toBe("");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // State Update Tests
  // --------------------------------------------------------------------------

  describe("State Updates", () => {
    it("updates notes via setNotes", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        result.current.setNotes("Updated notes");
      });

      expect(result.current.notes).toBe("Updated notes");
    });

    it("updates expanded state via setExpanded", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        result.current.setExpanded(true);
      });

      expect(result.current.isExpanded).toBe(true);
    });

    it("toggles expanded state via toggleExpanded", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        result.current.toggleExpanded();
      });

      expect(result.current.isExpanded).toBe(true);

      act(() => {
        result.current.toggleExpanded();
      });

      expect(result.current.isExpanded).toBe(false);
    });

    it("setExpanded accepts function updater", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        result.current.setExpanded((prev) => !prev);
      });

      expect(result.current.isExpanded).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Dirty State Tests
  // --------------------------------------------------------------------------

  describe("Dirty State", () => {
    it("becomes dirty when notes are modified", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setNotes("New content");
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("becomes clean after save completes", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", debounceMs: 500 })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setNotes("New content");
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Clear Notes Tests
  // --------------------------------------------------------------------------

  describe("Clear Notes", () => {
    it("clears notes content", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        result.current.setNotes("Some notes");
      });

      act(() => {
        result.current.clearNotes();
      });

      expect(result.current.notes).toBe("");
    });

    it("collapses panel on clear", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", initialExpanded: true })
      );

      act(() => {
        result.current.clearNotes();
      });

      expect(result.current.isExpanded).toBe(false);
    });

    it("removes from localStorage on clear", () => {
      localStorageMock.setItem(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "Saved", isExpanded: true })
      );

      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room" })
      );

      act(() => {
        result.current.clearNotes();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room"
      );
    });
  });

  // --------------------------------------------------------------------------
  // Force Save Tests
  // --------------------------------------------------------------------------

  describe("Force Save", () => {
    it("saves immediately without waiting for debounce", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", debounceMs: 5000 })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setNotes("Pending changes");
      });

      // Not saved yet (5 second debounce)
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        expect.stringContaining("Pending changes")
      );

      act(() => {
        result.current.forceSave();
      });

      // Now saved immediately
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "Pending changes", isExpanded: false })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Callback Tests
  // --------------------------------------------------------------------------

  describe("Callbacks", () => {
    it("calls onSave when notes are saved", () => {
      const mockOnSave = vi.fn();
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", debounceMs: 100, onSave: mockOnSave })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setNotes("Content to save");
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockOnSave).toHaveBeenCalledWith("Content to save");
    });
  });

  // --------------------------------------------------------------------------
  // Storage Key Tests
  // --------------------------------------------------------------------------

  describe("Storage Key", () => {
    it("uses correct storage key prefix", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "my-room-123" })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setExpanded(true);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-my-room-123",
        expect.any(String)
      );
    });

    it("isolates data between different storage keys", () => {
      localStorageMock.setItem(
        "luframe-meeting-notes-room-a",
        JSON.stringify({ notes: "Room A notes", isExpanded: false })
      );
      localStorageMock.setItem(
        "luframe-meeting-notes-room-b",
        JSON.stringify({ notes: "Room B notes", isExpanded: true })
      );

      const { result: resultA } = renderHook(() =>
        useNotesPanel({ storageKey: "room-a" })
      );
      const { result: resultB } = renderHook(() =>
        useNotesPanel({ storageKey: "room-b" })
      );

      act(() => {
        vi.runAllTimers();
      });

      expect(resultA.current.notes).toBe("Room A notes");
      expect(resultB.current.notes).toBe("Room B notes");
    });
  });

  // --------------------------------------------------------------------------
  // Debounce Tests
  // --------------------------------------------------------------------------

  describe("Debouncing", () => {
    it("respects custom debounce time", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", debounceMs: 2000 })
      );

      act(() => {
        vi.runAllTimers();
      });

      act(() => {
        result.current.setNotes("Content");
      });

      // After 1 second - should not be saved yet
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        expect.stringContaining("Content")
      );

      // After another 1 second (total 2 seconds) - should be saved
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "Content", isExpanded: false })
      );
    });

    it("resets debounce timer on rapid updates", () => {
      const { result } = renderHook(() =>
        useNotesPanel({ storageKey: "test-room", debounceMs: 500 })
      );

      act(() => {
        vi.runAllTimers();
      });

      // Type rapidly
      act(() => {
        result.current.setNotes("A");
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        result.current.setNotes("AB");
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        result.current.setNotes("ABC");
      });

      // 400ms passed, but timer reset twice
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Not saved yet
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        expect.stringContaining("ABC")
      );

      // After full 500ms from last update
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "luframe-meeting-notes-test-room",
        JSON.stringify({ notes: "ABC", isExpanded: false })
      );
    });
  });
});
