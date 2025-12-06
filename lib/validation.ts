/**
 * Validation utilities for user input
 * @module lib/validation
 */

// ============================================================================
// Username validation constants
// ============================================================================

/** Minimum length for a username */
export const USERNAME_MIN_LENGTH = 1;

/** Maximum length for a username */
export const USERNAME_MAX_LENGTH = 50;

/**
 * Pattern for valid usernames.
 * Allows Unicode letters, numbers, spaces, hyphens, apostrophes, and periods.
 * Uses Unicode property escapes for international character support.
 */
export const USERNAME_PATTERN = /^[\p{L}\p{N}\s\-'.]+$/u;

// ============================================================================
// Room ID validation constants
// ============================================================================

/** Minimum length for a room ID */
export const ROOM_ID_MIN_LENGTH = 1;

/** Maximum length for a room ID */
export const ROOM_ID_MAX_LENGTH = 100;

/**
 * Strict pattern for room IDs - matches format "abc-defg-hij" (lowercase only)
 * Used for generated room IDs
 */
export const ROOM_ID_STRICT_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/**
 * Loose pattern for room IDs - alphanumeric, hyphens, underscores
 * Used for user-provided room IDs
 */
export const ROOM_ID_LOOSE_PATTERN = /^[a-zA-Z0-9\-_]+$/;

// ============================================================================
// Image URL validation constants
// ============================================================================

/** Allowed protocols for image URLs */
const ALLOWED_IMAGE_PROTOCOLS = ["https:"];

/** Allowed image domains (expand as needed) */
const ALLOWED_IMAGE_DOMAINS = [
  "lh3.googleusercontent.com", // Google profile images
  "avatars.githubusercontent.com", // GitHub avatars
  "cdn.discordapp.com", // Discord avatars
  "pbs.twimg.com", // Twitter profile images
  "platform-lookaside.fbsbx.com", // Facebook profile images
  "graph.facebook.com", // Facebook Graph API images
];

// ============================================================================
// Types
// ============================================================================

/** Result of a validation check */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// ============================================================================
// Username validation
// ============================================================================

/**
 * Validates a username/display name.
 *
 * @param username - The username to validate
 * @returns Validation result with isValid flag and optional error message
 *
 * @example
 * ```ts
 * const result = validateUsername("John Doe");
 * if (!result.isValid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateUsername(username: string): ValidationResult {
  const trimmed = username.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: "Display name is required",
    };
  }

  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Display name must be ${USERNAME_MAX_LENGTH} characters or less`,
    };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      error:
        "Display name can only contain letters, numbers, spaces, hyphens, apostrophes, and periods",
    };
  }

  return { isValid: true };
}

/**
 * Sanitizes a username by trimming whitespace and limiting length.
 * Should be called before sending to the server.
 *
 * @param username - The username to sanitize
 * @returns Sanitized username
 */
export function sanitizeUsername(username: string): string {
  return username.trim().slice(0, USERNAME_MAX_LENGTH);
}

// ============================================================================
// Room ID validation
// ============================================================================

/**
 * Validates a room ID.
 *
 * @param roomId - The room ID to validate
 * @param strict - If true, requires format "abc-defg-hij" (default: false)
 * @returns Validation result with isValid flag and optional error message
 *
 * @example
 * ```ts
 * // Loose validation (user input)
 * const result = validateRoomId("my-room-123");
 *
 * // Strict validation (generated room IDs)
 * const result = validateRoomId("abc-defg-hij", true);
 * ```
 */
export function validateRoomId(
  roomId: string,
  strict = false
): ValidationResult {
  const trimmed = roomId.trim();

  if (trimmed.length < ROOM_ID_MIN_LENGTH) {
    return {
      isValid: false,
      error: "Room ID is required",
    };
  }

  if (trimmed.length > ROOM_ID_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Room ID must be ${ROOM_ID_MAX_LENGTH} characters or less`,
    };
  }

  if (strict) {
    if (!ROOM_ID_STRICT_PATTERN.test(trimmed)) {
      return {
        isValid: false,
        error: "Room ID must be in format: abc-defg-hij",
      };
    }
  } else {
    if (!ROOM_ID_LOOSE_PATTERN.test(trimmed)) {
      return {
        isValid: false,
        error:
          "Room ID can only contain letters, numbers, hyphens, and underscores",
      };
    }
  }

  return { isValid: true };
}

/**
 * Sanitizes a room ID by trimming whitespace.
 * Only normalizes to lowercase if explicitly requested (for app-generated IDs).
 *
 * LiveKit treats room names as arbitrary unique strings, so user-provided
 * IDs should preserve their original case to allow joining rooms with
 * intentional uppercase characters.
 *
 * @param roomId - The room ID to sanitize
 * @param lowercase - If true, converts to lowercase (use for app-generated IDs only)
 * @returns Sanitized room ID
 */
export function sanitizeRoomId(roomId: string, lowercase = false): string {
  const trimmed = roomId.trim();
  return lowercase ? trimmed.toLowerCase() : trimmed;
}

// ============================================================================
// Image URL validation
// ============================================================================

/**
 * Validates an image URL for security.
 * Checks protocol and domain against allowlist.
 *
 * @param url - The image URL to validate
 * @returns true if the URL is safe, false otherwise
 *
 * @example
 * ```ts
 * if (isValidImageUrl(userImage)) {
 *   // Safe to use in metadata
 * }
 * ```
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Check protocol
    if (!ALLOWED_IMAGE_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    // Check domain against allowlist
    if (!ALLOWED_IMAGE_DOMAINS.includes(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL
    return false;
  }
}
