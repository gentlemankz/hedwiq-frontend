/**
 * Internal Service Authentication
 *
 * Shared authentication utilities for internal API endpoints that are called
 * by trusted services (e.g., the agent). These endpoints use service tokens
 * instead of user sessions.
 *
 * SECURITY FIX: Extracted from duplicated code in:
 * - app/api/internal/usage/route.ts
 * - app/api/internal/meeting-host/route.ts
 *
 * @module lib/internal-auth
 */

import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

// ============================================================================
// Token Management
// ============================================================================

/**
 * SECURITY FIX (High #9): Token rotation support
 *
 * Supports multiple service tokens for graceful rotation:
 * - INTERNAL_SERVICE_TOKEN: Primary token
 * - INTERNAL_SERVICE_TOKEN_PREVIOUS: Previous token (valid during rotation)
 *
 * Rotation process:
 * 1. Generate new token
 * 2. Set INTERNAL_SERVICE_TOKEN_PREVIOUS to current token
 * 3. Set INTERNAL_SERVICE_TOKEN to new token
 * 4. Deploy to all services
 * 5. After all services updated, remove INTERNAL_SERVICE_TOKEN_PREVIOUS
 *
 * This allows zero-downtime token rotation without coordinating deployments.
 */
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const INTERNAL_SERVICE_TOKEN_PREVIOUS = process.env.INTERNAL_SERVICE_TOKEN_PREVIOUS;

/**
 * Get all valid tokens (current and previous for rotation)
 */
export function getValidTokens(): string[] {
  const tokens: string[] = [];
  if (INTERNAL_SERVICE_TOKEN) {
    tokens.push(INTERNAL_SERVICE_TOKEN);
  }
  if (INTERNAL_SERVICE_TOKEN_PREVIOUS) {
    tokens.push(INTERNAL_SERVICE_TOKEN_PREVIOUS);
  }
  return tokens;
}

// ============================================================================
// Timing-Safe Comparison
// ============================================================================

/**
 * Timing-safe string comparison to prevent timing attacks.
 *
 * Uses Node.js crypto.timingSafeEqual under the hood, but handles
 * strings of different lengths safely by always performing a comparison
 * (preventing early return timing leaks).
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal, false otherwise
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // If lengths differ, still perform a comparison to maintain constant time
  if (bufferA.length !== bufferB.length) {
    const dummy = Buffer.alloc(bufferA.length);
    cryptoTimingSafeEqual(bufferA, dummy);
    return false;
  }

  return cryptoTimingSafeEqual(bufferA, bufferB);
}

// ============================================================================
// Token Validation
// ============================================================================

export interface TokenValidationResult {
  valid: boolean;
  usingPreviousToken: boolean;
}

/**
 * Validate service token from request Authorization header.
 *
 * @param request - The NextRequest object
 * @param apiName - Name of the API for logging (e.g., "Internal Usage API")
 * @returns Validation result with details about which token was used
 */
export function validateServiceToken(
  request: NextRequest,
  apiName: string = "Internal API"
): TokenValidationResult {
  const validTokens = getValidTokens();

  if (validTokens.length === 0) {
    console.warn(`[${apiName}] No INTERNAL_SERVICE_TOKEN configured`);
    return { valid: false, usingPreviousToken: false };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, usingPreviousToken: false };
  }

  const providedToken = authHeader.substring(7);

  // Check against all valid tokens (current + previous for rotation)
  // Maintain constant-time behavior by checking all tokens
  let isValid = false;
  let usingPreviousToken = false;

  for (const validToken of validTokens) {
    if (timingSafeEqual(providedToken, validToken)) {
      isValid = true;
      // Check if using previous token (indicates rotation in progress)
      if (validToken === INTERNAL_SERVICE_TOKEN_PREVIOUS) {
        usingPreviousToken = true;
        console.info(
          `[${apiName}] Request authenticated with PREVIOUS token. ` +
            "Token rotation in progress - update client to use new token."
        );
      }
    }
  }

  return { valid: isValid, usingPreviousToken };
}

/**
 * Simple validation check that returns boolean.
 * Use when you don't need details about which token was used.
 *
 * @param request - The NextRequest object
 * @param apiName - Name of the API for logging
 * @returns True if token is valid, false otherwise
 */
export function isValidServiceToken(
  request: NextRequest,
  apiName: string = "Internal API"
): boolean {
  return validateServiceToken(request, apiName).valid;
}
