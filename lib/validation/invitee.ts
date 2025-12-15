/**
 * Invitee Validation Schemas
 *
 * Validation utilities for meeting invitations and RSVP operations.
 */

import { MAX_INVITEES_PER_MEETING } from "@/types/invitee";
import type { RSVPStatus, InviteeInput } from "@/types/invitee";

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid RSVP statuses.
 */
export const VALID_RSVP_STATUSES: RSVPStatus[] = [
  "pending",
  "accepted",
  "declined",
  "tentative",
];

/**
 * Maximum length for invitee name.
 */
export const MAX_NAME_LENGTH = 100;

/**
 * Maximum length for email.
 */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Maximum number of emails that can be invited at once.
 */
export const MAX_BATCH_SIZE = 50;

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Email validation regex (RFC 5322 simplified).
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a single email address.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_EMAIL_LENGTH &&
    EMAIL_REGEX.test(trimmed)
  );
}

/**
 * Normalize an email address (lowercase, trimmed).
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ============================================================================
// Validation Results
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface InviteValidationResult extends ValidationResult {
  validEmails: string[];
  invalidEmails: Array<{ email: string; reason: string }>;
}

// ============================================================================
// Invite Validation
// ============================================================================

/**
 * Validate invite request input.
 */
export function validateInviteRequest(input: {
  emails?: unknown;
  names?: unknown;
  sendEmails?: unknown;
}): InviteValidationResult {
  // Check emails is an array
  if (!Array.isArray(input.emails)) {
    return {
      isValid: false,
      error: "emails must be an array",
      validEmails: [],
      invalidEmails: [],
    };
  }

  // Check array is not empty
  if (input.emails.length === 0) {
    return {
      isValid: false,
      error: "At least one email is required",
      validEmails: [],
      invalidEmails: [],
    };
  }

  // Check batch size limit
  if (input.emails.length > MAX_BATCH_SIZE) {
    return {
      isValid: false,
      error: `Cannot invite more than ${MAX_BATCH_SIZE} people at once`,
      validEmails: [],
      invalidEmails: [],
    };
  }

  // Validate each email
  const validEmails: string[] = [];
  const invalidEmails: Array<{ email: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const email of input.emails) {
    if (typeof email !== "string") {
      invalidEmails.push({ email: String(email), reason: "Invalid email format" });
      continue;
    }

    const normalized = normalizeEmail(email);

    // Check for duplicates
    if (seen.has(normalized)) {
      invalidEmails.push({ email, reason: "Duplicate email" });
      continue;
    }

    // Validate format
    if (!isValidEmail(normalized)) {
      invalidEmails.push({ email, reason: "Invalid email format" });
      continue;
    }

    seen.add(normalized);
    validEmails.push(normalized);
  }

  // Check if we have any valid emails
  if (validEmails.length === 0) {
    return {
      isValid: false,
      error: "No valid email addresses provided",
      validEmails: [],
      invalidEmails,
    };
  }

  // Validate names if provided
  if (input.names !== undefined && input.names !== null) {
    if (typeof input.names !== "object" || Array.isArray(input.names)) {
      return {
        isValid: false,
        error: "names must be an object mapping emails to names",
        validEmails: [],
        invalidEmails: [],
      };
    }

    // Validate name lengths
    for (const [email, name] of Object.entries(input.names)) {
      if (typeof name === "string" && name.length > MAX_NAME_LENGTH) {
        return {
          isValid: false,
          error: `Name for ${email} exceeds maximum length of ${MAX_NAME_LENGTH}`,
          validEmails: [],
          invalidEmails: [],
        };
      }
    }
  }

  return {
    isValid: true,
    validEmails,
    invalidEmails,
  };
}

/**
 * Validate RSVP status update.
 */
export function validateRsvpStatus(status: unknown): ValidationResult {
  if (typeof status !== "string") {
    return {
      isValid: false,
      error: "status must be a string",
    };
  }

  if (!VALID_RSVP_STATUSES.includes(status as RSVPStatus)) {
    return {
      isValid: false,
      error: `status must be one of: ${VALID_RSVP_STATUSES.join(", ")}`,
    };
  }

  return { isValid: true };
}

/**
 * Validate RSVP token format.
 * Tokens are base64url encoded (32 characters, alphanumeric plus - and _).
 */
export function isValidRsvpToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  // Token is 32 base64url characters (A-Za-z0-9, -, _)
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

/**
 * Convert validated input to InviteeInput array.
 */
export function toInviteeInputs(
  emails: string[],
  names?: Record<string, string>
): InviteeInput[] {
  return emails.map((email) => ({
    email: normalizeEmail(email),
    name: names?.[email] || names?.[normalizeEmail(email)] || undefined,
  }));
}

/**
 * Check if adding more invitees would exceed the limit.
 */
export function canAddMoreInvitees(
  currentCount: number,
  toAdd: number
): ValidationResult {
  const newTotal = currentCount + toAdd;
  if (newTotal > MAX_INVITEES_PER_MEETING) {
    return {
      isValid: false,
      error: `Cannot exceed ${MAX_INVITEES_PER_MEETING} invitees per meeting. Current: ${currentCount}, trying to add: ${toAdd}`,
    };
  }
  return { isValid: true };
}
