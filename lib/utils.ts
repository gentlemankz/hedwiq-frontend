import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns initials from a name (max 2 characters)
 * @param name - The full name to extract initials from
 * @returns Uppercase initials (e.g., "John Doe" -> "JD")
 */
export function getInitials(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .split(" ")
    .filter((n) => n.length > 0)
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generates a deterministic hash number from a string identifier.
 * Uses djb2 algorithm for consistent distribution.
 * @param identifier - A unique string identifier
 * @returns A positive integer hash value
 */
function hashString(identifier: string): number {
  if (!identifier || typeof identifier !== "string") return 0;
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/** Available avatar images with matching color names */
const AVATAR_IMAGES = [
  "/blue_avatar.webp",
  "/green_avatar.webp",
  "/orange_avatar.webp",
  "/purple_avatar.webp",
  "/red_avatar.webp",
] as const;

/** Tailwind background colors matching avatar images for fallback consistency */
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-red-500",
] as const;

/**
 * Generates a consistent avatar image path for a given identifier.
 * Uses a hash function to ensure the same identifier always gets the same avatar.
 * @param identifier - A unique string identifier (e.g., user ID, participant identity)
 * @returns A path to one of the avatar images
 */
export function getHashedAvatar(identifier: string): string {
  const hash = hashString(identifier);
  return AVATAR_IMAGES[hash % AVATAR_IMAGES.length];
}

/**
 * Generates a consistent color class for a given identifier.
 * Colors are synchronized with avatar images for visual consistency.
 * @param identifier - A unique string identifier (e.g., user ID, participant identity)
 * @returns A Tailwind background color class
 */
export function getHashedColor(identifier: string): string {
  const hash = hashString(identifier);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ============================================================================
// ID Generation Utilities
// ============================================================================

/**
 * Generates a cryptographically secure random string.
 * Uses Web Crypto API for secure randomness.
 * @param length - Length of the random string
 * @param charset - Characters to use for the string
 * @returns A random string of the specified length
 */
export function secureRandomString(length: number, charset: string): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (num) => charset[num % charset.length]).join("");
}

/** Default charset for alphanumeric IDs */
const ALPHANUMERIC_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Lowercase letters only charset for room IDs */
const LOWERCASE_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Generates a unique ID with a prefix and timestamp.
 * Format: {prefix}-{timestamp_base36}-{random_8_chars}
 * @param prefix - Prefix for the ID (e.g., "cal", "cevt", "mtg")
 * @returns A unique ID string
 */
export function generatePrefixedId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, ALPHANUMERIC_CHARSET);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generates a random room ID in the format "abc-defg-hij".
 * Uses cryptographically secure random values.
 * This function can be used client-side or server-side.
 * @returns A random room ID string
 */
export function generateRoomId(): string {
  const segments = [3, 4, 3];
  return segments
    .map((len) => secureRandomString(len, LOWERCASE_LETTERS))
    .join("-");
}

// ============================================================================
// Duration Formatting Utilities
// ============================================================================

/**
 * Formats a duration in minutes to a human-readable string.
 * Examples:
 * - 30 -> "30 minutes"
 * - 60 -> "1 hour"
 * - 90 -> "1 hour 30 min"
 * - 120 -> "2 hours"
 * @param minutes - Duration in minutes
 * @returns Formatted duration string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  const hourStr = `${hours} hour${hours > 1 ? "s" : ""}`;
  if (remainingMinutes === 0) {
    return hourStr;
  }

  return `${hourStr} ${remainingMinutes} min`;
}

/**
 * Formats a timestamp to a relative time string (e.g., "2 min ago", "1 hour ago").
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  if (days < 7) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  // For older timestamps, show the date
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a duration in minutes to a compact string (e.g., "30 min", "1h 30m").
 * Shorter format suitable for badges and compact displays.
 * @param minutes - Duration in minutes (null returns "< 1 min")
 * @returns Formatted duration string
 */
export function formatDurationCompact(minutes: number | null): string {
  if (!minutes || minutes === 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Formats a date string to a localized date display.
 * @param dateString - ISO date string or null
 * @returns Formatted date string (e.g., "Mon, Dec 16, 2024")
 */
export function formatMeetingDate(dateString: string | null): string {
  if (!dateString) return "Unknown date";
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats a date string to time only.
 * @param dateString - ISO date string or null
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatMeetingTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
