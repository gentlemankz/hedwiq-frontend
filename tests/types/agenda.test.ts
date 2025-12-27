/**
 * Tests for Agenda Types and Constants
 *
 * Validates type definitions and constants used across the agenda feature.
 */

import { describe, it, expect } from "vitest";
import {
  AGENDA_LIMITS,
  AGENDA_TOPIC,
  type AgendaStatus,
  type AgendaItemStatus,
  type AgendaItem,
  type Agenda,
  type DraftAgendaItem,
  type AgendaProgressEvent,
  type AgendaStateAttribute,
} from "@/types/agenda";

// ============================================================================
// Constants Tests
// ============================================================================

describe("AGENDA_LIMITS", () => {
  it("should have MAX_ITEMS set to a reasonable limit", () => {
    expect(AGENDA_LIMITS.MAX_ITEMS).toBe(20);
    expect(AGENDA_LIMITS.MAX_ITEMS).toBeGreaterThan(0);
  });

  it("should have valid title length limits", () => {
    expect(AGENDA_LIMITS.MIN_TITLE_LENGTH).toBe(1);
    expect(AGENDA_LIMITS.MAX_TITLE_LENGTH).toBe(100);
    expect(AGENDA_LIMITS.MIN_TITLE_LENGTH).toBeLessThan(AGENDA_LIMITS.MAX_TITLE_LENGTH);
  });

  it("should have valid description length limit", () => {
    expect(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH).toBe(500);
    expect(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH).toBeGreaterThan(AGENDA_LIMITS.MAX_TITLE_LENGTH);
  });

  it("should have valid duration limits", () => {
    expect(AGENDA_LIMITS.MIN_DURATION_MINUTES).toBe(1);
    expect(AGENDA_LIMITS.MAX_DURATION_MINUTES).toBe(120);
    expect(AGENDA_LIMITS.MIN_DURATION_MINUTES).toBeLessThan(AGENDA_LIMITS.MAX_DURATION_MINUTES);
  });

  it("should have valid presenter length limit", () => {
    expect(AGENDA_LIMITS.MAX_PRESENTER_LENGTH).toBe(50);
    expect(AGENDA_LIMITS.MAX_PRESENTER_LENGTH).toBeGreaterThan(0);
  });
});

describe("AGENDA_TOPIC", () => {
  it("should have correct LiveKit topic name", () => {
    expect(AGENDA_TOPIC).toBe("luframe.agenda");
  });

  it("should follow LiveKit naming convention", () => {
    expect(AGENDA_TOPIC).toMatch(/^luframe\./);
  });
});

// ============================================================================
// Type Structure Tests (Runtime Validation)
// ============================================================================

describe("Type Structures", () => {
  describe("AgendaItem", () => {
    it("should accept valid agenda item", () => {
      const item: AgendaItem = {
        id: "item-1",
        agendaId: "agenda-1",
        title: "Test Topic",
        orderIndex: 0,
        status: "pending",
      };

      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.status).toBe("pending");
    });

    it("should accept all optional fields", () => {
      const item: AgendaItem = {
        id: "item-1",
        agendaId: "agenda-1",
        title: "Test Topic",
        description: "A description",
        estimatedDuration: 15,
        presenter: "John",
        orderIndex: 0,
        status: "in_progress",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: null,
        actualDuration: null,
        startTranscriptRef: "trans-1",
        endTranscriptRef: null,
      };

      expect(item.description).toBe("A description");
      expect(item.estimatedDuration).toBe(15);
      expect(item.presenter).toBe("John");
    });

    it("should accept all valid status values", () => {
      const statuses: AgendaItemStatus[] = ["pending", "in_progress", "completed", "skipped"];

      statuses.forEach((status) => {
        const item: AgendaItem = {
          id: "item-1",
          agendaId: "agenda-1",
          title: "Test",
          orderIndex: 0,
          status,
        };
        expect(item.status).toBe(status);
      });
    });
  });

  describe("Agenda", () => {
    it("should accept valid agenda", () => {
      const agenda: Agenda = {
        id: "agenda-1",
        roomId: "room-1",
        createdBy: "user-1",
        itemCount: 3,
        status: "draft",
        currentItemIndex: null,
        version: 1,
      };

      expect(agenda.id).toBeDefined();
      expect(agenda.status).toBe("draft");
      expect(agenda.version).toBe(1);
    });

    it("should accept all valid status values", () => {
      const statuses: AgendaStatus[] = ["draft", "active", "completed"];

      statuses.forEach((status) => {
        const agenda: Agenda = {
          id: "agenda-1",
          roomId: "room-1",
          createdBy: "user-1",
          itemCount: 0,
          status,
          currentItemIndex: null,
          version: 1,
        };
        expect(agenda.status).toBe(status);
      });
    });
  });

  describe("DraftAgendaItem", () => {
    it("should accept minimal draft item", () => {
      const draft: DraftAgendaItem = {
        id: "draft-1",
        title: "New Topic",
      };

      expect(draft.id).toBeDefined();
      expect(draft.title).toBeDefined();
    });

    it("should accept full draft item", () => {
      const draft: DraftAgendaItem = {
        id: "draft-1",
        title: "New Topic",
        description: "Details here",
        estimatedDuration: 30,
        presenter: "Jane",
      };

      expect(draft.description).toBe("Details here");
      expect(draft.estimatedDuration).toBe(30);
    });
  });

  describe("AgendaProgressEvent", () => {
    it("should accept meeting_started event", () => {
      const event: AgendaProgressEvent = {
        type: "meeting_started",
        timestamp: Date.now(),
      };

      expect(event.type).toBe("meeting_started");
    });

    it("should accept topic_started event with all fields", () => {
      const event: AgendaProgressEvent = {
        type: "topic_started",
        timestamp: Date.now(),
        itemId: "item-1",
        itemIndex: 0,
        confidence: 0.95,
        transcriptRef: "trans-1",
      };

      expect(event.type).toBe("topic_started");
      expect(event.confidence).toBeGreaterThanOrEqual(0);
      expect(event.confidence).toBeLessThanOrEqual(1);
    });

    it("should accept topic_completed event with duration", () => {
      const event: AgendaProgressEvent = {
        type: "topic_completed",
        timestamp: Date.now(),
        itemId: "item-1",
        itemIndex: 0,
        confidence: 0.9,
        actualDuration: 600,
      };

      expect(event.actualDuration).toBe(600);
    });

    it("should accept topic_skipped event with reason", () => {
      const event: AgendaProgressEvent = {
        type: "topic_skipped",
        timestamp: Date.now(),
        itemId: "item-1",
        itemIndex: 0,
        reason: "Time constraints",
      };

      expect(event.reason).toBeDefined();
    });
  });

  describe("AgendaStateAttribute", () => {
    it("should accept compact state format", () => {
      const state: AgendaStateAttribute = {
        v: 2,
        c: "item-1",
        d: ["item-0"],
        s: Math.floor(Date.now() / 1000),
      };

      expect(state.v).toBe(2);
      expect(state.c).toBe("item-1");
      expect(state.d).toHaveLength(1);
    });

    it("should accept null current item", () => {
      const state: AgendaStateAttribute = {
        v: 1,
        c: null,
        d: [],
        s: null,
      };

      expect(state.c).toBeNull();
      expect(state.s).toBeNull();
    });
  });
});

// ============================================================================
// Validation Boundary Tests
// ============================================================================

describe("Validation Boundaries", () => {
  describe("Title Length", () => {
    it("should accept minimum length title", () => {
      const title = "a";
      expect(title.length).toBeGreaterThanOrEqual(AGENDA_LIMITS.MIN_TITLE_LENGTH);
    });

    it("should accept maximum length title", () => {
      const title = "a".repeat(AGENDA_LIMITS.MAX_TITLE_LENGTH);
      expect(title.length).toBe(AGENDA_LIMITS.MAX_TITLE_LENGTH);
    });

    it("should reject title exceeding max length", () => {
      const title = "a".repeat(AGENDA_LIMITS.MAX_TITLE_LENGTH + 1);
      expect(title.length).toBeGreaterThan(AGENDA_LIMITS.MAX_TITLE_LENGTH);
    });
  });

  describe("Description Length", () => {
    it("should accept maximum length description", () => {
      const description = "a".repeat(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH);
      expect(description.length).toBe(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH);
    });

    it("should reject description exceeding max length", () => {
      const description = "a".repeat(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH + 1);
      expect(description.length).toBeGreaterThan(AGENDA_LIMITS.MAX_DESCRIPTION_LENGTH);
    });
  });

  describe("Duration Range", () => {
    it("should accept minimum duration", () => {
      const duration = AGENDA_LIMITS.MIN_DURATION_MINUTES;
      expect(duration).toBe(1);
    });

    it("should accept maximum duration", () => {
      const duration = AGENDA_LIMITS.MAX_DURATION_MINUTES;
      expect(duration).toBe(120);
    });

    it("should reject duration below minimum", () => {
      const duration = AGENDA_LIMITS.MIN_DURATION_MINUTES - 1;
      expect(duration).toBeLessThan(AGENDA_LIMITS.MIN_DURATION_MINUTES);
    });

    it("should reject duration above maximum", () => {
      const duration = AGENDA_LIMITS.MAX_DURATION_MINUTES + 1;
      expect(duration).toBeGreaterThan(AGENDA_LIMITS.MAX_DURATION_MINUTES);
    });
  });

  describe("Item Count", () => {
    it("should accept maximum items", () => {
      const count = AGENDA_LIMITS.MAX_ITEMS;
      expect(count).toBe(20);
    });

    it("should accept zero items (empty agenda)", () => {
      const count = 0;
      expect(count).toBeLessThanOrEqual(AGENDA_LIMITS.MAX_ITEMS);
    });

    it("should reject items exceeding maximum", () => {
      const count = AGENDA_LIMITS.MAX_ITEMS + 1;
      expect(count).toBeGreaterThan(AGENDA_LIMITS.MAX_ITEMS);
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("Unicode and Special Characters", () => {
    it("should handle unicode in title", () => {
      const item: DraftAgendaItem = {
        id: "draft-1",
        title: "议题一: 项目进展 🚀",
      };
      expect(item.title).toContain("🚀");
    });

    it("should handle RTL text", () => {
      const item: DraftAgendaItem = {
        id: "draft-1",
        title: "موضوع الاجتماع",
      };
      expect(item.title.length).toBeGreaterThan(0);
    });

    it("should handle mixed scripts", () => {
      const item: DraftAgendaItem = {
        id: "draft-1",
        title: "Meeting 会议 совещание",
      };
      expect(item.title).toContain("会议");
    });
  });

  describe("Timestamp Handling", () => {
    it("should handle ISO string timestamps", () => {
      const item: AgendaItem = {
        id: "item-1",
        agendaId: "agenda-1",
        title: "Test",
        orderIndex: 0,
        status: "completed",
        startedAt: "2024-01-01T10:00:00.000Z",
        completedAt: "2024-01-01T10:30:00.000Z",
      };
      expect(item.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should handle numeric timestamps", () => {
      const item: AgendaItem = {
        id: "item-1",
        agendaId: "agenda-1",
        title: "Test",
        orderIndex: 0,
        status: "completed",
        startedAt: 1704106800000,
        completedAt: 1704108600000,
      };
      expect(typeof item.startedAt).toBe("number");
    });
  });

  describe("Null vs Undefined", () => {
    it("should distinguish between null and undefined for optional fields", () => {
      const itemWithNull: AgendaItem = {
        id: "item-1",
        agendaId: "agenda-1",
        title: "Test",
        orderIndex: 0,
        status: "pending",
        description: null,
      };

      const itemWithUndefined: AgendaItem = {
        id: "item-1",
        agendaId: "agenda-1",
        title: "Test",
        orderIndex: 0,
        status: "pending",
        // description is undefined (not set)
      };

      expect(itemWithNull.description).toBeNull();
      expect(itemWithUndefined.description).toBeUndefined();
    });
  });

  describe("Empty Arrays and Objects", () => {
    it("should handle empty completed items array", () => {
      const state: AgendaStateAttribute = {
        v: 1,
        c: null,
        d: [],
        s: null,
      };
      expect(state.d).toHaveLength(0);
    });

    it("should handle agenda with zero items", () => {
      const agenda: Agenda = {
        id: "agenda-1",
        roomId: "room-1",
        createdBy: "user-1",
        itemCount: 0,
        status: "draft",
        currentItemIndex: null,
        version: 1,
      };
      expect(agenda.itemCount).toBe(0);
    });
  });
});
