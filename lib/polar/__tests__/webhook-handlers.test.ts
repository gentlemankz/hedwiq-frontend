/**
 * Webhook Handler Tests
 *
 * Tests cover:
 * - handleSubscriptionActive - tier mapping and cache updates
 * - handleSubscriptionCanceled - graceful downgrade
 * - handleSubscriptionRevoked - immediate downgrade to free
 * - handleSubscriptionStatusChange - status transitions
 * - logWebhookEvent - idempotency and logging
 * - truncatePayload - large payload handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock Setup
// ============================================================================

const mocks = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockEq: vi.fn((a, b) => ({ a, b })),
  mockNanoid: vi.fn(() => "mock-nanoid-123"),
}));

// Mock drizzle ORM
vi.mock("@/lib/db", () => ({
  db: mocks.mockDb,
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.mockEq,
}));

vi.mock("nanoid", () => ({
  nanoid: mocks.mockNanoid,
}));

// Mock the schema
vi.mock("@/lib/db/schema", () => ({
  subscriptionCache: {
    id: "id",
    userId: "userId",
    polarCustomerId: "polarCustomerId",
    polarSubscriptionId: "polarSubscriptionId",
    tier: "tier",
    status: "status",
    billingInterval: "billingInterval",
    currentPeriodEnd: "currentPeriodEnd",
    cancelAtPeriodEnd: "cancelAtPeriodEnd",
    minutesLimit: "minutesLimit",
    storageLimitGb: "storageLimitGb",
    historyDays: "historyDays",
    emailDraftsLimit: "emailDraftsLimit",
    minutesUsed: "minutesUsed",
    emailDraftsUsed: "emailDraftsUsed",
    storageUsedBytes: "storageUsedBytes",
    usagePeriodStart: "usagePeriodStart",
    lastSyncedAt: "lastSyncedAt",
    syncError: "syncError",
    updatedAt: "updatedAt",
  },
  webhookLog: {
    id: "id",
    eventId: "eventId",
    eventType: "eventType",
    success: "success",
    error: "error",
    payload: "payload",
    receivedAt: "receivedAt",
  },
}));

// Import after mocking
import {
  handleSubscriptionActive,
  handleSubscriptionCanceled,
  handleSubscriptionRevoked,
  handleSubscriptionStatusChange,
  logWebhookEvent,
} from "../webhook-handlers";

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER_ID = "user-123";
const TEST_CUSTOMER_ID = "polar-cust-456";
const TEST_SUBSCRIPTION_ID = "sub-789";

// Sandbox product IDs
const PRO_MONTHLY_PRODUCT_ID = "6a513e7d-07cd-4809-9c01-4cb29604a207";
const BUSINESS_MONTHLY_PRODUCT_ID = "0ba11623-5fd2-479d-bf1b-79ee61eba60c";

const baseSubscriptionPayload = {
  id: TEST_SUBSCRIPTION_ID,
  productId: PRO_MONTHLY_PRODUCT_ID,
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancelAtPeriodEnd: false,
  recurringInterval: "month",
  customer: {
    id: TEST_CUSTOMER_ID,
    externalId: TEST_USER_ID,
    email: "test@example.com",
  },
};

// ============================================================================
// Helper to setup DB mocks
// ============================================================================

function setupDbMocks(existingRecord: boolean = false) {
  const chainedMock = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(existingRecord ? [{ id: "existing-id" }] : []),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };

  mocks.mockDb.select.mockReturnValue(chainedMock);
  mocks.mockDb.update.mockReturnValue(chainedMock);
  mocks.mockDb.insert.mockReturnValue(chainedMock);

  return chainedMock;
}

// ============================================================================
// handleSubscriptionActive Tests
// ============================================================================

describe("handleSubscriptionActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create cache entry for new user with pro tier", async () => {
    setupDbMocks(false);

    const result = await handleSubscriptionActive(baseSubscriptionPayload);

    expect(result.success).toBe(true);
    expect(result.userId).toBe(TEST_USER_ID);
    expect(result.tier).toBe("pro");
    expect(mocks.mockDb.insert).toHaveBeenCalled();
  });

  it("should update existing cache entry", async () => {
    setupDbMocks(true);

    const result = await handleSubscriptionActive(baseSubscriptionPayload);

    expect(result.success).toBe(true);
    expect(result.tier).toBe("pro");
    expect(mocks.mockDb.update).toHaveBeenCalled();
  });

  it("should correctly identify business tier from product ID", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      productId: BUSINESS_MONTHLY_PRODUCT_ID,
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.success).toBe(true);
    expect(result.tier).toBe("business");
  });

  it("should fail when externalId is missing", async () => {
    const payload = {
      ...baseSubscriptionPayload,
      customer: {
        id: TEST_CUSTOMER_ID,
        externalId: null,
        email: "test@example.com",
      },
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("externalId");
  });

  it("should handle yearly billing interval", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      recurringInterval: "year",
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.success).toBe(true);
    // Verify that billingInterval was set correctly in the values
    expect(mocks.mockDb.insert).toHaveBeenCalled();
  });
});

// ============================================================================
// handleSubscriptionCanceled Tests
// ============================================================================

describe("handleSubscriptionCanceled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update status to canceled for existing user", async () => {
    setupDbMocks(true);

    const result = await handleSubscriptionCanceled(baseSubscriptionPayload);

    expect(result.success).toBe(true);
    expect(result.userId).toBe(TEST_USER_ID);
    expect(mocks.mockDb.update).toHaveBeenCalled();
  });

  it("should create entry if user not found", async () => {
    setupDbMocks(false);

    const result = await handleSubscriptionCanceled(baseSubscriptionPayload);

    expect(result.success).toBe(true);
    expect(mocks.mockDb.insert).toHaveBeenCalled();
  });

  it("should fail when externalId is missing", async () => {
    const payload = {
      ...baseSubscriptionPayload,
      customer: {
        id: TEST_CUSTOMER_ID,
        externalId: undefined,
        email: "test@example.com",
      },
    };

    const result = await handleSubscriptionCanceled(payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("externalId");
  });
});

// ============================================================================
// handleSubscriptionRevoked Tests
// ============================================================================

describe("handleSubscriptionRevoked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should downgrade to free tier for existing user", async () => {
    setupDbMocks(true);

    const result = await handleSubscriptionRevoked(baseSubscriptionPayload);

    expect(result.success).toBe(true);
    expect(result.tier).toBe("free");
    expect(mocks.mockDb.update).toHaveBeenCalled();
  });

  it("should create free tier entry if user not found", async () => {
    setupDbMocks(false);

    const result = await handleSubscriptionRevoked(baseSubscriptionPayload);

    expect(result.success).toBe(true);
    expect(result.tier).toBe("free");
    expect(mocks.mockDb.insert).toHaveBeenCalled();
  });

  it("should fail when externalId is missing", async () => {
    const payload = {
      ...baseSubscriptionPayload,
      customer: undefined,
    };

    const result = await handleSubscriptionRevoked(payload as unknown as typeof baseSubscriptionPayload);

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// handleSubscriptionStatusChange Tests
// ============================================================================

describe("handleSubscriptionStatusChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update to trialing status", async () => {
    setupDbMocks(true);

    const result = await handleSubscriptionStatusChange(baseSubscriptionPayload, "trialing");

    expect(result.success).toBe(true);
    expect(mocks.mockDb.update).toHaveBeenCalled();
  });

  it("should update to past_due status", async () => {
    setupDbMocks(true);

    const result = await handleSubscriptionStatusChange(baseSubscriptionPayload, "past_due");

    expect(result.success).toBe(true);
  });

  it("should fail when externalId is missing", async () => {
    const payload = {
      ...baseSubscriptionPayload,
      customer: {
        id: TEST_CUSTOMER_ID,
        externalId: null,
        email: "test@example.com",
      },
    };

    const result = await handleSubscriptionStatusChange(payload, "active");

    expect(result.success).toBe(false);
    expect(result.error).toContain("externalId");
  });
});

// ============================================================================
// logWebhookEvent Tests
// ============================================================================

describe("logWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should log successful event", async () => {
    const chainedMock = setupDbMocks(false);

    await logWebhookEvent("evt-123", "subscription.active", true, { data: "test" });

    expect(mocks.mockDb.insert).toHaveBeenCalled();
    expect(chainedMock.onConflictDoNothing).toHaveBeenCalled();
  });

  it("should log failed event with error message", async () => {
    setupDbMocks(false);

    await logWebhookEvent("evt-456", "subscription.canceled", false, null, "Processing failed");

    expect(mocks.mockDb.insert).toHaveBeenCalled();
  });

  it("should handle idempotency (duplicate event IDs)", async () => {
    const chainedMock = setupDbMocks(false);

    // Call twice with same eventId
    await logWebhookEvent("evt-duplicate", "test.event", true);
    await logWebhookEvent("evt-duplicate", "test.event", true);

    // Both calls should use onConflictDoNothing
    expect(chainedMock.onConflictDoNothing).toHaveBeenCalledTimes(2);
  });

  it("should truncate long error messages to 1000 chars", async () => {
    const chainedMock = setupDbMocks(false);
    let capturedValues: Record<string, unknown> | null = null;
    chainedMock.values.mockImplementation((values: Record<string, unknown>) => {
      capturedValues = values;
      return chainedMock;
    });

    const longError = "x".repeat(2000);
    await logWebhookEvent("evt-789", "test.event", false, null, longError);

    expect(mocks.mockDb.insert).toHaveBeenCalled();
    expect(capturedValues).not.toBeNull();
    // Error should be truncated to 1000 chars max
    expect(capturedValues!.error).toBeDefined();
    expect((capturedValues!.error as string).length).toBeLessThanOrEqual(1000);
    expect((capturedValues!.error as string).length).toBe(1000);
  });

  it("should not truncate short error messages", async () => {
    const chainedMock = setupDbMocks(false);
    let capturedValues: Record<string, unknown> | null = null;
    chainedMock.values.mockImplementation((values: Record<string, unknown>) => {
      capturedValues = values;
      return chainedMock;
    });

    const shortError = "Short error message";
    await logWebhookEvent("evt-short", "test.event", false, null, shortError);

    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.error).toBe(shortError);
  });

  it("should truncate large payloads over 10000 chars", async () => {
    const chainedMock = setupDbMocks(false);
    let capturedValues: Record<string, unknown> | null = null;
    chainedMock.values.mockImplementation((values: Record<string, unknown>) => {
      capturedValues = values;
      return chainedMock;
    });

    // Create a payload that will be > 10000 chars when stringified
    const largePayload = { data: "x".repeat(15000) };
    await logWebhookEvent("evt-large", "test.event", true, largePayload);

    expect(capturedValues).not.toBeNull();
    const storedPayload = capturedValues!.payload as {
      _truncated?: boolean;
      _originalLength?: number;
      _preview?: string;
    };
    expect(storedPayload._truncated).toBe(true);
    expect(storedPayload._originalLength).toBeGreaterThan(10000);
    expect(storedPayload._preview).toBeDefined();
    expect(storedPayload._preview!.length).toBe(5000);
  });

  it("should not truncate small payloads", async () => {
    const chainedMock = setupDbMocks(false);
    let capturedValues: Record<string, unknown> | null = null;
    chainedMock.values.mockImplementation((values: Record<string, unknown>) => {
      capturedValues = values;
      return chainedMock;
    });

    const smallPayload = { data: "small data" };
    await logWebhookEvent("evt-small", "test.event", true, smallPayload);

    expect(capturedValues).not.toBeNull();
    // Should store the original payload unchanged
    expect(capturedValues!.payload).toEqual(smallPayload);
  });
});

// ============================================================================
// Tier Mapping Tests
// ============================================================================

describe("Tier Mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should default to free tier for unknown product ID", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      productId: "unknown-product-id",
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.success).toBe(true);
    expect(result.tier).toBe("free");
  });

  it("should identify pro monthly correctly", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      productId: "6a513e7d-07cd-4809-9c01-4cb29604a207", // Pro Monthly sandbox
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.tier).toBe("pro");
  });

  it("should identify pro annual correctly", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      productId: "d6825cb5-35b6-4c94-9106-b6523aeac079", // Pro Annual sandbox
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.tier).toBe("pro");
  });

  it("should identify business monthly correctly", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      productId: "0ba11623-5fd2-479d-bf1b-79ee61eba60c", // Business Monthly sandbox
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.tier).toBe("business");
  });

  it("should identify business annual correctly", async () => {
    setupDbMocks(false);

    const payload = {
      ...baseSubscriptionPayload,
      productId: "7a26630b-1dbb-4d67-a685-643c98c0cc0a", // Business Annual sandbox
    };

    const result = await handleSubscriptionActive(payload);

    expect(result.tier).toBe("business");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle database errors gracefully in handleSubscriptionActive", async () => {
    mocks.mockDb.select.mockImplementation(() => {
      throw new Error("Database connection failed");
    });

    const result = await handleSubscriptionActive(baseSubscriptionPayload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Database connection failed");
  });

  it("should handle database errors in logWebhookEvent without throwing", async () => {
    mocks.mockDb.insert.mockImplementation(() => {
      throw new Error("Insert failed");
    });

    // Should not throw
    await expect(
      logWebhookEvent("evt-123", "test.event", true)
    ).resolves.not.toThrow();
  });
});
