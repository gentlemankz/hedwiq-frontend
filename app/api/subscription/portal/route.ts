/**
 * Subscription Portal API
 *
 * POST /api/subscription/portal
 * Creates a Polar customer portal session for managing subscriptions.
 *
 * Authentication: User session required
 *
 * Response:
 * - portalUrl: string - The Polar customer portal URL
 *
 * The customer portal allows users to:
 * - View and manage their subscriptions
 * - Update payment methods
 * - View billing history
 * - Cancel or modify subscriptions
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, polarClient } from "@/lib/auth";
import { handleAPIError, unauthorized, validationError, notFound } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

interface PortalResponse {
  portalUrl: string;
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST() {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw unauthorized("Authentication required");
    }

    // Check if Polar is configured
    if (!polarClient) {
      throw validationError("Payment system is not configured");
    }

    const userId = session.user.id;

    // Get Polar customer
    let polarCustomer;
    try {
      polarCustomer = await polarClient.customers.getExternal({
        externalId: userId,
      });
    } catch {
      // Customer doesn't exist in Polar
      throw notFound("Customer not found. Please subscribe to a plan first.");
    }

    // Create customer portal session
    const portalSession = await polarClient.customerSessions.create({
      customerId: polarCustomer.id,
    });

    const response: PortalResponse = {
      portalUrl: portalSession.customerPortalUrl,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleAPIError(error);
  }
}
