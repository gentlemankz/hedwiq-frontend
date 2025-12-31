/**
 * Environment Detection Utilities
 *
 * SECURITY FIX #4: Multi-factor production detection
 *
 * NODE_ENV alone is not reliable because it can be accidentally misconfigured.
 * We check multiple indicators to determine if we're in production.
 *
 * This module consolidates production detection logic that was previously
 * duplicated across:
 * - lib/api/feature-guard.ts
 * - lib/rate-limit.ts
 * - lib/db/meeting-data.ts
 *
 * @module lib/env-detection
 */

// ============================================================================
// Types
// ============================================================================

export interface ProductionCheckResult {
  /** Whether the environment is considered production */
  isProduction: boolean;
  /** List of indicators that detected production */
  indicators: string[];
}

// ============================================================================
// Production Detection
// ============================================================================

/**
 * Detect if we're running in a production environment.
 *
 * Checks multiple indicators because NODE_ENV alone is not reliable:
 * - NODE_ENV === "production"
 * - VERCEL_ENV === "production" (Vercel deployments)
 * - RAILWAY_ENVIRONMENT === "production" (Railway deployments)
 * - PRODUCTION_MODE === "true" (explicit flag for other platforms)
 * - Presence of production-specific env vars (LIVEKIT_URL with non-localhost domain)
 *
 * If ANY of these indicate production, we treat it as production.
 *
 * @returns Result with isProduction boolean and list of indicators
 */
export function detectProductionEnvironment(): ProductionCheckResult {
  const indicators: string[] = [];

  // Check NODE_ENV
  if (process.env.NODE_ENV === "production") {
    indicators.push("NODE_ENV=production");
  }

  // Check platform-specific env vars
  if (process.env.VERCEL_ENV === "production") {
    indicators.push("VERCEL_ENV=production");
  }
  if (process.env.RAILWAY_ENVIRONMENT === "production") {
    indicators.push("RAILWAY_ENVIRONMENT=production");
  }

  // Check explicit production flag
  if (process.env.PRODUCTION_MODE === "true") {
    indicators.push("PRODUCTION_MODE=true");
  }

  // Check for production-like configuration
  // If LIVEKIT_URL is a non-localhost URL, assume production
  const livekitUrl = process.env.LIVEKIT_URL || "";
  if (
    livekitUrl &&
    !livekitUrl.includes("localhost") &&
    !livekitUrl.includes("127.0.0.1") &&
    livekitUrl.startsWith("wss://")
  ) {
    indicators.push("LIVEKIT_URL=production-domain");
  }

  // Check for production database (non-localhost)
  const dbUrl = process.env.DATABASE_URL || "";
  if (
    dbUrl &&
    !dbUrl.includes("localhost") &&
    !dbUrl.includes("127.0.0.1") &&
    !dbUrl.includes("::1")
  ) {
    indicators.push("DATABASE_URL=remote");
  }

  return {
    isProduction: indicators.length > 0,
    indicators,
  };
}

// ============================================================================
// Cached Results (computed once at module load)
// ============================================================================

const _productionCheck = detectProductionEnvironment();

/**
 * Whether the current environment is production.
 * Cached at module load time for performance.
 */
export const IS_PRODUCTION = _productionCheck.isProduction;

/**
 * Whether the current environment is development.
 * True only if NOT production AND NODE_ENV is "development".
 */
export const IS_DEVELOPMENT = !IS_PRODUCTION && process.env.NODE_ENV === "development";

/**
 * List of indicators that detected production environment.
 * Empty if not in production.
 */
export const PRODUCTION_INDICATORS = _productionCheck.indicators;

// Log environment detection at startup (once per module load)
if (IS_PRODUCTION) {
  console.info(
    `[EnvDetection] Production environment detected via: ${PRODUCTION_INDICATORS.join(", ")}`
  );
} else if (IS_DEVELOPMENT) {
  console.info("[EnvDetection] Development environment detected");
} else {
  console.info(
    "[EnvDetection] Non-production environment (NODE_ENV=" +
      (process.env.NODE_ENV || "undefined") +
      ")"
  );
}

// ============================================================================
// Quick Check Functions
// ============================================================================

/**
 * Simple production check using only the most common indicators.
 * Use this for quick checks where full detection is overkill.
 *
 * Checks: NODE_ENV, VERCEL_ENV, RAILWAY_ENVIRONMENT
 */
export function isProductionQuick(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.RAILWAY_ENVIRONMENT === "production"
  );
}
