/**
 * Rate Limiting Utility
 *
 * Provides distributed rate limiting using Redis (Upstash) for serverless environments.
 * Falls back to in-memory rate limiting for development when Redis is not configured.
 *
 * SECURITY: In-memory rate limiting is vulnerable in serverless because:
 * - Each instance has its own counter
 * - Cold starts reset counters
 * - Attackers can hit different instances
 *
 * SETUP: Configure these environment variables for production:
 * - UPSTASH_REDIS_REST_URL: Your Upstash Redis REST URL
 * - UPSTASH_REDIS_REST_TOKEN: Your Upstash Redis REST token
 *
 * @module lib/rate-limit
 */

import { isProductionQuick } from "@/lib/env-detection";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // Unix timestamp when the window resets
  retryAfter?: number; // Seconds until retry is allowed
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  prefix?: string; // Redis key prefix
  /**
   * SECURITY FIX #6: Fail behavior on Redis errors
   * - "open": Allow request on error (better UX, less secure)
   * - "closed": Deny request on error (better security, may block legitimate users)
   * Default: "closed" for security-critical operations in production
   */
  failMode?: "open" | "closed";
}

// ============================================================================
// In-Memory Fallback (Development Only)
// ============================================================================

/**
 * Maximum entries in the memory store to prevent unbounded growth.
 * In serverless this is less critical (short-lived instances), but for
 * long-running dev servers this prevents memory leaks.
 */
const MAX_MEMORY_STORE_SIZE = 10000;

/**
 * In-memory rate limit store with LRU-like eviction.
 * WARNING: Only suitable for development/single-instance deployments.
 * In serverless, each instance has its own Map and cold starts reset it.
 */
const memoryStore = new Map<string, { count: number; resetTime: number; lastAccess: number }>();

/**
 * Clean up expired entries and enforce size limit (probabilistic cleanup)
 */
function cleanupMemoryStore(): void {
  const now = Date.now();

  // 10% chance to clean on each check (avoids cleanup on every call)
  if (Math.random() >= 0.1) {
    return;
  }

  // First pass: remove expired entries
  for (const [key, value] of memoryStore.entries()) {
    if (now > value.resetTime) {
      memoryStore.delete(key);
    }
  }

  // Second pass: if still over limit, remove oldest entries (LRU eviction)
  if (memoryStore.size > MAX_MEMORY_STORE_SIZE) {
    // Convert to array and sort by lastAccess (oldest first)
    const entries = Array.from(memoryStore.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // Remove oldest entries until under limit
    const toRemove = memoryStore.size - MAX_MEMORY_STORE_SIZE + 100; // Remove extra 100 for buffer
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      memoryStore.delete(entries[i][0]);
    }

    console.warn(
      `[RateLimit] Memory store exceeded ${MAX_MEMORY_STORE_SIZE} entries. ` +
      `Evicted ${toRemove} oldest entries. Current size: ${memoryStore.size}`
    );
  }
}

/**
 * In-memory rate limiter for development.
 * WARNING: Not suitable for production serverless environments.
 */
function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanupMemoryStore();

  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    // New window - set initial values with lastAccess for LRU
    memoryStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
      lastAccess: now,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      reset: Math.floor((now + config.windowMs) / 1000),
    };
  }

  // Update lastAccess for LRU tracking
  entry.lastAccess = now;

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      reset: Math.floor(entry.resetTime / 1000),
      retryAfter,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    reset: Math.floor(entry.resetTime / 1000),
  };
}

// ============================================================================
// Redis Rate Limiter (Production)
// ============================================================================

/**
 * Check if Upstash Redis is configured.
 */
function isRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Handle rate limit failure based on configured fail mode.
 *
 * SECURITY FIX #6: Default to fail-closed in production for security.
 */
function handleRateLimitError(
  config: RateLimitConfig,
  windowSec: number,
  errorContext: string
): RateLimitResult {
  // Determine fail mode - default to closed in production, open in development
  const isProd = isProductionQuick();
  const failMode = config.failMode ?? (isProd ? "closed" : "open");

  if (failMode === "closed") {
    console.error(
      `[RateLimit] SECURITY: ${errorContext} - Failing CLOSED (denying request). ` +
      `Configure Redis or set failMode: "open" if this is intentional.`
    );
    return {
      allowed: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + windowSec,
      retryAfter: windowSec,
    };
  }

  // Fail open - allow but log warning
  console.warn(
    `[RateLimit] WARNING: ${errorContext} - Failing OPEN (allowing request). ` +
    `This is insecure in production. Configure Redis for distributed rate limiting.`
  );
  return {
    allowed: true,
    remaining: config.maxRequests,
    reset: Math.floor(Date.now() / 1000) + windowSec,
  };
}

/**
 * Redis-based rate limiter using Upstash REST API.
 * Uses a sliding window algorithm with atomic operations.
 *
 * SECURITY FIX #6: Now fails closed by default in production.
 */
async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const prefix = config.prefix || "ratelimit";
  const fullKey = `${prefix}:${key}`;
  const windowSec = Math.ceil(config.windowMs / 1000);

  try {
    // Use Upstash REST API for atomic increment with expiry
    // INCR + EXPIRE pattern ensures we don't leak keys
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", fullKey],
        ["EXPIRE", fullKey, windowSec],
        ["TTL", fullKey],
      ]),
    });

    if (!response.ok) {
      return handleRateLimitError(
        config,
        windowSec,
        `Redis HTTP error: ${response.status}`
      );
    }

    const results = await response.json();
    const count = results[0]?.result ?? 1;
    const ttl = results[2]?.result ?? windowSec;

    const reset = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSec);
    const remaining = Math.max(0, config.maxRequests - count);
    const allowed = count <= config.maxRequests;

    if (!allowed) {
      return {
        allowed: false,
        remaining: 0,
        reset,
        retryAfter: ttl > 0 ? ttl : windowSec,
      };
    }

    return {
      allowed: true,
      remaining,
      reset,
    };
  } catch (error) {
    return handleRateLimitError(
      config,
      windowSec,
      `Redis connection error: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }
}

// ============================================================================
// Main Rate Limiter
// ============================================================================

/**
 * Check rate limit for a given key.
 *
 * In production with Redis configured: Uses distributed Redis rate limiting.
 * In development or without Redis: Uses in-memory rate limiting with warning.
 *
 * SECURITY FIX #6: In production without Redis, behavior depends on failMode:
 * - failMode: "closed" (default in prod): Deny all requests until Redis is configured
 * - failMode: "open": Fall back to in-memory (insecure but available)
 *
 * @param key - Unique identifier (usually userId or IP)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (isRedisConfigured()) {
    return checkRateLimitRedis(key, config);
  }

  // Determine fail mode for when Redis is not configured
  const isProd = isProductionQuick();
  const failMode = config.failMode ?? (isProd ? "closed" : "open");
  const windowSec = Math.ceil(config.windowMs / 1000);

  // In production with fail-closed, deny requests if Redis is not configured
  if (isProd && failMode === "closed") {
    // Only warn once per key prefix to avoid log spam
    const warnKey = `ratelimit_fatal_${config.prefix || "default"}`;
    if (!memoryStore.has(warnKey)) {
      memoryStore.set(warnKey, { count: 1, resetTime: Date.now() + 60000, lastAccess: Date.now() });
      console.error(
        "[RateLimit] SECURITY CRITICAL: Redis not configured in production with failMode='closed'. " +
        "All rate-limited requests will be DENIED until UPSTASH_REDIS_REST_URL and " +
        "UPSTASH_REDIS_REST_TOKEN are configured. Set failMode='open' to use insecure fallback."
      );
    }
    return {
      allowed: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + windowSec,
      retryAfter: windowSec,
    };
  }

  // Log warning in production when using in-memory (only for failMode='open')
  if (isProd) {
    const warnKey = `ratelimit_warn_${config.prefix || "default"}`;
    if (!memoryStore.has(warnKey)) {
      memoryStore.set(warnKey, { count: 1, resetTime: Date.now() + 60000, lastAccess: Date.now() });
      console.warn(
        "[RateLimit] WARNING: Using in-memory rate limiting in production with failMode='open'. " +
        "This is INSECURE in serverless environments - rate limits can be bypassed. " +
        "Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for distributed rate limiting."
      );
    }
  }

  return checkRateLimitMemory(key, config);
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Rate limit configuration for token generation.
 * 10 tokens per minute per user.
 *
 * Note: Uses failMode: "open" to avoid blocking legitimate users when Redis
 * is unavailable, but this means rate limiting may be bypassed in edge cases.
 */
export const TOKEN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  prefix: "token",
  failMode: "open", // Token generation should not completely fail
};

/**
 * Rate limit configuration for API requests.
 * 100 requests per minute per user.
 */
export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  prefix: "api",
  failMode: "open", // General API should remain available
};

/**
 * Rate limit configuration for authentication attempts.
 * 5 attempts per 15 minutes per IP (stricter for security).
 *
 * SECURITY: Uses failMode: "closed" - auth endpoints MUST have rate limiting
 * to prevent brute force attacks. Better to deny than allow unlimited attempts.
 */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  prefix: "auth",
  failMode: "closed", // CRITICAL: Auth must be rate limited
};

/**
 * Rate limit for account creation (anti-abuse).
 * 3 accounts per hour per IP.
 *
 * SECURITY: Uses failMode: "closed" - signup MUST have rate limiting
 * to prevent mass account creation abuse.
 */
export const SIGNUP_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  prefix: "signup",
  failMode: "closed", // CRITICAL: Signup must be rate limited
};

// ============================================================================
// SECURITY FIX (Medium #13): IP-Based Rate Limiting Helpers
// ============================================================================

/**
 * Extract client IP from request headers.
 *
 * Handles common proxy configurations:
 * - X-Forwarded-For (standard proxy header)
 * - X-Real-IP (nginx)
 * - CF-Connecting-IP (Cloudflare)
 *
 * Falls back to a default value for local development.
 *
 * SECURITY NOTE: These headers can be spoofed if not behind a trusted proxy.
 * Ensure your reverse proxy strips/overwrites these headers from client requests.
 *
 * @param headers - Request headers
 * @returns Client IP address or fallback value
 */
export function getClientIP(headers: Headers): string {
  // Cloudflare (most trusted if using Cloudflare)
  const cfIP = headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;

  // X-Forwarded-For (standard, may contain comma-separated list)
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    // Take first IP (original client) from comma-separated list
    const firstIP = xff.split(",")[0]?.trim();
    if (firstIP) return firstIP;
  }

  // X-Real-IP (nginx)
  const realIP = headers.get("x-real-ip");
  if (realIP) return realIP;

  // Fallback for local development
  return "127.0.0.1";
}

/**
 * Rate limit by IP address with abuse logging.
 *
 * Use for unauthenticated endpoints where we can't use userId.
 *
 * @param ip - Client IP address
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimitByIP(
  ip: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const result = await checkRateLimit(`ip:${ip}`, config);

  // SECURITY FIX (Medium #13): Log abuse attempts for monitoring
  if (!result.allowed) {
    console.warn(
      `[RateLimit] ABUSE_ALERT: IP ${ip} exceeded ${config.prefix || "default"} rate limit. ` +
      `Blocked until ${new Date(result.reset * 1000).toISOString()}`
    );
  }

  return result;
}

/**
 * Strict rate limit for login attempts (per IP).
 * 5 attempts per 15 minutes to prevent brute force.
 *
 * SECURITY: Uses failMode: "closed" - login MUST have rate limiting
 * to prevent credential stuffing and brute force attacks.
 */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  prefix: "login",
  failMode: "closed", // CRITICAL: Login must be rate limited
};

/**
 * Rate limit for password reset requests (per IP).
 * 3 requests per hour to prevent enumeration attacks.
 *
 * SECURITY: Uses failMode: "closed" - password reset MUST have rate limiting
 * to prevent account enumeration.
 */
export const PASSWORD_RESET_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  prefix: "password-reset",
  failMode: "closed", // CRITICAL: Password reset must be rate limited
};
