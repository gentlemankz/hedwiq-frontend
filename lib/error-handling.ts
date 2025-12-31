/**
 * Error Handling Utilities
 *
 * SECURITY FIX (Medium #15): Provides consistent, safe error handling
 * that prevents internal error details from being exposed to clients.
 *
 * @module lib/error-handling
 */

// ============================================================================
// Types
// ============================================================================

export interface SafeError {
  /** User-friendly error message (safe to display) */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** HTTP status code */
  status: number;
}

// ============================================================================
// Error Messages
// ============================================================================

/**
 * Standard error messages that are safe to show to users.
 * These don't expose any internal implementation details.
 */
export const ERROR_MESSAGES = {
  // Generic errors
  INTERNAL_ERROR: "An unexpected error occurred. Please try again.",
  INVALID_REQUEST: "Invalid request. Please check your input.",
  UNAUTHORIZED: "You must be signed in to perform this action.",
  FORBIDDEN: "You don't have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  RATE_LIMITED: "Too many requests. Please try again later.",

  // Auth-specific errors
  INVALID_CREDENTIALS: "Invalid email or password.",
  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  ACCOUNT_LOCKED: "Your account has been temporarily locked. Please try again later.",

  // Meeting-specific errors
  MEETING_NOT_FOUND: "Meeting not found.",
  SESSION_CREATE_FAILED: "Failed to join meeting. Please try again.",
  SESSION_LIMIT_REACHED: "You have too many active sessions. Please leave a meeting first.",
  LIMIT_EXCEEDED: "You have reached your usage limit. Please upgrade your plan.",

  // Validation errors
  INVALID_INPUT: "Invalid input. Please check your data and try again.",
  MISSING_REQUIRED_FIELD: "Required field is missing.",
} as const;

// ============================================================================
// Error Sanitization
// ============================================================================

/**
 * Patterns that indicate internal error details that should NOT be exposed.
 * These patterns match common error messages from databases, libraries, etc.
 */
const SENSITIVE_PATTERNS = [
  /database/i,
  /sql/i,
  /postgres/i,
  /mysql/i,
  /mongodb/i,
  /redis/i,
  /connection/i,
  /timeout/i,
  /econnrefused/i,
  /stack/i,
  /trace/i,
  /at\s+\w+\s+\(/i, // Stack trace pattern
  /node_modules/i,
  /internal/i,
  /server/i,
  /failed to/i,
  /cannot/i,
  /unable to/i,
  /exception/i,
  /error:/i,
  /errno/i,
  /code:/i,
];

/**
 * Check if an error message contains sensitive information.
 *
 * @param message - The error message to check
 * @returns Whether the message contains sensitive info
 */
function containsSensitiveInfo(message: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Sanitize an error for safe client exposure.
 *
 * This function:
 * 1. Logs the full error for debugging (server-side only)
 * 2. Returns a safe error message for the client
 *
 * @param error - The error to sanitize
 * @param context - Context for logging (e.g., "Session API")
 * @param fallbackMessage - Fallback message if error can't be safely exposed
 * @returns Safe error object
 */
export function sanitizeError(
  error: unknown,
  context: string = "API",
  fallbackMessage: string = ERROR_MESSAGES.INTERNAL_ERROR
): SafeError {
  // Log the full error for debugging
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log with context but without PII
  console.error(
    `[${context}] Error occurred:`,
    {
      message: errorMessage,
      type: error instanceof Error ? error.constructor.name : typeof error,
      // Only include stack in development
      ...(process.env.NODE_ENV === "development" && errorStack
        ? { stack: errorStack }
        : {}),
    }
  );

  // Check if the error message is safe to expose
  if (
    error instanceof Error &&
    !containsSensitiveInfo(error.message)
  ) {
    return {
      message: error.message,
      status: 500,
    };
  }

  // Return safe fallback
  return {
    message: fallbackMessage,
    status: 500,
  };
}

/**
 * Create a safe error response for API endpoints.
 *
 * @param error - The error to handle
 * @param context - Context for logging
 * @param fallback - Fallback message
 * @returns Object with error and status for NextResponse.json()
 */
export function createSafeErrorResponse(
  error: unknown,
  context: string = "API",
  fallback: string = ERROR_MESSAGES.INTERNAL_ERROR
): { body: { error: string }; status: number } {
  const safeError = sanitizeError(error, context, fallback);
  return {
    body: { error: safeError.message },
    status: safeError.status,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a value is a non-empty string.
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error message
 * @returns Validation result
 */
export function validateRequiredString(
  value: unknown,
  fieldName: string
): { valid: true; value: string } | { valid: false; error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      valid: false,
      error: `${fieldName} is required`,
    };
  }
  return { valid: true, value: value.trim() };
}

/**
 * Validate that a value is a positive number.
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error message
 * @returns Validation result
 */
export function validatePositiveNumber(
  value: unknown,
  fieldName: string
): { valid: true; value: number } | { valid: false; error: string } {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    return {
      valid: false,
      error: `${fieldName} must be a positive number`,
    };
  }
  return { valid: true, value: num };
}
