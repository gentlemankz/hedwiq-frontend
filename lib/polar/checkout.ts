/**
 * Polar Checkout Utilities
 *
 * Shared checkout functionality used by auth pages and dashboard.
 */

import { isValidProductSlug } from "./constants";

// ============================================================================
// Constants
// ============================================================================

/**
 * SessionStorage key for storing pending checkout info across auth flows
 */
export const PENDING_CHECKOUT_KEY = "pendingCheckout";

/**
 * Valid billing cycles
 */
const VALID_BILLING_CYCLES = ["annual", "monthly"] as const;

// ============================================================================
// Types
// ============================================================================

export interface PendingCheckout {
  plan: string;
  billing: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Build the Polar checkout slug from plan and billing parameters
 * @param plan - Plan name (e.g., "pro", "business")
 * @param billing - Billing cycle ("annual" or "monthly")
 * @returns Polar product slug (e.g., "pro-annual", "business") or null if invalid
 */
export function buildCheckoutSlug(plan: string, billing: string): string | null {
  // Sanitize inputs
  const sanitizedPlan = plan.toLowerCase().trim();
  const sanitizedBilling = billing.toLowerCase().trim();

  // Validate billing cycle
  if (!VALID_BILLING_CYCLES.includes(sanitizedBilling as typeof VALID_BILLING_CYCLES[number])) {
    console.warn(`[Polar Checkout] Invalid billing cycle: ${billing}`);
    return null;
  }

  // Build the slug
  const slug = sanitizedBilling === "annual" ? `${sanitizedPlan}-annual` : sanitizedPlan;

  // Validate the resulting slug is a valid product
  if (!isValidProductSlug(slug)) {
    console.warn(`[Polar Checkout] Invalid product slug: ${slug}`);
    return null;
  }

  return slug;
}

/**
 * Store pending checkout info in sessionStorage
 * Called when user selects a paid plan before auth
 */
export function storePendingCheckout(plan: string, billing: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ plan, billing }));
}

/**
 * Type guard to validate PendingCheckout structure
 */
function isValidPendingCheckout(data: unknown): data is PendingCheckout {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  // Validate required string fields
  if (typeof obj.plan !== "string" || obj.plan.trim().length === 0) return false;
  if (typeof obj.billing !== "string" || obj.billing.trim().length === 0) return false;

  // Validate plan is reasonable (basic alphanumeric check)
  const planPattern = /^[a-zA-Z][a-zA-Z0-9-]*$/;
  if (!planPattern.test(obj.plan)) return false;

  // Validate billing is a known value
  if (!VALID_BILLING_CYCLES.includes(obj.billing.toLowerCase() as typeof VALID_BILLING_CYCLES[number])) {
    return false;
  }

  return true;
}

/**
 * Get and clear pending checkout info from sessionStorage
 * Returns null if no pending checkout exists or data is invalid
 */
export function consumePendingCheckout(): PendingCheckout | null {
  if (typeof window === "undefined") return null;

  const pendingCheckoutStr = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
  if (!pendingCheckoutStr) return null;

  // Always clear the storage item, regardless of validation result
  sessionStorage.removeItem(PENDING_CHECKOUT_KEY);

  try {
    const parsed = JSON.parse(pendingCheckoutStr);

    // Validate the parsed data structure
    if (!isValidPendingCheckout(parsed)) {
      console.warn("[Polar Checkout] Invalid pending checkout data structure");
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("[Polar Checkout] Failed to parse pending checkout:", error);
    return null;
  }
}

/**
 * Check if there's a pending checkout without consuming it
 */
export function hasPendingCheckout(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(PENDING_CHECKOUT_KEY) !== null;
}

/**
 * Clear pending checkout without processing
 * Used when user explicitly cancels
 */
export function clearPendingCheckout(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
}
