/**
 * Meeting Data Constants
 *
 * Constants used across meeting data persistence functions.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum rows per batch insert to avoid PostgreSQL parameter limits.
 * PostgreSQL has a limit of ~65535 parameters per query.
 * With ~10-15 columns per row, 100 rows keeps us well under the limit.
 */
export const BATCH_INSERT_CHUNK_SIZE = 100;

/**
 * Maximum session duration in seconds (8 hours = 28800 seconds).
 *
 * SECURITY FIX (High #8): Server-side duration validation.
 * This prevents:
 * 1. Clock manipulation attacks where clients try to report unrealistic durations
 * 2. Orphaned sessions that were never properly ended from accumulating unbounded time
 * 3. Billing abuse from impossibly long session durations
 *
 * 8 hours is chosen as a reasonable maximum for any single meeting session.
 * Sessions exceeding this are capped and logged for investigation.
 */
export const MAX_SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 hours

/**
 * Warning threshold for session duration (2 hours = 7200 seconds).
 * Sessions longer than this are logged for monitoring but not capped.
 */
export const WARN_SESSION_DURATION_SECONDS = 2 * 60 * 60; // 2 hours

/**
 * SECURITY FIX (Medium #10): Maximum concurrent sessions per user.
 *
 * Prevents abuse where users could:
 * 1. Open many tabs to multiply their meeting time (gaming billing)
 * 2. Exhaust server resources with excessive connections
 * 3. Create denial-of-service conditions
 *
 * 5 concurrent sessions allows legitimate use cases:
 * - Multiple devices (laptop + tablet + phone)
 * - Multiple meetings simultaneously
 * - Browser refresh during a meeting (brief overlap)
 */
export const MAX_CONCURRENT_SESSIONS_PER_USER = 5;

/**
 * SECURITY FIX #10: Default reservation block size in minutes.
 * Each session reserves this many minutes upfront to prevent over-consumption.
 * If the user has less remaining, we reserve what they have.
 */
export const DEFAULT_RESERVATION_MINUTES = 30;
