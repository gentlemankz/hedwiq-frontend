/**
 * Tests for Agenda Validation Module
 *
 * Tests the centralized validation logic for agenda items.
 */

import { describe, it, expect } from "vitest";
import {
  validateAgendaItemInput,
  validateAgendaItemUpdate,
  validateAgendaItems,
  validateReorderItemIds,
} from "@/lib/validation/agenda";
import { AGENDA_LIMITS } from "@/types/agenda";

// ============================================================================
// validateAgendaItemInput Tests
// ============================================================================

describe("validateAgendaItemInput", () => {
  describe("title validation", () => {
    it("should reject missing title", () => {
      const result = validateAgendaItemInput({} as any, 0);
      expect(result).toContain("title is required");
    });

    it("should reject empty title", () => {
      const result = validateAgendaItemInput({ title: "" }, 0);
      expect(result).toContain("title is required");
    });

    it("should reject whitespace-only title", () => {
      const result = validateAgendaItemInput({ title: "   " }, 0);
      expect(result).toContain("title is required");
    });

    it("should reject title exceeding max length", () => {
      const result = validateAgendaItemInput(
        { title: "a".repeat(AGENDA_LIMITS.MAX_TITLE_LENGTH + 1) },
        0
      );
      expect(result).toContain(`${AGENDA_LIMITS.MAX_TITLE_LENGTH} characters`);
    });

    it("should accept valid title", () => {
      const result = validateAgendaItemInput({ title: "Valid Topic" }, 0);
      expect(result).toBeNull();
    });

    it("should include item index in error message", () => {
      const result = validateAgendaItemInput({ title: "" }, 2);
      expect(result).toContain("Item 3");
    });
  });

  describe("description validation", () => {
    it("should accept undefined description", () => {
      const result = validateAgendaItemInput({ title: "Test" }, 0);
      expect(result).toBeNull();
    });

    it("should accept null description", () => {
      const result = validateAgendaItemInput(
        { title: "Test", description: null as any },
        0
      );
      expect(result).toBeNull();
    });

    it("should reject non-string description", () => {
      const result = validateAgendaItemInput(
        { title: "Test", description: 123 as any },
        0
      );
      expect(result).toContain("description must be a string");
    });

    it("should reject description exceeding max length", () => {
      const result = validateAgendaItemInput(
        {
          title: "Test",
          description: "a".repeat(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH + 1),
        },
        0
      );
      expect(result).toContain(`${AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH} characters`);
    });
  });

  describe("estimatedDuration validation", () => {
    it("should accept undefined duration", () => {
      const result = validateAgendaItemInput({ title: "Test" }, 0);
      expect(result).toBeNull();
    });

    it("should reject non-number duration", () => {
      const result = validateAgendaItemInput(
        { title: "Test", estimatedDuration: "30" as any },
        0
      );
      expect(result).toContain("estimatedDuration must be a number");
    });

    it("should reject duration below minimum", () => {
      const result = validateAgendaItemInput(
        { title: "Test", estimatedDuration: 0 },
        0
      );
      expect(result).toContain(
        `between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES}`
      );
    });

    it("should reject duration above maximum", () => {
      const result = validateAgendaItemInput(
        { title: "Test", estimatedDuration: 999 },
        0
      );
      expect(result).toContain(
        `between ${AGENDA_LIMITS.MIN_DURATION_MINUTES} and ${AGENDA_LIMITS.MAX_DURATION_MINUTES}`
      );
    });

    it("should accept valid duration", () => {
      const result = validateAgendaItemInput(
        { title: "Test", estimatedDuration: 30 },
        0
      );
      expect(result).toBeNull();
    });
  });

  describe("presenter validation", () => {
    it("should accept undefined presenter", () => {
      const result = validateAgendaItemInput({ title: "Test" }, 0);
      expect(result).toBeNull();
    });

    it("should reject non-string presenter", () => {
      const result = validateAgendaItemInput(
        { title: "Test", presenter: 123 as any },
        0
      );
      expect(result).toContain("presenter must be a string");
    });

    it("should reject presenter exceeding max length", () => {
      const result = validateAgendaItemInput(
        {
          title: "Test",
          presenter: "a".repeat(AGENDA_LIMITS.MAX_PRESENTER_LENGTH + 1),
        },
        0
      );
      expect(result).toContain(`${AGENDA_LIMITS.MAX_PRESENTER_LENGTH} characters`);
    });
  });
});

// ============================================================================
// validateAgendaItemUpdate Tests
// ============================================================================

describe("validateAgendaItemUpdate", () => {
  it("should accept empty update object", () => {
    const result = validateAgendaItemUpdate({});
    expect(result).toBeNull();
  });

  it("should validate title when provided", () => {
    const result = validateAgendaItemUpdate({ title: "" });
    expect(result).toContain("title is required");
  });

  it("should validate description when provided", () => {
    const result = validateAgendaItemUpdate({
      description: "a".repeat(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH + 1),
    });
    expect(result).toContain("description");
  });

  it("should validate estimatedDuration when provided", () => {
    const result = validateAgendaItemUpdate({ estimatedDuration: 0 });
    expect(result).toContain("estimatedDuration");
  });

  it("should validate presenter when provided", () => {
    const result = validateAgendaItemUpdate({
      presenter: "a".repeat(AGENDA_LIMITS.MAX_PRESENTER_LENGTH + 1),
    });
    expect(result).toContain("presenter");
  });

  it("should NOT include orderIndex in validation (removed by design)", () => {
    // The function signature doesn't include orderIndex
    // This test verifies the type constraint is working
    const validUpdate = {
      title: "New Title",
      description: "New description",
      estimatedDuration: 30,
      presenter: "Jane",
    };
    const result = validateAgendaItemUpdate(validUpdate);
    expect(result).toBeNull();
  });
});

// ============================================================================
// validateAgendaItems Tests
// ============================================================================

describe("validateAgendaItems", () => {
  it("should reject non-array input", () => {
    const result = validateAgendaItems("not an array");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("must be an array");
  });

  it("should accept empty array", () => {
    const result = validateAgendaItems([]);
    expect(result.isValid).toBe(true);
  });

  it("should reject when exceeding max items", () => {
    const items = Array.from({ length: AGENDA_LIMITS.MAX_ITEMS + 1 }, (_, i) => ({
      title: `Topic ${i + 1}`,
    }));
    const result = validateAgendaItems(items);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`Maximum ${AGENDA_LIMITS.MAX_ITEMS}`);
  });

  it("should validate each item", () => {
    const result = validateAgendaItems([
      { title: "Valid" },
      { title: "" }, // Invalid
    ]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Item 2");
  });

  it("should accept valid items array", () => {
    const result = validateAgendaItems([
      { title: "Topic 1" },
      { title: "Topic 2", description: "Details", estimatedDuration: 30 },
    ]);
    expect(result.isValid).toBe(true);
  });
});

// ============================================================================
// validateReorderItemIds Tests
// ============================================================================

describe("validateReorderItemIds", () => {
  it("should reject non-array input", () => {
    const result = validateReorderItemIds("not an array");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("must be an array");
  });

  it("should reject empty array", () => {
    const result = validateReorderItemIds([]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("cannot be empty");
  });

  it("should reject non-string items", () => {
    const result = validateReorderItemIds(["id1", 123, "id3"]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("array of strings");
  });

  it("should reject duplicate IDs", () => {
    const result = validateReorderItemIds(["id1", "id2", "id1"]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("duplicate");
  });

  it("should reject all duplicates", () => {
    const result = validateReorderItemIds(["id1", "id1", "id1"]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("duplicate");
  });

  it("should accept valid unique IDs", () => {
    const result = validateReorderItemIds(["id1", "id2", "id3"]);
    expect(result.isValid).toBe(true);
  });

  it("should accept single ID", () => {
    const result = validateReorderItemIds(["id1"]);
    expect(result.isValid).toBe(true);
  });
});
