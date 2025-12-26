/**
 * API Error Classes
 *
 * Standardized error handling for API routes.
 * Provides consistent error responses across the application.
 *
 * @module lib/api/errors
 */

import { NextResponse } from "next/server";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standard error codes for API responses.
 * These codes help clients handle errors programmatically.
 */
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INVALID_TOKEN: "INVALID_TOKEN",

  // Authorization errors
  FORBIDDEN: "FORBIDDEN",
  FEATURE_LOCKED: "FEATURE_LOCKED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  ACCESS_DENIED: "ACCESS_DENIED",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// APIError Class
// ============================================================================

export interface APIErrorOptions {
  /** Additional details about the error */
  details?: Record<string, unknown>;
  /** Whether to log this error on the server */
  shouldLog?: boolean;
  /** Suggested action for the client */
  suggestion?: string;
  /** For FEATURE_LOCKED: the required tier */
  requiredTier?: string;
  /** For FEATURE_LOCKED: the locked feature */
  feature?: string;
}

/**
 * Custom API error class with consistent structure.
 *
 * @example
 * ```ts
 * throw new APIError("User not found", 404, "NOT_FOUND");
 *
 * throw new APIError(
 *   "Email drafts require Pro plan",
 *   403,
 *   "FEATURE_LOCKED",
 *   { requiredTier: "pro", feature: "email_drafts" }
 * );
 * ```
 */
export class APIError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly shouldLog: boolean;
  public readonly suggestion?: string;
  public readonly requiredTier?: string;
  public readonly feature?: string;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    options: APIErrorOptions = {}
  ) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.shouldLog = options.shouldLog ?? statusCode >= 500;
    this.suggestion = options.suggestion;
    this.requiredTier = options.requiredTier;
    this.feature = options.feature;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIError);
    }
  }

  /**
   * Convert the error to a JSON-serializable object.
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
      ...(this.suggestion && { suggestion: this.suggestion }),
      ...(this.requiredTier && { requiredTier: this.requiredTier }),
      ...(this.feature && { feature: this.feature }),
    };
  }

  /**
   * Convert the error to a NextResponse.
   */
  toResponse(): NextResponse {
    return NextResponse.json(this.toJSON(), { status: this.statusCode });
  }
}

// ============================================================================
// Factory Functions for Common Errors
// ============================================================================

/**
 * Create an unauthorized error (401).
 */
export function unauthorized(message = "Authentication required"): APIError {
  return new APIError(message, 401, ErrorCodes.UNAUTHORIZED, {
    suggestion: "Please sign in to continue",
  });
}

/**
 * Create a forbidden error (403).
 */
export function forbidden(message = "Access denied"): APIError {
  return new APIError(message, 403, ErrorCodes.FORBIDDEN);
}

/**
 * Create a feature locked error (403).
 */
export function featureLocked(
  feature: string,
  requiredTier: string,
  featureDisplayName?: string
): APIError {
  const displayName = featureDisplayName ?? feature.replace(/_/g, " ");
  return new APIError(
    `${displayName} requires ${requiredTier} plan or higher`,
    403,
    ErrorCodes.FEATURE_LOCKED,
    {
      requiredTier,
      feature,
      suggestion: `Upgrade to ${requiredTier} to access this feature`,
    }
  );
}

/**
 * Create a quota exceeded error (403).
 */
export function quotaExceeded(
  resource: string,
  limit: number,
  current: number
): APIError {
  return new APIError(
    `${resource} quota exceeded`,
    403,
    ErrorCodes.QUOTA_EXCEEDED,
    {
      details: { limit, current },
      suggestion: "Upgrade your plan for higher limits",
    }
  );
}

/**
 * Create a not found error (404).
 */
export function notFound(resource = "Resource"): APIError {
  return new APIError(`${resource} not found`, 404, ErrorCodes.NOT_FOUND);
}

/**
 * Create a validation error (400).
 */
export function validationError(
  message: string,
  details?: Record<string, unknown>
): APIError {
  return new APIError(message, 400, ErrorCodes.VALIDATION_ERROR, { details });
}

/**
 * Create an internal server error (500).
 */
export function internalError(message = "Internal server error"): APIError {
  return new APIError(message, 500, ErrorCodes.INTERNAL_ERROR, {
    shouldLog: true,
  });
}

/**
 * Create a rate limited error (429).
 */
export function rateLimited(retryAfterSeconds?: number): APIError {
  return new APIError("Too many requests", 429, ErrorCodes.RATE_LIMITED, {
    details: retryAfterSeconds ? { retryAfter: retryAfterSeconds } : undefined,
    suggestion: "Please try again later",
  });
}

// ============================================================================
// Error Handler Utility
// ============================================================================

/**
 * Handle errors in API routes and convert them to appropriate responses.
 *
 * @example
 * ```ts
 * export async function GET(request: Request) {
 *   try {
 *     // ... route logic
 *   } catch (error) {
 *     return handleAPIError(error);
 *   }
 * }
 * ```
 */
export function handleAPIError(error: unknown): NextResponse {
  // If it's already an APIError, use its response
  if (error instanceof APIError) {
    if (error.shouldLog) {
      console.error(`[API Error] ${error.code}:`, error.message, error.details);
    }
    return error.toResponse();
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    console.error("[API Error] Unhandled:", error.message, error.stack);
    return new APIError(
      "An unexpected error occurred",
      500,
      ErrorCodes.INTERNAL_ERROR
    ).toResponse();
  }

  // Handle unknown error types
  console.error("[API Error] Unknown error type:", error);
  return new APIError(
    "An unexpected error occurred",
    500,
    ErrorCodes.INTERNAL_ERROR
  ).toResponse();
}
