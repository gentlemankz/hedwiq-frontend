/**
 * Meeting Data Helpers
 *
 * Utility functions used across meeting data persistence.
 */

import { randomUUID } from "crypto";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Split an array into chunks of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a cryptographically secure unique ID with a prefix.
 *
 * SECURITY FIX: Previous implementation used Math.random() which is NOT
 * cryptographically secure and can be predicted. Now uses crypto.randomUUID()
 * which provides 122 bits of entropy from a cryptographic RNG.
 *
 * @param prefix - Prefix for the ID (e.g., "sess", "note")
 * @returns A unique ID in the format "{prefix}-{uuid}"
 */
export function generateId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
