/**
 * Polar Usage Tracking Types
 *
 * Type definitions for usage-based billing with Polar.
 */

import type { SubscriptionTier } from "@/lib/polar/constants";

// ============================================================================
// Types
// ============================================================================

export interface UsageReport {
  success: boolean;
  error?: string;
  eventId?: string;
}

export interface MeetingLimitCheck {
  allowed: boolean;
  tier: SubscriptionTier;
  remainingMinutes: number;
  minutesUsed: number;
  minutesLimit: number;
  reason?: string;
}

export interface CustomerState {
  tier: SubscriptionTier;
  minutesUsed: number;
  emailDraftsUsed: number;
  storageUsedBytes: number;
  activeSubscriptions: Array<{
    id: string;
    productId: string;
    status: string;
  }>;
}

/**
 * Result of getting or creating a Polar customer
 */
export interface PolarCustomerResult {
  customer: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  error?: string;
  created?: boolean;
}
