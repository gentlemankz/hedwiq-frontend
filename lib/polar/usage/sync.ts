/**
 * Polar Usage Sync Helpers
 *
 * Functions for syncing usage data between Polar and local cache:
 * - Scheduled sync with debouncing
 * - Immediate sync
 * - Force refresh
 */

import type { CustomerState } from "./types";

// ============================================================================
// Usage Sync Helpers
// ============================================================================

/**
 * Pending sync timeouts per user
 * Used to debounce multiple sync requests in long-lived runtimes
 */
const pendingSyncs = new Map<string, NodeJS.Timeout>();

/**
 * Detect if running in a serverless environment where setTimeout won't survive request completion.
 * In serverless (Vercel, AWS Lambda, etc.), the process is torn down after request completion,
 * so setTimeout callbacks scheduled during a request may never execute.
 *
 * @returns true if running in serverless environment
 */
function isServerlessRuntime(): boolean {
  // Vercel serverless functions
  if (process.env.VERCEL === "1") return true;

  // AWS Lambda
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;

  // Netlify Functions
  if (process.env.NETLIFY === "true") return true;

  // Generic serverless indicator
  if (process.env.SERVERLESS === "true") return true;

  return false;
}

/**
 * Schedule a usage sync for a user after a delay.
 * Multiple calls within the delay period are debounced to a single sync.
 *
 * ## Serverless Environment Behavior
 *
 * In serverless environments (Vercel, Lambda, Netlify), this function returns `false`
 * and does NOT schedule a sync. setTimeout callbacks may not execute because the
 * process is torn down after the response is sent.
 *
 * **Cache staleness implications:**
 * - After usage events are ingested, the cache may not reflect the new values
 * - Consumers relying on cached usage (UI displays, limit checks that fall back
 *   to cache on API errors) will see stale data until the next explicit
 *   `getCustomerState()` call succeeds
 * - For limit checks, this is generally acceptable because:
 *   1. Fresh data is fetched from Polar API when available
 *   2. Cache is only used as fallback when API fails
 *   3. Stale cache errs on the side of allowing access (better UX than blocking)
 *
 * **Recommendations for callers:**
 * - Check the return value; if `false`, consider calling `syncUsageFromPolar()`
 *   explicitly if fresh cache data is critical
 * - For accurate UI display, call `syncUsageFromPolar()` or `getCustomerState()`
 *   explicitly after operations that change usage
 * - For limit checks before operations, rely on `canUserStartMeeting()` which
 *   always tries to fetch fresh data from Polar
 *
 * @param userId - The user's ID
 * @param delayMs - Delay before syncing (default 5000ms to let Polar process and aggregate)
 * @returns `true` if sync was scheduled, `false` if skipped (serverless environment)
 */
export function scheduleUsageSync(userId: string, delayMs: number = 5000): boolean {
  // In serverless, setTimeout won't survive - skip scheduling
  // Return false so callers can react if needed (e.g., call syncUsageFromPolar explicitly)
  if (isServerlessRuntime()) {
    return false;
  }

  // Clear any existing pending sync for this user
  const existingTimeout = pendingSyncs.get(userId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Schedule new sync (only in long-lived Node.js runtimes)
  const timeout = setTimeout(async () => {
    pendingSyncs.delete(userId);

    try {
      // Fetch fresh state from Polar and update cache
      await syncUsageFromPolar(userId);
      console.debug("[Polar Usage] Scheduled sync completed");
    } catch (error) {
      console.error("[Polar Usage] Scheduled sync failed:", error instanceof Error ? error.message : "Unknown");
    }
  }, delayMs);

  pendingSyncs.set(userId, timeout);
  return true;
}

/**
 * Immediately sync usage from Polar to the database cache.
 *
 * Use this when you need to ensure the cache reflects current usage,
 * especially in serverless environments where `scheduleUsageSync` is a no-op.
 *
 * **When to call this:**
 * - After operations that change usage and you need to display updated values
 * - When the UI needs to show fresh usage data
 * - NOT needed for limit checks (they fetch fresh data automatically)
 *
 * @param userId - The user's ID
 * @returns The updated customer state, or null if sync failed
 */
export async function syncUsageFromPolar(userId: string): Promise<CustomerState | null> {
  // Dynamic import to avoid circular dependency
  const { getCustomerState } = await import("./customer-state");

  // getCustomerState already updates the cache on success
  const state = await getCustomerState(userId);

  if (state) {
    console.debug(
      `[Polar Usage] Sync complete: minutes=${state.minutesUsed}, emails=${state.emailDraftsUsed}`
    );
  }

  return state;
}

/**
 * Force refresh usage for a user, bypassing any caching.
 * This is useful when you need to ensure the latest data from Polar.
 *
 * @param userId - The user's ID
 * @returns Fresh customer state from Polar
 */
export async function forceRefreshUsage(userId: string): Promise<CustomerState | null> {
  return syncUsageFromPolar(userId);
}
