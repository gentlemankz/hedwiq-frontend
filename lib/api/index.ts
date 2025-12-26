/**
 * API Utilities
 *
 * Server-side utilities for API routes including error handling
 * and feature gating.
 *
 * @module lib/api
 */

// Error handling utilities
export {
  APIError,
  ErrorCodes,
  type ErrorCode,
  type APIErrorOptions,
  // Factory functions
  unauthorized,
  forbidden,
  featureLocked,
  quotaExceeded,
  notFound,
  validationError,
  internalError,
  rateLimited,
  // Handler
  handleAPIError,
} from "./errors";

// Feature gating utilities
export {
  // Types
  type UserSubscription,
  type FeatureGuardResult,
  type UsageCheckResult,
  // Core functions
  getUserSubscription,
  checkFeatureAccess,
  requireFeature,
  requireAuth,
  requireTier,
  // Usage checking
  checkUsageQuota,
  requireUsageQuota,
  // HOC wrapper
  withFeatureGuard,
} from "./feature-guard";
