/**
 * Polar Usage Tracking Service
 *
 * Handles usage-based billing with Polar:
 * - Meeting minutes tracking
 * - Email draft tracking
 * - Storage usage tracking
 * - Pre-meeting limit checks
 *
 * This module has been modularized into separate files for better maintainability.
 * All exports are re-exported here for backward compatibility.
 */

// ============================================================================
// Types
// ============================================================================
export type {
  UsageReport,
  MeetingLimitCheck,
  CustomerState,
  PolarCustomerResult,
} from "./types";

// ============================================================================
// Constants
// ============================================================================
export { USAGE_EVENTS } from "./constants";

// ============================================================================
// Idempotency Key Generation
// ============================================================================
export {
  generateMinutesIdempotencyKey,
  generateDraftIdempotencyKey,
} from "./idempotency";

// ============================================================================
// Customer Utilities
// ============================================================================
export {
  getPolarCustomer,
  getOrCreatePolarCustomer,
  ensureCustomerExists,
} from "./customer";

// ============================================================================
// Usage Sync Helpers
// ============================================================================
export {
  scheduleUsageSync,
  syncUsageFromPolar,
  forceRefreshUsage,
} from "./sync";

// ============================================================================
// Usage Ingestion Functions
// ============================================================================
export {
  reportMeetingMinutes,
  reportEmailDraft,
  reportStorageChange,
} from "./ingest";

// ============================================================================
// Generic Limit Check Strategy
// ============================================================================
export type { LimitCheckConfig } from "./limit-check";
export { checkUsageLimit } from "./limit-check";

// ============================================================================
// Customer State & Limit Check Functions
// ============================================================================
export {
  getCustomerState,
  canUserStartMeeting,
  canUserCreateEmailDraft,
} from "./customer-state";
