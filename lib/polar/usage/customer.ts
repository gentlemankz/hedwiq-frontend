/**
 * Polar Customer Utilities
 *
 * Functions for managing Polar customers:
 * - Getting customers by external ID
 * - Creating new customers
 * - Ensuring customer existence
 */

import { polarClient } from "@/lib/auth";
import type { PolarCustomerResult } from "./types";

// ============================================================================
// Customer Utilities
// ============================================================================

/**
 * Get a Polar customer by external ID (user ID).
 * Returns null if Polar is not configured or customer doesn't exist.
 *
 * @param userId - The user's ID (external customer ID in Polar)
 */
export async function getPolarCustomer(userId: string): Promise<PolarCustomerResult> {
  if (!polarClient) {
    return { customer: null, error: "Polar not configured" };
  }

  try {
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });
    return { customer };
  } catch {
    return { customer: null };
  }
}

/**
 * Get or create a Polar customer.
 * If the customer doesn't exist, creates one with the provided details.
 *
 * @param userId - The user's ID (external customer ID in Polar)
 * @param email - The user's email
 * @param name - Optional user name
 */
export async function getOrCreatePolarCustomer(
  userId: string,
  email: string,
  name?: string | null
): Promise<PolarCustomerResult> {
  if (!polarClient) {
    return { customer: null, error: "Polar not configured" };
  }

  try {
    // Try to get existing customer
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });
    return { customer, created: false };
  } catch {
    // Customer doesn't exist, create one
    try {
      const newCustomer = await polarClient.customers.create({
        email,
        name: name || undefined,
        externalId: userId,
      });
      return { customer: newCustomer, created: true };
    } catch (createError) {
      console.error("[Polar] Failed to create customer:", createError);
      return {
        customer: null,
        error: createError instanceof Error ? createError.message : "Failed to create customer",
      };
    }
  }
}

/**
 * Ensure a Polar customer exists for the given user ID.
 * This is important because events sent to non-existent customers may be dropped.
 *
 * NOTE: This function is now primarily used by getOrCreatePolarCustomer,
 * not as a preflight check before event ingestion (which was removed for performance).
 *
 * @param userId - The user's ID (external customer ID in Polar)
 * @returns Whether the customer exists or was verified
 */
export async function ensureCustomerExists(userId: string): Promise<{
  exists: boolean;
  customerId?: string;
  error?: string;
}> {
  if (!polarClient) {
    return { exists: false, error: "Polar not configured" };
  }

  try {
    const customer = await polarClient.customers.getExternal({
      externalId: userId,
    });
    return { exists: true, customerId: customer.id };
  } catch {
    // Customer doesn't exist - this is expected for new users
    return { exists: false, error: "Customer not found" };
  }
}
