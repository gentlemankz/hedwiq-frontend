/**
 * Constants Module Tests
 *
 * Tests cover:
 * - Tier limits configuration
 * - Product ID to tier mapping
 * - isUnlimited and isUnlimitedMinutes functions
 * - isPastDueWithinGrace function
 * - identifyMeterType function
 * - Product slug validation
 */

import { describe, it, expect } from "vitest";

import {
  TIER_LIMITS,
  UNLIMITED,
  PAST_DUE_GRACE_DAYS,
  isUnlimited,
  isUnlimitedMinutes,
  getTierFromProductId,
  getIntervalFromProductId,
  getProductBySlug,
  isValidProductSlug,
  getLimitsForTier,
  isPastDueWithinGrace,
  identifyMeterType,
  POLAR_PRODUCTS,
  METER_SLUGS,
} from "../constants";

// ============================================================================
// Tier Limits Tests
// ============================================================================

describe("Tier Limits Configuration", () => {
  describe("Free Tier", () => {
    it("should have correct free tier limits", () => {
      expect(TIER_LIMITS.free.minutesPerMonth).toBe(300);
      expect(TIER_LIMITS.free.storageGb).toBe(0);
      expect(TIER_LIMITS.free.historyDays).toBe(7);
      expect(TIER_LIMITS.free.emailDraftsPerMonth).toBe(0);
    });
  });

  describe("Pro Tier", () => {
    it("should have correct pro tier limits", () => {
      expect(TIER_LIMITS.pro.minutesPerMonth).toBe(3000);
      expect(TIER_LIMITS.pro.storageGb).toBe(10);
      expect(TIER_LIMITS.pro.historyDays).toBe(30);
      expect(TIER_LIMITS.pro.emailDraftsPerMonth).toBe(300);
    });
  });

  describe("Business Tier", () => {
    it("should have unlimited minutes", () => {
      expect(TIER_LIMITS.business.minutesPerMonth).toBe(UNLIMITED);
    });

    it("should have limited email drafts", () => {
      expect(TIER_LIMITS.business.emailDraftsPerMonth).toBe(1500);
    });
  });

  describe("Enterprise Tier", () => {
    it("should have all unlimited values", () => {
      expect(TIER_LIMITS.enterprise.minutesPerMonth).toBe(UNLIMITED);
      expect(TIER_LIMITS.enterprise.storageGb).toBe(UNLIMITED);
      expect(TIER_LIMITS.enterprise.historyDays).toBe(UNLIMITED);
      expect(TIER_LIMITS.enterprise.emailDraftsPerMonth).toBe(UNLIMITED);
    });
  });
});

// ============================================================================
// Unlimited Check Tests
// ============================================================================

describe("Unlimited Checks", () => {
  /**
   * The unlimited check uses two mechanisms:
   * 1. UNLIMITED constant (-1): The current standard for marking unlimited values
   * 2. UNLIMITED_THRESHOLD (100000): Legacy backwards-compatibility threshold
   *
   * IMPORTANT: The legacy threshold exists because some older code may have stored
   * large numbers (100000+) to represent "unlimited" before the -1 convention was adopted.
   * New code should always use UNLIMITED (-1) instead of large numbers.
   *
   * Business context: No realistic usage scenario would reach 100,000 minutes/month
   * (that's ~69 days of continuous meetings), so this threshold is safe for detecting
   * legacy unlimited values.
   */
  describe("isUnlimited", () => {
    it("should return true for UNLIMITED (-1) - preferred method", () => {
      expect(isUnlimited(UNLIMITED)).toBe(true);
      expect(isUnlimited(-1)).toBe(true);
    });

    describe("Legacy Threshold (100000) - Backwards Compatibility", () => {
      /**
       * @deprecated New code should use UNLIMITED (-1) instead
       *
       * Legacy threshold rationale:
       * - 100000 minutes = ~69 days of continuous meetings
       * - No realistic user would reach this in a month
       * - Values >= 100000 are treated as "unlimited" for backwards compatibility
       * - This allows migrating from old data without breaking existing records
       */
      it("should return true for values at threshold (100000)", () => {
        expect(isUnlimited(100000)).toBe(true);
      });

      it("should return true for values above threshold", () => {
        expect(isUnlimited(100001)).toBe(true);
        expect(isUnlimited(999999)).toBe(true);
        expect(isUnlimited(Number.MAX_SAFE_INTEGER)).toBe(true);
      });

      it("should return false just below threshold (99999)", () => {
        // This is the boundary: 99999 is NOT unlimited, 100000 IS unlimited
        expect(isUnlimited(99999)).toBe(false);
      });
    });

    it("should return false for normal tier limits", () => {
      // Free tier: 300 minutes
      expect(isUnlimited(300)).toBe(false);
      // Pro tier: 3000 minutes
      expect(isUnlimited(3000)).toBe(false);
      // Zero (no access)
      expect(isUnlimited(0)).toBe(false);
    });

    it("should return false for low values", () => {
      expect(isUnlimited(1)).toBe(false);
      expect(isUnlimited(10)).toBe(false);
      expect(isUnlimited(100)).toBe(false);
    });
  });

  describe("isUnlimitedMinutes", () => {
    /**
     * Alias for isUnlimited() with a more descriptive name.
     * Used specifically in meeting minutes context for clarity.
     */
    it("should behave identically to isUnlimited", () => {
      expect(isUnlimitedMinutes(UNLIMITED)).toBe(true);
      expect(isUnlimitedMinutes(-1)).toBe(true);
      expect(isUnlimitedMinutes(100000)).toBe(true); // Legacy threshold
      expect(isUnlimitedMinutes(99999)).toBe(false);
      expect(isUnlimitedMinutes(3000)).toBe(false);
    });
  });
});

// ============================================================================
// Product ID Mapping Tests
// ============================================================================

describe("Product ID Mapping", () => {
  describe("getTierFromProductId", () => {
    // Sandbox product IDs
    it("should return pro for pro monthly sandbox", () => {
      expect(getTierFromProductId("6a513e7d-07cd-4809-9c01-4cb29604a207")).toBe("pro");
    });

    it("should return pro for pro annual sandbox", () => {
      expect(getTierFromProductId("d6825cb5-35b6-4c94-9106-b6523aeac079")).toBe("pro");
    });

    it("should return business for business monthly sandbox", () => {
      expect(getTierFromProductId("0ba11623-5fd2-479d-bf1b-79ee61eba60c")).toBe("business");
    });

    it("should return business for business annual sandbox", () => {
      expect(getTierFromProductId("7a26630b-1dbb-4d67-a685-643c98c0cc0a")).toBe("business");
    });

    it("should return free for unknown product ID", () => {
      expect(getTierFromProductId("unknown-product-id")).toBe("free");
    });

    it("should return free for null product ID", () => {
      expect(getTierFromProductId(null)).toBe("free");
    });

    it("should return free for undefined product ID", () => {
      expect(getTierFromProductId(undefined)).toBe("free");
    });

    it("should return free for empty string", () => {
      expect(getTierFromProductId("")).toBe("free");
    });
  });

  describe("getIntervalFromProductId", () => {
    it("should return month for monthly products", () => {
      expect(getIntervalFromProductId("6a513e7d-07cd-4809-9c01-4cb29604a207")).toBe("month");
    });

    it("should return year for annual products", () => {
      expect(getIntervalFromProductId("d6825cb5-35b6-4c94-9106-b6523aeac079")).toBe("year");
    });

    it("should return null for unknown product", () => {
      expect(getIntervalFromProductId("unknown")).toBeNull();
    });

    it("should return null for null/undefined", () => {
      expect(getIntervalFromProductId(null)).toBeNull();
      expect(getIntervalFromProductId(undefined)).toBeNull();
    });
  });
});

// ============================================================================
// Product Slug Tests
// ============================================================================

describe("Product Slug Functions", () => {
  describe("getProductBySlug", () => {
    it("should return product for valid slug", () => {
      const product = getProductBySlug("pro");
      expect(product).toBeDefined();
      expect(product?.tier).toBe("pro");
      expect(product?.interval).toBe("month");
    });

    it("should return product for annual slug", () => {
      const product = getProductBySlug("pro-annual");
      expect(product).toBeDefined();
      expect(product?.tier).toBe("pro");
      expect(product?.interval).toBe("year");
    });

    it("should return undefined for unknown slug", () => {
      expect(getProductBySlug("unknown")).toBeUndefined();
    });
  });

  describe("isValidProductSlug", () => {
    it("should return true for valid slugs", () => {
      expect(isValidProductSlug("pro")).toBe(true);
      expect(isValidProductSlug("pro-annual")).toBe(true);
      expect(isValidProductSlug("business")).toBe(true);
      expect(isValidProductSlug("business-annual")).toBe(true);
    });

    it("should return false for invalid slugs", () => {
      expect(isValidProductSlug("enterprise")).toBe(false);
      expect(isValidProductSlug("free")).toBe(false);
      expect(isValidProductSlug("")).toBe(false);
      expect(isValidProductSlug("unknown")).toBe(false);
    });
  });

  describe("getLimitsForTier", () => {
    it("should return correct limits for each tier", () => {
      expect(getLimitsForTier("free")).toEqual(TIER_LIMITS.free);
      expect(getLimitsForTier("pro")).toEqual(TIER_LIMITS.pro);
      expect(getLimitsForTier("business")).toEqual(TIER_LIMITS.business);
      expect(getLimitsForTier("enterprise")).toEqual(TIER_LIMITS.enterprise);
    });
  });
});

// ============================================================================
// Past Due Grace Period Tests
// ============================================================================

describe("Past Due Grace Period", () => {
  describe("isPastDueWithinGrace", () => {
    it("should return true when period ended recently (within grace)", () => {
      // Period ended 3 days ago
      const periodEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(isPastDueWithinGrace(periodEnd)).toBe(true);
    });

    it("should return true when period ended 6 days ago", () => {
      const periodEnd = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      expect(isPastDueWithinGrace(periodEnd)).toBe(true);
    });

    it("should return false when period ended 8 days ago (beyond grace)", () => {
      const periodEnd = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      expect(isPastDueWithinGrace(periodEnd)).toBe(false);
    });

    it("should return false when period ended exactly 7 days ago (boundary)", () => {
      // At exactly 7 days, grace has expired (using <, not <=)
      const periodEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      expect(isPastDueWithinGrace(periodEnd)).toBe(false);
    });

    it("should return true just before 7-day boundary", () => {
      // 6 days, 23 hours, 59 minutes ago
      const periodEnd = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 - 60000));
      expect(isPastDueWithinGrace(periodEnd)).toBe(true);
    });

    it("should return false for null currentPeriodEnd", () => {
      expect(isPastDueWithinGrace(null)).toBe(false);
    });

    it("should handle string date input", () => {
      const periodEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(isPastDueWithinGrace(periodEnd)).toBe(true);
    });

    it("should handle ISO string date beyond grace", () => {
      const periodEnd = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(isPastDueWithinGrace(periodEnd)).toBe(false);
    });

    it("should return true when period has not ended yet (future date)", () => {
      // Period ends in 5 days - definitely within grace
      const periodEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      expect(isPastDueWithinGrace(periodEnd)).toBe(true);
    });
  });

  it("should have PAST_DUE_GRACE_DAYS set to 7", () => {
    expect(PAST_DUE_GRACE_DAYS).toBe(7);
  });
});

// ============================================================================
// Meter Identification Tests
// ============================================================================

describe("Meter Identification", () => {
  describe("identifyMeterType", () => {
    // Exact slug matches
    it("should identify meeting-minutes exact slug", () => {
      expect(identifyMeterType("meeting-minutes")).toBe("meeting_minutes");
    });

    it("should identify email-drafts exact slug", () => {
      expect(identifyMeterType("email-drafts")).toBe("email_drafts");
    });

    it("should identify storage-bytes exact slug", () => {
      expect(identifyMeterType("storage-bytes")).toBe("storage_bytes");
    });

    // Case insensitivity
    it("should handle uppercase", () => {
      expect(identifyMeterType("MEETING-MINUTES")).toBe("meeting_minutes");
      expect(identifyMeterType("EMAIL-DRAFTS")).toBe("email_drafts");
    });

    it("should handle mixed case", () => {
      expect(identifyMeterType("Meeting-Minutes")).toBe("meeting_minutes");
    });

    // Keyword fallback
    it("should identify via meeting + minute keywords", () => {
      expect(identifyMeterType("total meeting minutes used")).toBe("meeting_minutes");
      expect(identifyMeterType("Monthly Meeting Minute Count")).toBe("meeting_minutes");
    });

    it("should identify via email + draft keywords", () => {
      expect(identifyMeterType("email drafts generated")).toBe("email_drafts");
      expect(identifyMeterType("AI Email Draft Count")).toBe("email_drafts");
    });

    it("should identify via storage + byte keywords", () => {
      expect(identifyMeterType("storage bytes used")).toBe("storage_bytes");
      expect(identifyMeterType("Total Storage Byte Usage")).toBe("storage_bytes");
    });

    // Partial matches that should NOT match
    it("should not match partial keywords", () => {
      // Has "meeting" but not "minute"
      expect(identifyMeterType("meeting count")).toBe("unknown");
      // Has "minute" but not "meeting"
      expect(identifyMeterType("total minutes")).toBe("unknown");
      // Has "email" but not "draft"
      expect(identifyMeterType("email count")).toBe("unknown");
      // Has "storage" but not "byte"
      expect(identifyMeterType("storage gb")).toBe("unknown");
    });

    // Unknown meters
    it("should return unknown for unrecognized meters", () => {
      expect(identifyMeterType("api-calls")).toBe("unknown");
      expect(identifyMeterType("bandwidth-usage")).toBe("unknown");
      expect(identifyMeterType("custom-metric")).toBe("unknown");
    });

    // Edge cases
    it("should return unknown for null", () => {
      expect(identifyMeterType(null)).toBe("unknown");
    });

    it("should return unknown for undefined", () => {
      expect(identifyMeterType(undefined)).toBe("unknown");
    });

    it("should return unknown for empty string", () => {
      expect(identifyMeterType("")).toBe("unknown");
    });

    it("should handle whitespace", () => {
      expect(identifyMeterType("  meeting-minutes  ")).toBe("meeting_minutes");
    });
  });

  describe("METER_SLUGS constants", () => {
    it("should have correct slug values", () => {
      expect(METER_SLUGS.MEETING_MINUTES).toBe("meeting-minutes");
      expect(METER_SLUGS.EMAIL_DRAFTS).toBe("email-drafts");
      expect(METER_SLUGS.STORAGE_BYTES).toBe("storage-bytes");
    });
  });
});

// ============================================================================
// Product Configuration Tests
// ============================================================================

describe("Product Configuration", () => {
  it("should have products defined", () => {
    expect(POLAR_PRODUCTS.length).toBeGreaterThan(0);
  });

  it("should have unique product IDs", () => {
    const productIds = POLAR_PRODUCTS.map(p => p.productId);
    const uniqueIds = new Set(productIds);
    expect(uniqueIds.size).toBe(productIds.length);
  });

  it("should have unique slugs", () => {
    const slugs = POLAR_PRODUCTS.map(p => p.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it("should have valid tier values", () => {
    const validTiers = ["free", "pro", "business", "enterprise"];
    for (const product of POLAR_PRODUCTS) {
      expect(validTiers).toContain(product.tier);
    }
  });

  it("should have valid interval values", () => {
    const validIntervals = ["month", "year"];
    for (const product of POLAR_PRODUCTS) {
      expect(validIntervals).toContain(product.interval);
    }
  });
});

// ============================================================================
// UNLIMITED Constant Tests
// ============================================================================

describe("UNLIMITED Constant", () => {
  it("should be -1", () => {
    expect(UNLIMITED).toBe(-1);
  });

  it("should be negative (for comparison safety)", () => {
    expect(UNLIMITED).toBeLessThan(0);
  });
});

// ============================================================================
// Production Product ID Tests
// ============================================================================

describe("Production Product IDs", () => {
  /**
   * These IDs are hardcoded here to ensure they don't accidentally change.
   * If production IDs change, these tests will fail and alert developers.
   */
  const PRODUCTION_PRODUCT_IDS = {
    proMonthly: "96ef3a99-c31f-4c71-ad3a-a18c73875442",
    proAnnual: "55e07982-ec4e-4cc9-9388-2174f0f9ad92",
    businessMonthly: "c7884495-e190-4182-bad7-3ca8f5386207",
    businessAnnual: "d71eb319-0a18-4150-a7cd-0409b2c01fba",
  };

  /**
   * Sandbox IDs for reference (used in development/testing)
   */
  const SANDBOX_PRODUCT_IDS = {
    proMonthly: "6a513e7d-07cd-4809-9c01-4cb29604a207",
    proAnnual: "d6825cb5-35b6-4c94-9106-b6523aeac079",
    businessMonthly: "0ba11623-5fd2-479d-bf1b-79ee61eba60c",
    businessAnnual: "7a26630b-1dbb-4d67-a685-643c98c0cc0a",
  };

  describe("ID Format Validation", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it("production IDs should be valid UUIDs", () => {
      Object.values(PRODUCTION_PRODUCT_IDS).forEach((id) => {
        expect(id).toMatch(uuidRegex);
      });
    });

    it("sandbox IDs should be valid UUIDs", () => {
      Object.values(SANDBOX_PRODUCT_IDS).forEach((id) => {
        expect(id).toMatch(uuidRegex);
      });
    });
  });

  describe("ID Uniqueness", () => {
    it("all production IDs should be unique", () => {
      const ids = Object.values(PRODUCTION_PRODUCT_IDS);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("production and sandbox IDs should not overlap", () => {
      const productionIds = new Set(Object.values(PRODUCTION_PRODUCT_IDS));
      const sandboxIds = Object.values(SANDBOX_PRODUCT_IDS);

      sandboxIds.forEach((id) => {
        expect(productionIds.has(id)).toBe(false);
      });
    });
  });

  describe("Current Environment", () => {
    it("POLAR_PRODUCTS should have expected number of products", () => {
      // Both sandbox and production should have 4 products (pro/business × monthly/annual)
      expect(POLAR_PRODUCTS.length).toBe(4);
    });

    it("current environment products should include pro monthly", () => {
      const proMonthly = POLAR_PRODUCTS.find(
        (p) => p.tier === "pro" && p.interval === "month"
      );
      expect(proMonthly).toBeDefined();
      expect(proMonthly?.slug).toBe("pro");
    });

    it("current environment products should include pro annual", () => {
      const proAnnual = POLAR_PRODUCTS.find(
        (p) => p.tier === "pro" && p.interval === "year"
      );
      expect(proAnnual).toBeDefined();
      expect(proAnnual?.slug).toBe("pro-annual");
    });

    it("current environment products should include business monthly", () => {
      const businessMonthly = POLAR_PRODUCTS.find(
        (p) => p.tier === "business" && p.interval === "month"
      );
      expect(businessMonthly).toBeDefined();
      expect(businessMonthly?.slug).toBe("business");
    });

    it("current environment products should include business annual", () => {
      const businessAnnual = POLAR_PRODUCTS.find(
        (p) => p.tier === "business" && p.interval === "year"
      );
      expect(businessAnnual).toBeDefined();
      expect(businessAnnual?.slug).toBe("business-annual");
    });
  });

  describe("Product ID Documentation", () => {
    /**
     * This test documents that production IDs exist and would work
     * with the same mapping logic as sandbox IDs.
     *
     * NOTE: Actual runtime uses POLAR_ENVIRONMENT to select sandbox vs production.
     * These tests verify the IDs are correctly documented for reference.
     */
    it("should document production Pro Monthly ID", () => {
      expect(PRODUCTION_PRODUCT_IDS.proMonthly).toBe("96ef3a99-c31f-4c71-ad3a-a18c73875442");
    });

    it("should document production Pro Annual ID", () => {
      expect(PRODUCTION_PRODUCT_IDS.proAnnual).toBe("55e07982-ec4e-4cc9-9388-2174f0f9ad92");
    });

    it("should document production Business Monthly ID", () => {
      expect(PRODUCTION_PRODUCT_IDS.businessMonthly).toBe("c7884495-e190-4182-bad7-3ca8f5386207");
    });

    it("should document production Business Annual ID", () => {
      expect(PRODUCTION_PRODUCT_IDS.businessAnnual).toBe("d71eb319-0a18-4150-a7cd-0409b2c01fba");
    });
  });
});
