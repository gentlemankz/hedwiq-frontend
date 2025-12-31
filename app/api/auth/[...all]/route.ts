/**
 * Auth API Route Handler
 *
 * SECURITY FIX (Medium #13): IP-based rate limiting for auth endpoints
 * to prevent brute force and credential stuffing attacks.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import {
  getClientIP,
  checkRateLimitByIP,
  LOGIN_RATE_LIMIT,
  SIGNUP_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
} from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-handling";

// Get the base handlers from Better Auth
const { GET: baseGET, POST: basePOST } = toNextJsHandler(auth.handler);

/**
 * Auth endpoints that require strict rate limiting by IP.
 * These are unauthenticated endpoints vulnerable to brute force attacks.
 */
const RATE_LIMITED_ENDPOINTS = {
  // Login attempts - strict limit
  "sign-in/email": LOGIN_RATE_LIMIT,
  "sign-in/credential": LOGIN_RATE_LIMIT,
  // Signup attempts - prevent mass account creation
  "sign-up/email": SIGNUP_RATE_LIMIT,
  // Password reset - prevent enumeration
  "forget-password": PASSWORD_RESET_RATE_LIMIT,
  "reset-password": PASSWORD_RESET_RATE_LIMIT,
} as const;

/**
 * Check if the request path matches a rate-limited auth endpoint.
 * Returns the rate limit config if matched, undefined otherwise.
 */
function getRateLimitConfig(pathname: string) {
  // Auth paths are like /api/auth/sign-in/email
  const authPath = pathname.replace("/api/auth/", "");

  for (const [endpoint, config] of Object.entries(RATE_LIMITED_ENDPOINTS)) {
    if (authPath.startsWith(endpoint)) {
      return { endpoint, config };
    }
  }
  return undefined;
}

/**
 * GET /api/auth/*
 * Passes through to Better Auth handler (no rate limiting needed for GET)
 */
export async function GET(request: NextRequest) {
  return baseGET(request);
}

/**
 * POST /api/auth/*
 * Applies IP-based rate limiting before passing to Better Auth handler
 */
export async function POST(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const rateLimitMatch = getRateLimitConfig(pathname);

  // Apply rate limiting for sensitive auth endpoints
  if (rateLimitMatch) {
    const clientIP = getClientIP(request.headers);
    const result = await checkRateLimitByIP(clientIP, rateLimitMatch.config);

    if (!result.allowed) {
      // Return rate limit response with standard headers
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: ERROR_MESSAGES.RATE_LIMITED,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter || 60),
            "X-RateLimit-Limit": String(rateLimitMatch.config.maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(result.reset),
          },
        }
      );
    }
  }

  // Pass through to Better Auth handler
  return basePOST(request);
}
