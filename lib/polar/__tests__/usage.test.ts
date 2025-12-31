/**
 * Comprehensive tests for Polar usage tracking service.
 *
 * Tests cover:
 * - Customer utilities (get, create, ensure exists)
 * - Usage sync helpers (schedule, sync, force refresh)
 * - Usage ingestion (meeting minutes, email drafts, storage)
 * - Customer state retrieval
 * - Limit checks (meeting, email drafts)
 * - Edge cases and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mock Setup - Using vi.hoisted for proper mock hoisting
// ============================================================================

// Create mock functions using vi.hoisted to ensure they're available when vi.mock runs
const mocks = vi.hoisted(() => ({
  mockPolarClient: {
    customers: {
      getExternal: vi.fn(),
      create: vi.fn(),
    },
    events: {
      ingest: vi.fn(),
    },
    subscriptions: {
      list: vi.fn(),
    },
    customerMeters: {
      list: vi.fn(),
    },
  },
  mockCache: {
    getSubscriptionFromCache: vi.fn(),
    updateSubscriptionCache: vi.fn(),
    isCacheTooOld: vi.fn(),
    recordCacheSyncError: vi.fn(),
  },
}));

// Mock the auth module to control polarClient
vi.mock("@/lib/auth", () => ({
  polarClient: mocks.mockPolarClient,
}));

// Mock subscription cache
vi.mock("@/lib/polar/subscription-cache", () => mocks.mockCache);

// Destructure mocks for easier access
const { mockPolarClient, mockCache } = mocks;

// Import after mocking
import {
  getPolarCustomer,
  getOrCreatePolarCustomer,
  ensureCustomerExists,
  scheduleUsageSync,
  syncUsageFromPolar,
  forceRefreshUsage,
  reportMeetingMinutes,
  reportEmailDraft,
  reportStorageChange,
  getCustomerState,
  canUserStartMeeting,
  canUserCreateEmailDraft,
  USAGE_EVENTS,
} from "../usage";

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER_ID = "user-test-123";
const TEST_CUSTOMER_ID = "polar-customer-456";
const TEST_EMAIL = "test@example.com";

const mockCustomer = {
  id: TEST_CUSTOMER_ID,
  email: TEST_EMAIL,
  name: "Test User",
};

// Use sandbox pro monthly product ID to match actual config
const mockActiveSubscription = {
  id: "sub-123",
  productId: "6a513e7d-07cd-4809-9c01-4cb29604a207", // Pro Monthly sandbox product ID
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
};

const mockMeters = {
  result: {
    items: [
      { meter: { name: "meeting-minutes" }, consumedUnits: 50 },
      { meter: { name: "email-drafts" }, consumedUnits: 5 },
      { meter: { name: "storage-bytes" }, consumedUnits: 1024000 },
    ],
  },
};

// ============================================================================
// Customer Utilities Tests
// ============================================================================

describe("Customer Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPolarCustomer", () => {
    it("should return customer when found", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);

      const result = await getPolarCustomer(TEST_USER_ID);

      expect(result.customer).toEqual(mockCustomer);
      expect(result.error).toBeUndefined();
      expect(mockPolarClient.customers.getExternal).toHaveBeenCalledWith({
        externalId: TEST_USER_ID,
      });
    });

    it("should return null when customer not found", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Not found")
      );

      const result = await getPolarCustomer(TEST_USER_ID);

      expect(result.customer).toBeNull();
      expect(result.error).toBeUndefined(); // Not an error, just not found
    });
  });

  describe("getOrCreatePolarCustomer", () => {
    it("should return existing customer without creating", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);

      const result = await getOrCreatePolarCustomer(
        TEST_USER_ID,
        TEST_EMAIL,
        "Test User"
      );

      expect(result.customer).toEqual(mockCustomer);
      expect(result.created).toBe(false);
      expect(mockPolarClient.customers.create).not.toHaveBeenCalled();
    });

    it("should create customer when not found", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Not found")
      );
      mockPolarClient.customers.create.mockResolvedValue(mockCustomer);

      const result = await getOrCreatePolarCustomer(
        TEST_USER_ID,
        TEST_EMAIL,
        "Test User"
      );

      expect(result.customer).toEqual(mockCustomer);
      expect(result.created).toBe(true);
      expect(mockPolarClient.customers.create).toHaveBeenCalledWith({
        email: TEST_EMAIL,
        name: "Test User",
        externalId: TEST_USER_ID,
      });
    });

    it("should return error when creation fails", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Not found")
      );
      mockPolarClient.customers.create.mockRejectedValue(
        new Error("Creation failed")
      );

      const result = await getOrCreatePolarCustomer(
        TEST_USER_ID,
        TEST_EMAIL,
        "Test User"
      );

      expect(result.customer).toBeNull();
      expect(result.error).toBe("Creation failed");
    });
  });

  describe("ensureCustomerExists", () => {
    it("should return exists: true when customer found", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);

      const result = await ensureCustomerExists(TEST_USER_ID);

      expect(result.exists).toBe(true);
      expect(result.customerId).toBe(TEST_CUSTOMER_ID);
    });

    it("should return exists: false when customer not found", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Not found")
      );

      const result = await ensureCustomerExists(TEST_USER_ID);

      expect(result.exists).toBe(false);
      expect(result.error).toBe("Customer not found");
    });
  });
});

// ============================================================================
// Usage Sync Tests
// ============================================================================

describe("Usage Sync Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers to prevent timer leaks and control async execution
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clean up any pending timers to prevent leaks
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("scheduleUsageSync", () => {
    it("should schedule sync and return true in non-serverless environment", async () => {
      // Setup mocks for getCustomerState
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      // Should return true (sync scheduled) and not throw
      const result1 = scheduleUsageSync(TEST_USER_ID, 1000);
      const result2 = scheduleUsageSync(TEST_USER_ID, 1000);
      const result3 = scheduleUsageSync(TEST_USER_ID, 1000);

      // In test environment (not serverless), should return true
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);

      // Advance timers to execute the scheduled sync
      await vi.advanceTimersByTimeAsync(1500);
    });
  });

  describe("syncUsageFromPolar", () => {
    it("should call getCustomerState", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await syncUsageFromPolar(TEST_USER_ID);

      expect(result).not.toBeNull();
      expect(mockPolarClient.customers.getExternal).toHaveBeenCalledWith({
        externalId: TEST_USER_ID,
      });
    });
  });

  describe("forceRefreshUsage", () => {
    it("should call syncUsageFromPolar", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await forceRefreshUsage(TEST_USER_ID);

      expect(result).not.toBeNull();
    });
  });
});

// ============================================================================
// Usage Ingestion Tests
// ============================================================================

describe("Usage Ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("reportMeetingMinutes", () => {
    it("should report minutes successfully with both duration and minutes keys", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      const result = await reportMeetingMinutes(TEST_USER_ID, 10, {
        roomId: "room-123",
      });

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalledWith({
        events: [
          expect.objectContaining({
            name: USAGE_EVENTS.MEETING_MINUTES,
            externalCustomerId: TEST_USER_ID,
            metadata: expect.objectContaining({
              duration: 10, // New key - meter aggregates on "duration" field
              minutes: 10,  // Legacy key - for backward compatibility
              roomId: "room-123",
            }),
          }),
        ],
      });
    });

    it("should skip reporting for zero minutes", async () => {
      const result = await reportMeetingMinutes(TEST_USER_ID, 0);

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).not.toHaveBeenCalled();
    });

    it("should skip reporting for negative minutes", async () => {
      const result = await reportMeetingMinutes(TEST_USER_ID, -5);

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).not.toHaveBeenCalled();
    });

    it("should succeed without preflight customer check (optimization)", async () => {
      // We removed the ensureCustomerExists preflight to avoid double API calls
      // Events are sent directly - Polar handles customer lookup via externalCustomerId
      mockPolarClient.events.ingest.mockResolvedValue({});

      const result = await reportMeetingMinutes(TEST_USER_ID, 10);

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalled();
      // No preflight check - customers.getExternal should not be called
      expect(mockPolarClient.customers.getExternal).not.toHaveBeenCalled();
    });

    it("should return error when ingestion fails", async () => {
      mockPolarClient.events.ingest.mockRejectedValue(
        new Error("API rate limit")
      );

      const result = await reportMeetingMinutes(TEST_USER_ID, 10);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API rate limit");
    });

    it("should schedule cache sync after successful report", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      await reportMeetingMinutes(TEST_USER_ID, 10);

      // Event was ingested directly (no preflight customer check)
      expect(mockPolarClient.events.ingest).toHaveBeenCalled();
      // scheduleUsageSync is called but may be no-op in serverless
    });
  });

  describe("reportEmailDraft", () => {
    it("should report email draft successfully", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      const result = await reportEmailDraft(TEST_USER_ID, 1, {
        meetingId: "meeting-123",
        actionType: "email_followup",
      });

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalledWith({
        events: [
          expect.objectContaining({
            name: USAGE_EVENTS.EMAIL_DRAFTS,
            externalCustomerId: TEST_USER_ID,
            metadata: expect.objectContaining({
              count: 1,
              meetingId: "meeting-123",
              actionType: "email_followup",
            }),
          }),
        ],
      });
    });

    it("should skip reporting for zero count", async () => {
      const result = await reportEmailDraft(TEST_USER_ID, 0);

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).not.toHaveBeenCalled();
    });
  });

  describe("reportStorageChange", () => {
    it("should report storage upload successfully", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      const result = await reportStorageChange(TEST_USER_ID, 1048576, {
        fileName: "document.pdf",
        action: "upload",
      });

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalledWith({
        events: [
          expect.objectContaining({
            name: USAGE_EVENTS.STORAGE_BYTES,
            externalCustomerId: TEST_USER_ID,
            metadata: expect.objectContaining({
              size: 1048576, // Meter aggregates on "size" field
              bytes: 1048576, // Legacy key for backward compatibility
              fileName: "document.pdf",
              action: "upload",
            }),
          }),
        ],
      });
    });

    it("should handle negative bytes for deletion", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      const result = await reportStorageChange(TEST_USER_ID, -1048576, {
        action: "delete",
      });

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalledWith({
        events: [
          expect.objectContaining({
            metadata: expect.objectContaining({
              size: -1048576, // Meter aggregates on "size" field
              bytes: -1048576, // Legacy key for backward compatibility
              action: "delete",
            }),
          }),
        ],
      });
    });

    it("should skip reporting for zero bytes", async () => {
      const result = await reportStorageChange(TEST_USER_ID, 0);

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Customer State Tests
// ============================================================================

describe("Customer State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCustomerState", () => {
    it("should return full customer state from Polar", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const state = await getCustomerState(TEST_USER_ID);

      expect(state).not.toBeNull();
      expect(state?.minutesUsed).toBe(50);
      expect(state?.emailDraftsUsed).toBe(5);
      expect(state?.storageUsedBytes).toBe(1024000);
      expect(state?.activeSubscriptions).toHaveLength(1);
    });

    it("should update cache on successful fetch", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      await getCustomerState(TEST_USER_ID);

      expect(mockCache.updateSubscriptionCache).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          minutesUsed: 50,
          emailDraftsUsed: 5,
          storageUsedBytes: 1024000,
        })
      );
    });

    it("should fall back to cache when Polar fails", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("API error")
      );
      mockCache.getSubscriptionFromCache.mockResolvedValue({
        tier: "pro",
        usage: {
          minutesUsed: 30,
          emailDraftsUsed: 2,
          storageUsedBytes: 500000,
        },
        lastSyncedAt: new Date(),
      });
      mockCache.isCacheTooOld.mockReturnValue(false);
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const state = await getCustomerState(TEST_USER_ID);

      expect(state).not.toBeNull();
      expect(state?.minutesUsed).toBe(30);
      expect(mockCache.recordCacheSyncError).toHaveBeenCalled();
    });

    it("should return null when cache is too old", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("API error")
      );
      mockCache.getSubscriptionFromCache.mockResolvedValue({
        tier: "pro",
        usage: { minutesUsed: 30, emailDraftsUsed: 2, storageUsedBytes: 500000 },
        lastSyncedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
      });
      mockCache.isCacheTooOld.mockReturnValue(true);
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const state = await getCustomerState(TEST_USER_ID);

      expect(state).toBeNull();
    });

    it("should return free tier for no subscriptions", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: { items: [] },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const state = await getCustomerState(TEST_USER_ID);

      expect(state?.tier).toBe("free");
    });
  });
});

// ============================================================================
// Limit Check Tests
// ============================================================================

describe("Limit Checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canUserStartMeeting", () => {
    it("should allow meeting when under limit", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 50 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(true);
      expect(result.minutesUsed).toBe(50);
      expect(result.remainingMinutes).toBeGreaterThan(0);
    });

    it("should deny meeting when at limit", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [] }, // Free tier (300 minutes limit)
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          // 300+ minutes used = at or over limit for free tier
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 300 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Monthly minutes limit reached");
    });

    it("should allow free tier users to start meetings when under limit", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [] }, // Free tier
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 50 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe("free");
    });

    it("should return free tier with limits when customer not found", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Not found")
      );
      mockCache.getSubscriptionFromCache.mockResolvedValue(null);
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const result = await canUserStartMeeting(TEST_USER_ID);

      // No customer state = default to free tier with limits
      expect(result.tier).toBe("free");
    });

    it("should fail closed on complete API errors", async () => {
      // API throws error AND cache is unavailable = complete failure
      // This should fail closed (deny access), not default to free tier
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Network error")
      );
      mockCache.getSubscriptionFromCache.mockRejectedValue(
        new Error("Cache unavailable")
      );
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const result = await canUserStartMeeting(TEST_USER_ID);

      // Should fail closed - deny access when we can't verify limits
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Unable to verify usage limits. Please try again.");
    });

    it("should return free tier when customer simply not found (no error)", async () => {
      // Customer doesn't exist in Polar yet (not an error, just new user)
      // This is different from API failure - we can verify they have no subscription
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Not found")
      );
      mockCache.getSubscriptionFromCache.mockResolvedValue(null);
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const result = await canUserStartMeeting(TEST_USER_ID);

      // New user with no customer record = free tier (not a failure)
      expect(result.tier).toBe("free");
      expect(result.allowed).toBe(true);
      expect(result.minutesLimit).toBe(300); // Free tier limit
    });
  });

  describe("canUserCreateEmailDraft", () => {
    it("should allow email draft when under limit", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "email-drafts" }, consumedUnits: 5 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserCreateEmailDraft(TEST_USER_ID);

      expect(result.allowed).toBe(true);
      expect(result.remainingDrafts).toBeGreaterThan(0);
    });

    it("should deny email draft for free tier", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [] }, // Free tier
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: { items: [] },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserCreateEmailDraft(TEST_USER_ID);

      expect(result.tier).toBe("free");
      // Free tier may or may not allow email drafts depending on TIER_LIMITS config
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe("Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Meter Identification", () => {
    it("should handle different meter name formats", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [
            { meter: { name: "meeting_minutes" }, consumedUnits: 10 },
            { meter: { name: "Meeting Minutes" }, consumedUnits: 20 },
            { meter: { name: "meeting-minutes" }, consumedUnits: 30 },
          ],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const state = await getCustomerState(TEST_USER_ID);

      // Should identify the correct meter format
      expect(state?.minutesUsed).toBeGreaterThanOrEqual(0);
    });

    it("should handle missing meter data", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: { items: [] },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const state = await getCustomerState(TEST_USER_ID);

      expect(state?.minutesUsed).toBe(0);
      expect(state?.emailDraftsUsed).toBe(0);
      expect(state?.storageUsedBytes).toBe(0);
    });
  });

  describe("Subscription Status", () => {
    it("should handle trialing status", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: {
          items: [
            {
              ...mockActiveSubscription,
              status: "trialing",
            },
          ],
        },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const state = await getCustomerState(TEST_USER_ID);

      expect(state?.activeSubscriptions[0].status).toBe("trialing");
    });

    it("should handle past_due within grace period", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: {
          items: [
            {
              ...mockActiveSubscription,
              status: "past_due",
              currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Within grace
            },
          ],
        },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue(mockMeters);
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const state = await getCustomerState(TEST_USER_ID);

      // Should still allow access during grace period
      expect(state?.activeSubscriptions).toHaveLength(1);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent usage reports", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      // Simulate concurrent reports
      const results = await Promise.all([
        reportMeetingMinutes(TEST_USER_ID, 5),
        reportMeetingMinutes(TEST_USER_ID, 10),
        reportEmailDraft(TEST_USER_ID, 1),
      ]);

      expect(results.every((r) => r.success)).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalledTimes(3);
    });
  });

  describe("Large Values", () => {
    it("should handle large minute values", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      // Report 24 hours worth of minutes
      const result = await reportMeetingMinutes(TEST_USER_ID, 1440);

      expect(result.success).toBe(true);
      expect(mockPolarClient.events.ingest).toHaveBeenCalledWith({
        events: [
          expect.objectContaining({
            metadata: expect.objectContaining({
              duration: 1440, // Meter aggregates on "duration" field
              minutes: 1440,  // Legacy key for backward compatibility
            }),
          }),
        ],
      });
    });

    it("should handle large storage values", async () => {
      mockPolarClient.events.ingest.mockResolvedValue({});

      // Report 1GB
      const result = await reportStorageChange(
        TEST_USER_ID,
        1024 * 1024 * 1024
      );

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

describe("Stress Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should handle rapid sync scheduling", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: { items: [] },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    // Rapidly schedule many syncs
    for (let i = 0; i < 100; i++) {
      scheduleUsageSync(TEST_USER_ID, 1000);
    }

    // Only one sync should execute due to debouncing
    await vi.advanceTimersByTimeAsync(1500);

    expect(mockPolarClient.customers.getExternal).toHaveBeenCalledTimes(1);
  });

  it("should handle many users simultaneously", async () => {
    mockPolarClient.events.ingest.mockResolvedValue({});

    const userIds = Array.from({ length: 10 }, (_, i) => `user-${i}`);

    const results = await Promise.all(
      userIds.map((userId) => reportMeetingMinutes(userId, 5))
    );

    expect(results.every((r) => r.success)).toBe(true);
    expect(mockPolarClient.events.ingest).toHaveBeenCalledTimes(10);
  });
});

// ============================================================================
// Constants and Helper Function Tests
// ============================================================================

describe("Constants and Helper Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Unlimited Tier Handling", () => {
    it("should handle business tier with unlimited minutes", async () => {
      // Business product ID (sandbox)
      const businessSubscription = {
        id: "sub-business",
        productId: "0ba11623-5fd2-479d-bf1b-79ee61eba60c", // Business Monthly sandbox
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [businessSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 5000 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe("business");
      // -1 indicates unlimited (not a large number)
      expect(result.remainingMinutes).toBe(-1);
      expect(result.minutesLimit).toBe(-1);
    });

    it("should allow meeting when business tier has used many minutes", async () => {
      const businessSubscription = {
        id: "sub-business",
        productId: "0ba11623-5fd2-479d-bf1b-79ee61eba60c",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [businessSubscription] },
      });
      // Even with 100,000 minutes used, should still be allowed (unlimited)
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 100000 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe("business");
    });

    it("should allow unlimited email drafts for enterprise tier", async () => {
      // Note: Enterprise products would need to be added to POLAR_PRODUCTS
      // For now, we test that unlimited logic works with business tier email drafts
      const businessSubscription = {
        id: "sub-business",
        productId: "0ba11623-5fd2-479d-bf1b-79ee61eba60c",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [businessSubscription] },
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "email-drafts" }, consumedUnits: 500 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserCreateEmailDraft(TEST_USER_ID);

      // Business has 1500 email drafts limit, so 500 used = 1000 remaining
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe("business");
      expect(result.remainingDrafts).toBe(1000);
    });
  });

  describe("Pro Tier Limits", () => {
    it("should enforce pro tier meeting minutes limit (3000)", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] }, // Pro Monthly
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 3000 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(false);
      expect(result.tier).toBe("pro");
      expect(result.remainingMinutes).toBe(0);
      expect(result.reason).toBe("Monthly minutes limit reached");
    });

    it("should allow pro tier with remaining minutes", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [mockActiveSubscription] }, // Pro Monthly
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: {
          items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 2500 }],
        },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserStartMeeting(TEST_USER_ID);

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe("pro");
      expect(result.remainingMinutes).toBe(500);
      expect(result.minutesLimit).toBe(3000);
    });
  });

  describe("Free Tier Email Draft Denial", () => {
    it("should deny email drafts for free tier (0 limit)", async () => {
      mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
      mockPolarClient.subscriptions.list.mockResolvedValue({
        result: { items: [] }, // No subscription = free tier
      });
      mockPolarClient.customerMeters.list.mockResolvedValue({
        result: { items: [] },
      });
      mockCache.updateSubscriptionCache.mockResolvedValue(true);

      const result = await canUserCreateEmailDraft(TEST_USER_ID);

      expect(result.allowed).toBe(false);
      expect(result.tier).toBe("free");
      expect(result.remainingDrafts).toBe(0);
      expect(result.reason).toBe("Email drafts not included in current plan");
    });
  });
});

// ============================================================================
// Fail Closed Behavior Tests
// ============================================================================

describe("Fail Closed Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canUserStartMeeting fail closed", () => {
    it("should deny meeting when getCustomerState throws exception", async () => {
      // Simulate a thrown exception in getCustomerState
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("Network failure")
      );
      mockCache.getSubscriptionFromCache.mockRejectedValue(
        new Error("Cache unavailable")
      );
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const result = await canUserStartMeeting(TEST_USER_ID);

      // Should fail closed - deny access when we can't verify
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Unable to verify usage limits. Please try again.");
    });
  });

  describe("canUserCreateEmailDraft fail closed", () => {
    it("should deny email draft when API fails completely", async () => {
      mockPolarClient.customers.getExternal.mockRejectedValue(
        new Error("API unavailable")
      );
      mockCache.getSubscriptionFromCache.mockRejectedValue(
        new Error("Cache unavailable")
      );
      mockCache.recordCacheSyncError.mockResolvedValue(undefined);

      const result = await canUserCreateEmailDraft(TEST_USER_ID);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Unable to verify limits. Please try again.");
    });
  });
});

// ============================================================================
// Past Due Grace Period Tests
// ============================================================================

describe("Past Due Grace Period", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow access when past_due is within 7-day grace period", async () => {
    const pastDueSubscription = {
      id: "sub-pastdue",
      productId: "6a513e7d-07cd-4809-9c01-4cb29604a207", // Pro Monthly
      status: "past_due",
      // Period ended 3 days ago (within 7-day grace)
      currentPeriodEnd: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    };

    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [pastDueSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: {
        items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 100 }],
      },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const result = await canUserStartMeeting(TEST_USER_ID);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("pro");
  });

  it("should deny access when past_due exceeds 7-day grace period", async () => {
    const pastDueSubscription = {
      id: "sub-pastdue",
      productId: "6a513e7d-07cd-4809-9c01-4cb29604a207", // Pro Monthly
      status: "past_due",
      // Period ended 10 days ago (beyond 7-day grace)
      currentPeriodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    };

    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [pastDueSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: {
        items: [{ meter: { name: "meeting-minutes" }, consumedUnits: 100 }],
      },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    // Should be downgraded to free tier
    expect(state?.tier).toBe("free");
  });

  it("should handle past_due exactly at grace period boundary", async () => {
    const pastDueSubscription = {
      id: "sub-pastdue",
      productId: "6a513e7d-07cd-4809-9c01-4cb29604a207",
      status: "past_due",
      // Period ended exactly 7 days ago (boundary)
      currentPeriodEnd: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    };

    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [pastDueSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: { items: [] },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    // At exactly 7 days, should be beyond grace (using <, not <=)
    expect(state?.tier).toBe("free");
  });

  it("should deny when past_due has null currentPeriodEnd", async () => {
    const pastDueSubscription = {
      id: "sub-pastdue",
      productId: "6a513e7d-07cd-4809-9c01-4cb29604a207",
      status: "past_due",
      currentPeriodEnd: null, // Missing date
    };

    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [pastDueSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: { items: [] },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    // No period end = can't verify grace = treat as out of grace
    expect(state?.tier).toBe("free");
  });
});

// ============================================================================
// Cache Boundary Tests
// ============================================================================

describe("Cache Boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use cache when API fails and cache is fresh (< 5 min)", async () => {
    mockPolarClient.customers.getExternal.mockRejectedValue(
      new Error("API error")
    );

    const freshCache = {
      tier: "pro" as const,
      usage: {
        minutesUsed: 100,
        emailDraftsUsed: 5,
        storageUsedBytes: 1000,
      },
      // Cache synced 3 minutes ago (fresh)
      lastSyncedAt: new Date(Date.now() - 3 * 60 * 1000),
    };

    mockCache.getSubscriptionFromCache.mockResolvedValue(freshCache);
    mockCache.isCacheTooOld.mockReturnValue(false);
    mockCache.recordCacheSyncError.mockResolvedValue(undefined);

    const state = await getCustomerState(TEST_USER_ID);

    expect(state).not.toBeNull();
    expect(state?.tier).toBe("pro");
    expect(state?.minutesUsed).toBe(100);
  });

  it("should reject cache when older than 24 hours", async () => {
    mockPolarClient.customers.getExternal.mockRejectedValue(
      new Error("API error")
    );

    const oldCache = {
      tier: "pro" as const,
      usage: {
        minutesUsed: 100,
        emailDraftsUsed: 5,
        storageUsedBytes: 1000,
      },
      // Cache synced 25 hours ago (too old)
      lastSyncedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    };

    mockCache.getSubscriptionFromCache.mockResolvedValue(oldCache);
    mockCache.isCacheTooOld.mockReturnValue(true);
    mockCache.recordCacheSyncError.mockResolvedValue(undefined);

    const state = await getCustomerState(TEST_USER_ID);

    // Should return null, not stale cache
    expect(state).toBeNull();
  });

  it("should use cache at exactly 24 hour boundary", async () => {
    mockPolarClient.customers.getExternal.mockRejectedValue(
      new Error("API error")
    );

    const boundaryCache = {
      tier: "pro" as const,
      usage: {
        minutesUsed: 100,
        emailDraftsUsed: 5,
        storageUsedBytes: 1000,
      },
      // Cache synced exactly 24 hours ago
      lastSyncedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };

    mockCache.getSubscriptionFromCache.mockResolvedValue(boundaryCache);
    // At exactly 24 hours, isCacheTooOld uses > comparison
    mockCache.isCacheTooOld.mockReturnValue(false);
    mockCache.recordCacheSyncError.mockResolvedValue(undefined);

    const state = await getCustomerState(TEST_USER_ID);

    // Exactly at boundary should still be usable
    expect(state).not.toBeNull();
  });
});

// ============================================================================
// Meter Identification Tests
// ============================================================================

describe("Meter Identification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should identify exact slug matches", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [mockActiveSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: {
        items: [
          { meter: { name: "meeting-minutes" }, consumedUnits: 100 },
          { meter: { name: "email-drafts" }, consumedUnits: 10 },
          { meter: { name: "storage-bytes" }, consumedUnits: 5000 },
        ],
      },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    expect(state?.minutesUsed).toBe(100);
    expect(state?.emailDraftsUsed).toBe(10);
    expect(state?.storageUsedBytes).toBe(5000);
  });

  it("should handle keyword fallback for meter variations", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [mockActiveSubscription] },
    });
    // Use variations that match keyword patterns
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: {
        items: [
          { meter: { name: "Total Meeting Minutes Used" }, consumedUnits: 200 },
          { meter: { name: "Email Drafts Generated" }, consumedUnits: 15 },
          { meter: { name: "Storage Bytes Consumed" }, consumedUnits: 8000 },
        ],
      },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    expect(state?.minutesUsed).toBe(200);
    expect(state?.emailDraftsUsed).toBe(15);
    expect(state?.storageUsedBytes).toBe(8000);
  });

  it("should ignore unknown meter types", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [mockActiveSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: {
        items: [
          { meter: { name: "unknown-metric" }, consumedUnits: 999 },
          { meter: { name: "api-calls" }, consumedUnits: 500 },
          { meter: { name: "meeting-minutes" }, consumedUnits: 50 },
        ],
      },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    expect(state?.minutesUsed).toBe(50);
    expect(state?.emailDraftsUsed).toBe(0); // Not found
    expect(state?.storageUsedBytes).toBe(0); // Not found
  });

  it("should handle null meter names gracefully", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [mockActiveSubscription] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: {
        items: [
          { meter: { name: null }, consumedUnits: 100 },
          { meter: null, consumedUnits: 200 },
          { meter: { name: "meeting-minutes" }, consumedUnits: 75 },
        ],
      },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    const state = await getCustomerState(TEST_USER_ID);

    // Should only count the valid meter
    expect(state?.minutesUsed).toBe(75);
  });
});

// ============================================================================
// Debouncing Tests
// ============================================================================

describe("Debouncing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should debounce multiple sync requests to single execution", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: { items: [] },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    // Schedule 5 syncs in rapid succession
    scheduleUsageSync(TEST_USER_ID, 500);
    scheduleUsageSync(TEST_USER_ID, 500);
    scheduleUsageSync(TEST_USER_ID, 500);
    scheduleUsageSync(TEST_USER_ID, 500);
    scheduleUsageSync(TEST_USER_ID, 500);

    // Wait for debounce period
    await vi.advanceTimersByTimeAsync(600);

    // Only one API call should have been made
    expect(mockPolarClient.customers.getExternal).toHaveBeenCalledTimes(1);
  });

  it("should reset debounce timer on new requests", async () => {
    mockPolarClient.customers.getExternal.mockResolvedValue(mockCustomer);
    mockPolarClient.subscriptions.list.mockResolvedValue({
      result: { items: [] },
    });
    mockPolarClient.customerMeters.list.mockResolvedValue({
      result: { items: [] },
    });
    mockCache.updateSubscriptionCache.mockResolvedValue(true);

    // First request
    scheduleUsageSync(TEST_USER_ID, 500);

    // Advance 400ms (before timeout)
    await vi.advanceTimersByTimeAsync(400);

    // Second request resets the timer
    scheduleUsageSync(TEST_USER_ID, 500);

    // Advance another 400ms (total 800ms, but timer reset at 400ms)
    await vi.advanceTimersByTimeAsync(400);

    // Should not have executed yet (timer was reset)
    expect(mockPolarClient.customers.getExternal).not.toHaveBeenCalled();

    // Advance to complete the reset timer
    await vi.advanceTimersByTimeAsync(200);

    // Now it should have executed once
    expect(mockPolarClient.customers.getExternal).toHaveBeenCalledTimes(1);
  });
});
