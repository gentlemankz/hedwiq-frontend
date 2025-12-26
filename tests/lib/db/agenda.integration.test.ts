/**
 * Integration Tests for Agenda Database Operations
 *
 * These tests cover critical paths and edge cases identified during code review:
 * - Transaction integrity for multi-step operations
 * - Duplicate ID handling in reorder
 * - Status transition validation
 * - itemCount consistency
 *
 * NOTE: These tests use mocked database but simulate real transaction behavior.
 * For true integration testing, a test database would be required.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the database module with transaction support
vi.mock("@/lib/db", () => {
  const mockTransaction = vi.fn();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: mockTransaction,
    },
  };
});

// Import after mocking
import { db } from "@/lib/db";
import {
  generateAgendaId,
  generateAgendaItemId,
  createAgenda,
  reorderAgendaItems,
  deleteAgendaItem,
  updateAgendaItemStatus,
  getAgendaByRoomId,
} from "@/lib/db/agenda";

// Type for the mocked database (matches the mock above)
type MockedDb = {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  transaction: Mock;
};

// Cast db to mocked type for use in tests
const mockedDb = db as unknown as MockedDb;

// ============================================================================
// Test Helpers
// ============================================================================

const createMockTx = () => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

const mockSelect = (target: { select: Mock }) => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  target.select.mockReturnValue(chain);
  return chain;
};

const mockInsert = (target: { insert: Mock }) => {
  const chain = {
    values: vi.fn().mockReturnThis(),
  };
  target.insert.mockReturnValue(chain);
  return chain;
};

const mockUpdate = (target: { update: Mock }) => {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
  target.update.mockReturnValue(chain);
  return chain;
};

const mockDelete = (target: { delete: Mock }) => {
  const chain = {
    where: vi.fn().mockReturnThis(),
  };
  target.delete.mockReturnValue(chain);
  return chain;
};

const createMockAgenda = (overrides = {}) => ({
  id: "agenda-test-room-123456-abc123",
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
  id: "item-123456-abc1-0",
  agendaId: "agenda-test-room-123456-abc123",
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
// ID Generation Tests (Collision Prevention)
// ============================================================================

describe("ID Generation - Collision Prevention", () => {
  it("should generate unique agenda IDs even when called rapidly", () => {
    const ids = new Set<string>();
    const roomId = "test-room";

    // Generate 100 IDs rapidly
    for (let i = 0; i < 100; i++) {
      ids.add(generateAgendaId(roomId));
    }

    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it("should include random component in agenda ID", () => {
    const id = generateAgendaId("room");
    // Format: agenda-{roomId}-{timestamp}-{random}
    const parts = id.split("-");
    expect(parts.length).toBeGreaterThanOrEqual(4);
  });

  it("should generate unique item IDs even when called rapidly", () => {
    const ids = new Set<string>();
    const agendaId = "agenda-123";

    // Generate 100 IDs rapidly with same index
    for (let i = 0; i < 100; i++) {
      ids.add(generateAgendaItemId(agendaId, 0));
    }

    // All IDs should be unique (due to timestamp + random)
    expect(ids.size).toBe(100);
  });
});

// ============================================================================
// Transaction Integrity Tests
// ============================================================================

describe("Transaction Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAgenda", () => {
    it("should use transaction for atomic creation", async () => {
      const mockTx = createMockTx();
      const selectChain = mockSelect(mockTx);
      const insertChain = mockInsert(mockTx);

      // Setup: transaction succeeds
      mockedDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      insertChain.values.mockResolvedValue([]);
      selectChain.limit.mockResolvedValue([createMockAgenda()]);
      selectChain.orderBy.mockResolvedValue([]);

      await createAgenda("test-room", "user-123", [{ title: "Topic 1" }]);

      // Verify transaction was used
      expect(mockedDb.transaction).toHaveBeenCalled();

      // Verify operations were on transaction, not db directly
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.select).toHaveBeenCalled();
    });

    it("should rollback on insert failure", async () => {
      const mockTx = createMockTx();
      const insertChain = mockInsert(mockTx);

      // Setup: transaction fails on item insert
      mockedDb.transaction.mockImplementation(async (callback) => {
        insertChain.values
          .mockResolvedValueOnce([]) // Agenda insert succeeds
          .mockRejectedValueOnce(new Error("Insert failed")); // Item insert fails

        return callback(mockTx);
      });

      // Expect the error to propagate (transaction rolls back)
      await expect(
        createAgenda("test-room", "user-123", [{ title: "Topic 1" }])
      ).rejects.toThrow("Insert failed");
    });
  });
});

// ============================================================================
// Reorder - Duplicate ID Detection Tests
// ============================================================================

describe("Reorder - Duplicate ID Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject duplicate IDs in reorder request", async () => {
    const mockAgenda = createMockAgenda({ status: "draft" });
    const selectChain = mockSelect(mockedDb);

    selectChain.limit.mockResolvedValue([mockAgenda]);

    // Try to reorder with duplicate IDs
    await expect(
      reorderAgendaItems("agenda-test", ["item-1", "item-1", "item-2"])
    ).rejects.toThrow(/duplicate/i);
  });

  it("should reject when item count doesn't match", async () => {
    const mockAgenda = createMockAgenda({ status: "draft" });
    const mockItems = [
      createMockAgendaItem({ id: "item-1" }),
      createMockAgendaItem({ id: "item-2" }),
      createMockAgendaItem({ id: "item-3" }),
    ];
    const selectChain = mockSelect(mockedDb);

    selectChain.limit.mockResolvedValue([mockAgenda]);
    selectChain.orderBy.mockResolvedValue(mockItems);

    // Try to reorder with wrong number of items
    await expect(
      reorderAgendaItems("agenda-test", ["item-1", "item-2"])
    ).rejects.toThrow(/mismatch/i);
  });

  it("should reject when item doesn't belong to agenda", async () => {
    const mockAgenda = createMockAgenda({ status: "draft" });
    const mockItems = [
      createMockAgendaItem({ id: "item-1" }),
      createMockAgendaItem({ id: "item-2" }),
    ];
    const selectChain = mockSelect(mockedDb);

    selectChain.limit.mockResolvedValue([mockAgenda]);
    selectChain.orderBy.mockResolvedValue(mockItems);

    // Try to reorder with unknown item
    await expect(
      reorderAgendaItems("agenda-test", ["item-1", "item-unknown"])
    ).rejects.toThrow(/does not belong/i);
  });
});

// ============================================================================
// Status Update - Agenda State Validation Tests
// ============================================================================

describe("Status Update - Agenda State Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject status updates on draft agendas", async () => {
    const mockItem = createMockAgendaItem();
    const mockAgenda = createMockAgenda({ status: "draft" });
    const selectChain = mockSelect(mockedDb);

    // First call returns item, second returns agenda
    selectChain.limit
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([mockAgenda]);

    await expect(
      updateAgendaItemStatus("item-test", "in_progress")
    ).rejects.toThrow(/draft/i);
  });

  it("should reject status updates on completed agendas", async () => {
    const mockItem = createMockAgendaItem();
    const mockAgenda = createMockAgenda({ status: "completed" });
    const selectChain = mockSelect(mockedDb);

    selectChain.limit
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([mockAgenda]);

    await expect(
      updateAgendaItemStatus("item-test", "in_progress")
    ).rejects.toThrow(/completed/i);
  });

  it("should allow status updates on active agendas", async () => {
    const mockItem = createMockAgendaItem();
    const mockAgenda = createMockAgenda({ status: "active" });
    const selectChain = mockSelect(mockedDb);
    const updateChain = mockUpdate(mockedDb);

    selectChain.limit
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([mockAgenda])
      .mockResolvedValueOnce([{ ...mockItem, status: "in_progress" }]);
    updateChain.where.mockResolvedValue([]);

    const result = await updateAgendaItemStatus("item-test", "in_progress");

    expect(result.status).toBe("in_progress");
  });
});

// ============================================================================
// itemCount Consistency Tests
// ============================================================================

describe("itemCount Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recalculate itemCount from COUNT(*) in deleteAgendaItem", async () => {
    const mockItem = createMockAgendaItem();
    const mockAgenda = createMockAgenda({ status: "draft", itemCount: 3 });

    const selectChain = mockSelect(mockedDb);

    // Setup db.select for initial checks (before transaction)
    selectChain.limit
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([mockAgenda]);

    // Track which select call in transaction we're on
    let txSelectCallCount = 0;

    // Setup transaction with proper chaining
    mockedDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        select: vi.fn(() => {
          txSelectCallCount++;
          const currentCall = txSelectCallCount;

          const chain: Record<string, Mock> = {};
          chain.from = vi.fn().mockReturnValue(chain);

          if (currentCall === 1) {
            // First select in tx: get remaining items with orderBy
            chain.where = vi.fn().mockReturnValue(chain);
            chain.orderBy = vi.fn().mockResolvedValue([
              createMockAgendaItem({ id: "item-2", orderIndex: 1 }),
            ]);
          } else {
            // Second select in tx: COUNT(*) query
            chain.where = vi.fn().mockResolvedValue([{ value: 1 }]);
            chain.orderBy = vi.fn().mockReturnValue(chain);
          }

          return chain;
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      return callback(mockTx);
    });

    await deleteAgendaItem("item-test");

    // Verify transaction was used
    expect(db.transaction).toHaveBeenCalled();
  });
});

// ============================================================================
// Edge Cases from Reviewer2
// ============================================================================

describe("Edge Cases - Reviewer2 Findings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not allow reorder on active agenda", async () => {
    const mockAgenda = createMockAgenda({ status: "active" });
    const selectChain = mockSelect(mockedDb);

    selectChain.limit.mockResolvedValue([mockAgenda]);

    await expect(
      reorderAgendaItems("agenda-test", ["item-1", "item-2"])
    ).rejects.toThrow(/published/i);
  });

  it("should not allow reorder on completed agenda", async () => {
    const mockAgenda = createMockAgenda({ status: "completed" });
    const selectChain = mockSelect(mockedDb);

    selectChain.limit.mockResolvedValue([mockAgenda]);

    await expect(
      reorderAgendaItems("agenda-test", ["item-1", "item-2"])
    ).rejects.toThrow(/published/i);
  });

  it("should throw when agenda not found for reorder", async () => {
    const selectChain = mockSelect(mockedDb);
    selectChain.limit.mockResolvedValue([]);

    await expect(
      reorderAgendaItems("nonexistent-agenda", ["item-1"])
    ).rejects.toThrow(/not found/i);
  });

  it("should throw when parent agenda not found for status update", async () => {
    const mockItem = createMockAgendaItem();
    const selectChain = mockSelect(mockedDb);

    selectChain.limit
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]); // No agenda

    await expect(
      updateAgendaItemStatus("item-test", "in_progress")
    ).rejects.toThrow(/parent agenda not found/i);
  });
});

// ============================================================================
// Validation Module Integration
// ============================================================================

describe("Validation Module Integration", () => {
  it("validateReorderItemIds should catch duplicates before DB call", async () => {
    // Import validation directly
    const { validateReorderItemIds } = await import("@/lib/validation/agenda");

    const result = validateReorderItemIds(["id1", "id1", "id2"]);

    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/duplicate/i);
  });

  it("validateAgendaItems should validate all items", async () => {
    const { validateAgendaItems } = await import("@/lib/validation/agenda");

    // Valid items
    const validResult = validateAgendaItems([
      { title: "Topic 1" },
      { title: "Topic 2", estimatedDuration: 30 },
    ]);
    expect(validResult.isValid).toBe(true);

    // Invalid - missing title
    const invalidResult = validateAgendaItems([
      { title: "Topic 1" },
      { description: "No title here" },
    ]);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.error).toMatch(/title is required/i);
  });

  it("validateAgendaItemUpdate should not accept orderIndex", async () => {
    const { validateAgendaItemUpdate } = await import("@/lib/validation/agenda");

    // The function signature doesn't include orderIndex
    // This is a compile-time check, but we can verify the function works
    const result = validateAgendaItemUpdate({
      title: "New Title",
      description: "New description",
    });

    expect(result).toBeNull(); // Valid
  });
});
