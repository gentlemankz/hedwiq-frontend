/**
 * Polar Usage Idempotency Key Generation
 *
 * Helpers for generating idempotency keys to prevent duplicate usage tracking.
 */

// ============================================================================
// Idempotency Key Generation
// ============================================================================

/**
 * Interval for grouping meeting minute reports for idempotency (5 minutes).
 * Reports within the same 5-minute window with same roomId/sessionId will be deduped.
 */
const MINUTES_IDEMPOTENCY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Generate an idempotency key for meeting minutes reporting.
 * Key format: `minutes:${identifier}:${intervalBucket}`
 *
 * This prevents duplicate counting when:
 * - Network retries happen
 * - Agent periodic reporter fires multiple times in same interval
 *
 * @param sessionId - Meeting session ID (preferred) or roomId as fallback
 * @param roomId - Room ID as fallback identifier
 * @param timestamp - Optional timestamp (defaults to now)
 */
export function generateMinutesIdempotencyKey(
  sessionId?: string,
  roomId?: string,
  timestamp?: number
): string | undefined {
  const identifier = sessionId || roomId;
  if (!identifier) return undefined;

  const ts = timestamp ?? Date.now();
  const intervalBucket = Math.floor(ts / MINUTES_IDEMPOTENCY_INTERVAL_MS);
  return `minutes:${identifier}:${intervalBucket}`;
}

/**
 * Generate an idempotency key for email draft reporting.
 * Key format: `draft:${meetingId}:${actionId || timestamp}`
 *
 * This prevents duplicate counting when retries happen.
 *
 * @param meetingId - The meeting ID where draft was generated
 * @param actionId - Optional unique action ID
 * @param timestamp - Optional timestamp (defaults to now)
 */
export function generateDraftIdempotencyKey(
  meetingId?: string,
  actionId?: string,
  timestamp?: number
): string | undefined {
  if (!meetingId) return undefined;

  const uniquePart = actionId || String(timestamp ?? Date.now());
  return `draft:${meetingId}:${uniquePart}`;
}
