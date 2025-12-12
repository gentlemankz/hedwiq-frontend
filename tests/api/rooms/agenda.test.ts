/**
 * Tests for Agenda API Routes
 *
 * Tests all agenda-related API endpoints including:
 * - GET/PUT /api/rooms/[roomId]/agenda
 * - POST /api/rooms/[roomId]/agenda/publish
 * - POST /api/rooms/[roomId]/agenda/reorder
 * - PATCH/DELETE /api/rooms/[roomId]/agenda/items/[itemId]
 * - POST /api/rooms/[roomId]/agenda/items/[itemId]/status
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ============================================================================
// Mocks
// ============================================================================

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock room access validation
vi.mock("@/lib/db/room-access", () => ({
  validateRoomAccess: vi.fn(),
}));

// Mock agenda database operations
vi.mock("@/lib/db/agenda", () => ({
  getAgendaWithItems: vi.fn(),
  getAgendaByRoomId: vi.fn(),
  getAgendaItemById: vi.fn(),
  upsertAgenda: vi.fn(),
  publishAgenda: vi.fn(),
  reorderAgendaItems: vi.fn(),
  updateAgendaItem: vi.fn(),
  deleteAgendaItem: vi.fn(),
  updateAgendaItemStatus: vi.fn(),
}));

// Import mocked modules
import { auth } from "@/lib/auth";
import { validateRoomAccess } from "@/lib/db/room-access";
import * as agendaDb from "@/lib/db/agenda";

// Import route handlers
import { GET, PUT } from "@/app/api/rooms/[roomId]/agenda/route";
import { POST as publishPost } from "@/app/api/rooms/[roomId]/agenda/publish/route";
import { POST as reorderPost } from "@/app/api/rooms/[roomId]/agenda/reorder/route";
import {
  PATCH as itemPatch,
  DELETE as itemDelete,
} from "@/app/api/rooms/[roomId]/agenda/items/[itemId]/route";
import { POST as statusPost } from "@/app/api/rooms/[roomId]/agenda/items/[itemId]/status/route";

// ============================================================================
// Test Helpers
// ============================================================================

const createMockRequest = (body?: unknown): NextRequest => {
  const req = new NextRequest("http://localhost:3000/api/test", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
  return req;
};

const mockSession = (userId = "user-123") => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: userId, email: "test@example.com", name: "Test User", emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    session: { id: "session-1", userId, token: "token", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  });
};

const mockNoSession = () => {
  vi.mocked(auth.api.getSession).mockResolvedValue(null);
};

const mockRoomAccess = (hasAccess = true) => {
  (validateRoomAccess as ReturnType<typeof vi.fn>).mockResolvedValue(
    hasAccess ? null : "You do not have access to this room's documents"
  );
};

const createMockAgenda = (overrides = {}) => ({
  id: "agenda-test-room-123456",
  roomId: "test-room",
  createdBy: "user-123",
  itemCount: 2,
  status: "draft",
  currentItemIndex: null,
  version: 1,
  items: [
    {
      id: "item-1",
      agendaId: "agenda-test-room-123456",
      title: "Topic 1",
      orderIndex: 0,
      status: "pending",
    },
    {
      id: "item-2",
      agendaId: "agenda-test-room-123456",
      title: "Topic 2",
      orderIndex: 1,
      status: "pending",
    },
  ],
  ...overrides,
});

// ============================================================================
// GET /api/rooms/[roomId]/agenda Tests
// ============================================================================

describe("GET /api/rooms/[roomId]/agenda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await GET(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid room ID", async () => {
    mockSession();

    const response = await GET(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "" }) }
    );

    expect(response.status).toBe(400);
  });

  it("should return 403 when user lacks room access", async () => {
    mockSession();
    mockRoomAccess(false);

    const response = await GET(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(403);
  });

  it("should return null agenda when none exists", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaWithItems as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await GET(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.agenda).toBeNull();
  });

  it("should return agenda with items when exists", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda();
    (agendaDb.getAgendaWithItems as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);

    const response = await GET(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.agenda).toEqual(mockAgenda);
  });
});

// ============================================================================
// PUT /api/rooms/[roomId]/agenda Tests
// ============================================================================

describe("PUT /api/rooms/[roomId]/agenda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await PUT(
      createMockRequest({ items: [] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(401);
  });

  it("should return 400 for invalid JSON body", async () => {
    mockSession();
    mockRoomAccess(true);

    const req = new NextRequest("http://localhost:3000/api/test", {
      method: "PUT",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PUT(
      req,
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("Invalid JSON");
  });

  it("should return 400 when items is not an array", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({ items: "not an array" }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("must be an array");
  });

  it("should return 400 when exceeding max items", async () => {
    mockSession();
    mockRoomAccess(true);

    const items = Array.from({ length: 25 }, (_, i) => ({
      title: `Topic ${i + 1}`,
    }));

    const response = await PUT(
      createMockRequest({ items }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("Maximum");
  });

  it("should return 400 when item title is missing", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({ items: [{ description: "No title" }] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("title is required");
  });

  it("should return 400 when item title is empty", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({ items: [{ title: "   " }] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("title is required");
  });

  it("should return 400 when item title exceeds max length", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({ items: [{ title: "a".repeat(101) }] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("100 characters");
  });

  it("should return 400 when description exceeds max length", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({
        items: [{ title: "Valid Title", description: "a".repeat(501) }],
      }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("500 characters");
  });

  it("should return 400 when estimatedDuration is invalid", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({
        items: [{ title: "Valid Title", estimatedDuration: 0 }],
      }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("between 1 and 120");
  });

  it("should return 400 when estimatedDuration exceeds max", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await PUT(
      createMockRequest({
        items: [{ title: "Valid Title", estimatedDuration: 150 }],
      }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("between 1 and 120");
  });

  it("should return 409 when agenda is locked (active)", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.upsertAgenda as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Cannot modify agenda in active status. Agenda is locked.")
    );

    const response = await PUT(
      createMockRequest({ items: [{ title: "Topic 1" }] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(409);
  });

  it("should create/update agenda successfully", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda();
    (agendaDb.upsertAgenda as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);

    const response = await PUT(
      createMockRequest({ items: [{ title: "Topic 1" }, { title: "Topic 2" }] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.agenda).toEqual(mockAgenda);
  });

  it("should accept valid optional fields", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda();
    (agendaDb.upsertAgenda as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);

    const response = await PUT(
      createMockRequest({
        items: [
          {
            title: "Topic 1",
            description: "A valid description",
            estimatedDuration: 30,
            presenter: "John Doe",
          },
        ],
      }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(200);
  });
});

// ============================================================================
// POST /api/rooms/[roomId]/agenda/publish Tests
// ============================================================================

describe("POST /api/rooms/[roomId]/agenda/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await publishPost(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(401);
  });

  it("should return 404 when no agenda exists", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.publishAgenda as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("No agenda found for this room")
    );

    const response = await publishPost(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(404);
  });

  it("should return 409 when agenda already active", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.publishAgenda as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Agenda is already active")
    );

    const response = await publishPost(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(409);
  });

  it("should publish agenda successfully", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda({ status: "active" });
    (agendaDb.publishAgenda as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);

    const response = await publishPost(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.agenda.status).toBe("active");
  });
});

// ============================================================================
// POST /api/rooms/[roomId]/agenda/reorder Tests
// ============================================================================

describe("POST /api/rooms/[roomId]/agenda/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await reorderPost(
      createMockRequest({ itemIds: ["item-1", "item-2"] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(401);
  });

  it("should return 400 when itemIds is not an array", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await reorderPost(
      createMockRequest({ itemIds: "not-an-array" }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
  });

  it("should return 400 when itemIds is empty", async () => {
    mockSession();
    mockRoomAccess(true);

    const response = await reorderPost(
      createMockRequest({ itemIds: [] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(400);
  });

  it("should return 404 when agenda not found", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await reorderPost(
      createMockRequest({ itemIds: ["item-1", "item-2"] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(404);
  });

  it("should return 409 when agenda is not draft", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockAgenda({ status: "draft" })
    );
    (agendaDb.reorderAgendaItems as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Cannot reorder items in a published agenda")
    );

    const response = await reorderPost(
      createMockRequest({ itemIds: ["item-1", "item-2"] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(409);
  });

  it("should reorder items successfully", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda();
    const reorderedItems = [mockAgenda.items[1], mockAgenda.items[0]];
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);
    (agendaDb.reorderAgendaItems as ReturnType<typeof vi.fn>).mockResolvedValue(reorderedItems);

    const response = await reorderPost(
      createMockRequest({ itemIds: ["item-2", "item-1"] }),
      { params: Promise.resolve({ roomId: "test-room" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items).toEqual(reorderedItems);
  });
});

// ============================================================================
// PATCH /api/rooms/[roomId]/agenda/items/[itemId] Tests
// ============================================================================

describe("PATCH /api/rooms/[roomId]/agenda/items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await itemPatch(
      createMockRequest({ title: "New Title" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("should return 404 when agenda not found", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await itemPatch(
      createMockRequest({ title: "New Title" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 when item not found", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(createMockAgenda());
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await itemPatch(
      createMockRequest({ title: "New Title" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "nonexistent" }) }
    );

    expect(response.status).toBe(404);
  });

  it("should return 400 for invalid title", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(createMockAgenda());
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-1",
      agendaId: "agenda-test-room-123456",
    });

    const response = await itemPatch(
      createMockRequest({ title: "" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(400);
  });

  it("should update item successfully", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda();
    const updatedItem = { ...mockAgenda.items[0], title: "Updated Title" };
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda.items[0]);
    (agendaDb.updateAgendaItem as ReturnType<typeof vi.fn>).mockResolvedValue(updatedItem);

    const response = await itemPatch(
      createMockRequest({ title: "Updated Title" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.item.title).toBe("Updated Title");
  });
});

// ============================================================================
// DELETE /api/rooms/[roomId]/agenda/items/[itemId] Tests
// ============================================================================

describe("DELETE /api/rooms/[roomId]/agenda/items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await itemDelete(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("should return 404 when item not found", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(createMockAgenda());
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await itemDelete(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room", itemId: "nonexistent" }) }
    );

    expect(response.status).toBe(404);
  });

  it("should delete item successfully", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda();
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda.items[0]);
    (agendaDb.deleteAgendaItem as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const response = await itemDelete(
      createMockRequest(),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });
});

// ============================================================================
// POST /api/rooms/[roomId]/agenda/items/[itemId]/status Tests
// ============================================================================

describe("POST /api/rooms/[roomId]/agenda/items/[itemId]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockNoSession();

    const response = await statusPost(
      createMockRequest({ status: "in_progress" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("should return 400 for invalid status", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockAgenda({ status: "active" })
    );
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-1",
      agendaId: "agenda-test-room-123456",
    });

    const response = await statusPost(
      createMockRequest({ status: "invalid_status" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("must be one of");
  });

  it("should return 400 for pending status (not allowed)", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockAgenda({ status: "active" })
    );
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-1",
      agendaId: "agenda-test-room-123456",
    });

    const response = await statusPost(
      createMockRequest({ status: "pending" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(400);
  });

  it("should return 409 when agenda is not active", async () => {
    mockSession();
    mockRoomAccess(true);
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockAgenda({ status: "draft" })
    );

    const response = await statusPost(
      createMockRequest({ status: "in_progress" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toContain("active");
  });

  it("should update status successfully", async () => {
    mockSession();
    mockRoomAccess(true);
    const mockAgenda = createMockAgenda({ status: "active" });
    const updatedItem = { ...mockAgenda.items[0], status: "completed" };
    (agendaDb.getAgendaByRoomId as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda);
    (agendaDb.getAgendaItemById as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgenda.items[0]);
    (agendaDb.updateAgendaItemStatus as ReturnType<typeof vi.fn>).mockResolvedValue(updatedItem);

    const response = await statusPost(
      createMockRequest({ status: "completed" }),
      { params: Promise.resolve({ roomId: "test-room", itemId: "item-1" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.item.status).toBe("completed");
  });
});
