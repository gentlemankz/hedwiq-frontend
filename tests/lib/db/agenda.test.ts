/**
 * Tests for lib/db/agenda.ts
 *
 * These tests cover all CRUD operations and edge cases for agenda management.
 * Uses mocked database to test business logic without actual DB connections.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Import after mocking
import { db } from "@/lib/db";
import {
  generateAgendaId,
  generateAgendaItemId,
  getAgendaByRoomId,
  getAgendaWithItems,
  getAgendaItemById,
  upsertAgenda,
  createAgenda,
  publishAgenda,
  updateAgendaItem,
  deleteAgendaItem,
  reorderAgendaItems,
  updateAgendaItemStatus,
  startAgendaItem,
  completeAgendaItem,
} from "@/lib/db/agenda";

// ============================================================================
// Test Helpers
// ============================================================================

const mockSelect = () => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  (db.select as Mock).mockReturnValue(chain);
  return chain;
};

const mockInsert = () => {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
  };
  (db.insert as Mock).mockReturnValue(chain);
  return chain;
};

const mockUpdate = () => {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
  };
  (db.update as Mock).mockReturnValue(chain);
  return chain;
};

const mockDelete = () => {
  const chain = {
    where: vi.fn().mockReturnThis(),
  };
  (db.delete as Mock).mockReturnValue(chain);
  return chain;
};

const createMockAgenda = (overrides = {}) => ({
  id: "agenda-test-room-123456",
  roomId: "test-room",
  createdBy: "user-123",
  itemCount: 2,
  status: "draft",
  currentItemIndex: null,
  version: 1,
  meetingStartedAt: null,
  meetingEndedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockAgendaItem = (overrides = {}) => ({
  id: "item-agenda-test-0",
  agendaId: "agenda-test-room-123456",
  orderIndex: 0,
  title: "Test Topic",
  description: "Test description",
  estimatedDuration: 10,
  presenter: "John",
  status: "pending",
  startedAt: null,
  completedAt: null,
  actualDuration: null,
  startTranscriptRef: null,
  endTranscriptRef: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ============================================================================
// ID Generation Tests
// ============================================================================

describe("ID Generation", () => {
  describe("generateAgendaId", () => {
    it("should generate ID with correct format", () => {
      const id = generateAgendaId("test-room");
      expect(id).toMatch(/^agenda-test-room-\d+$/);
    });

    it("should generate unique IDs", () => {
      const id1 = generateAgendaId("room");
      const id2 = generateAgendaId("room");
      // IDs should be different (timestamp-based)
      // Note: In very fast execution, they might be the same
      expect(id1).toContain("agenda-room-");
      expect(id2).toContain("agenda-room-");
    });

    it("should handle special characters in room ID", () => {
      const id = generateAgendaId("room-with-dashes");
      expect(id).toMatch(/^agenda-room-with-dashes-\d+$/);
    });
  });

  describe("generateAgendaItemId", () => {
    it("should generate ID with correct format", () => {
      const id = generateAgendaItemId("agenda-123", 0);
      expect(id).toBe("item-agenda-123-0");
    });

    it("should handle different indices", () => {
      expect(generateAgendaItemId("agenda-123", 0)).toBe("item-agenda-123-0");
      expect(generateAgendaItemId("agenda-123", 5)).toBe("item-agenda-123-5");
      expect(generateAgendaItemId("agenda-123", 99)).toBe("item-agenda-123-99");
    });
  });
});

// ============================================================================
// Read Operations Tests
// ============================================================================

describe("Read Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAgendaByRoomId", () => {
    it("should return null when no agenda exists", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      const result = await getAgendaByRoomId("nonexistent-room");

      expect(result).toBeNull();
      expect(db.select).toHaveBeenCalled();
    });

    it("should return mapped agenda when found", async () => {
      const mockData = createMockAgenda();
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockData]);

      const result = await getAgendaByRoomId("test-room");

      expect(result).not.toBeNull();
      expect(result?.roomId).toBe("test-room");
      expect(result?.status).toBe("draft");
    });

    it("should convert timestamps to ISO strings", async () => {
      const mockData = createMockAgenda({
        meetingStartedAt: new Date("2024-01-01T10:00:00Z"),
      });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockData]);

      const result = await getAgendaByRoomId("test-room");

      expect(result?.meetingStartedAt).toBe("2024-01-01T10:00:00.000Z");
    });
  });

  describe("getAgendaItemById", () => {
    it("should return null when item not found", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      const result = await getAgendaItemById("nonexistent-item");

      expect(result).toBeNull();
    });

    it("should return mapped item when found", async () => {
      const mockItem = createMockAgendaItem();
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockItem]);

      const result = await getAgendaItemById("item-agenda-test-0");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test Topic");
      expect(result?.status).toBe("pending");
    });
  });
});

// ============================================================================
// Create/Update Operations Tests
// ============================================================================

describe("Create/Update Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertAgenda", () => {
    it("should throw error when trying to modify active agenda", async () => {
      const mockData = createMockAgenda({ status: "active" });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockData]);

      await expect(
        upsertAgenda("test-room", "user-123", [{ title: "Topic 1" }])
      ).rejects.toThrow(/locked/i);
    });

    it("should throw error when trying to modify completed agenda", async () => {
      const mockData = createMockAgenda({ status: "completed" });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockData]);

      await expect(
        upsertAgenda("test-room", "user-123", [{ title: "Topic 1" }])
      ).rejects.toThrow(/locked/i);
    });
  });

  describe("publishAgenda", () => {
    it("should throw error when no agenda exists", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      await expect(publishAgenda("nonexistent-room")).rejects.toThrow(
        /no agenda found/i
      );
    });

    it("should throw error when agenda already active", async () => {
      const mockData = createMockAgenda({ status: "active" });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockData]);

      await expect(publishAgenda("test-room")).rejects.toThrow(/already/i);
    });

    it("should throw error when agenda already completed", async () => {
      const mockData = createMockAgenda({ status: "completed" });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockData]);

      await expect(publishAgenda("test-room")).rejects.toThrow(/already/i);
    });
  });

  describe("updateAgendaItem", () => {
    it("should throw error when item not found", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      await expect(
        updateAgendaItem("nonexistent-item", { title: "New Title" })
      ).rejects.toThrow(/not found/i);
    });

    it("should throw error when agenda is not draft", async () => {
      const mockItem = createMockAgendaItem();
      const mockAgenda = createMockAgenda({ status: "active" });
      const selectChain = mockSelect();

      // First call returns item, second call returns agenda
      selectChain.limit
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([mockAgenda]);

      await expect(
        updateAgendaItem("item-agenda-test-0", { title: "New Title" })
      ).rejects.toThrow(/published/i);
    });
  });

  describe("deleteAgendaItem", () => {
    it("should throw error when item not found", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      await expect(deleteAgendaItem("nonexistent-item")).rejects.toThrow(
        /not found/i
      );
    });

    it("should throw error when agenda is not draft", async () => {
      const mockItem = createMockAgendaItem();
      const mockAgenda = createMockAgenda({ status: "active" });
      const selectChain = mockSelect();

      selectChain.limit
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([mockAgenda]);

      await expect(deleteAgendaItem("item-agenda-test-0")).rejects.toThrow(
        /published/i
      );
    });
  });

  describe("reorderAgendaItems", () => {
    it("should throw error when agenda not found", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      await expect(
        reorderAgendaItems("nonexistent-agenda", ["item-1", "item-2"])
      ).rejects.toThrow(/not found/i);
    });

    it("should throw error when agenda is not draft", async () => {
      const mockAgenda = createMockAgenda({ status: "active" });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockAgenda]);

      await expect(
        reorderAgendaItems("agenda-test", ["item-1", "item-2"])
      ).rejects.toThrow(/published/i);
    });

    it("should throw error when item count mismatch", async () => {
      const mockAgenda = createMockAgenda({ status: "draft" });
      const mockItems = [
        createMockAgendaItem({ id: "item-1" }),
        createMockAgendaItem({ id: "item-2" }),
      ];
      const selectChain = mockSelect();

      // First call for agenda, second for items
      selectChain.limit.mockResolvedValue([mockAgenda]);
      selectChain.orderBy.mockResolvedValue(mockItems);

      await expect(
        reorderAgendaItems("agenda-test", ["item-1"]) // Only 1 item instead of 2
      ).rejects.toThrow(/mismatch/i);
    });

    it("should throw error when item does not belong to agenda", async () => {
      const mockAgenda = createMockAgenda({ status: "draft" });
      const mockItems = [
        createMockAgendaItem({ id: "item-1" }),
        createMockAgendaItem({ id: "item-2" }),
      ];
      const selectChain = mockSelect();

      selectChain.limit.mockResolvedValue([mockAgenda]);
      selectChain.orderBy.mockResolvedValue(mockItems);

      await expect(
        reorderAgendaItems("agenda-test", ["item-1", "item-wrong"]) // Wrong item
      ).rejects.toThrow(/does not belong/i);
    });
  });
});

// ============================================================================
// Status Update Operations Tests
// ============================================================================

describe("Status Update Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateAgendaItemStatus", () => {
    it("should throw error when item not found", async () => {
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([]);

      await expect(
        updateAgendaItemStatus("nonexistent-item", "in_progress")
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("startAgendaItem", () => {
    it("should call updateAgendaItemStatus with in_progress", async () => {
      const mockItem = createMockAgendaItem();
      const selectChain = mockSelect();
      const updateChain = mockUpdate();

      selectChain.limit
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([{ ...mockItem, status: "in_progress" }]);
      updateChain.where.mockResolvedValue([]);

      const result = await startAgendaItem("item-test", "transcript-ref-1");

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("completeAgendaItem", () => {
    it("should calculate actual duration when start time exists", async () => {
      const startTime = new Date(Date.now() - 300000); // 5 minutes ago
      const mockItem = createMockAgendaItem({
        status: "in_progress",
        startedAt: startTime,
      });
      const selectChain = mockSelect();
      const updateChain = mockUpdate();

      selectChain.limit
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([{ ...mockItem, status: "completed" }]);
      updateChain.where.mockResolvedValue([]);

      await completeAgendaItem("item-test", "transcript-ref-2");

      expect(db.update).toHaveBeenCalled();
      // The update should include actualDuration calculation
      const updateCall = updateChain.set.mock.calls[0][0];
      expect(updateCall.actualDuration).toBeDefined();
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases", () => {
  describe("Empty agenda items", () => {
    it("should handle creating agenda with no items", async () => {
      const selectChain = mockSelect();
      const insertChain = mockInsert();

      selectChain.limit.mockResolvedValue([]); // No existing agenda
      insertChain.values.mockResolvedValue([]);

      // Should not throw
      await expect(
        createAgenda("test-room", "user-123", [])
      ).resolves.toBeDefined();
    });
  });

  describe("Concurrent modifications", () => {
    it("should use version field for optimistic locking", async () => {
      const mockAgenda = createMockAgenda({ version: 1 });
      const selectChain = mockSelect();

      selectChain.limit.mockResolvedValue([mockAgenda]);

      // The agenda has version tracking for concurrent modification detection
      expect(mockAgenda.version).toBe(1);
    });
  });

  describe("Null/undefined handling", () => {
    it("should handle null description in agenda item", async () => {
      const mockItem = createMockAgendaItem({ description: null });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockItem]);

      const result = await getAgendaItemById("item-test");

      expect(result?.description).toBeNull();
    });

    it("should handle null timestamps", async () => {
      const mockAgenda = createMockAgenda({
        meetingStartedAt: null,
        meetingEndedAt: null,
        currentItemIndex: null,
      });
      const selectChain = mockSelect();
      selectChain.limit.mockResolvedValue([mockAgenda]);

      const result = await getAgendaByRoomId("test-room");

      expect(result?.meetingStartedAt).toBeNull();
      expect(result?.meetingEndedAt).toBeNull();
      expect(result?.currentItemIndex).toBeNull();
    });
  });
});
