import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  validateUsername,
  sanitizeUsername,
  validateRoomId,
  isValidImageUrl,
} from "@/lib/validation";

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

// ============================================================================
// Rate Limiting
// ============================================================================
// Note: In-memory rate limiting for development/single-instance deployments.
// For production serverless environments, use Redis (e.g., @upstash/ratelimit).

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 tokens per minute per user

/**
 * Checks rate limit for a user with lazy cleanup of expired entries.
 * Avoids setInterval which causes issues in serverless environments.
 */
function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  // Lazy cleanup: probabilistically clean up expired entries (10% chance per request)
  // This prevents unbounded memory growth without using setInterval
  if (Math.random() < 0.1) {
    for (const [id, limit] of rateLimitMap.entries()) {
      if (now > limit.resetTime) {
        rateLimitMap.delete(id);
      }
    }
  }

  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // Reset or create new window
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  userLimit.count++;
  return { allowed: true };
}

// ============================================================================
// Token Generation
// ============================================================================

/** Token TTL - short-lived tokens as recommended by LiveKit */
const TOKEN_TTL = "5m";

interface TokenParams {
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
  roomName: string;
  displayName?: string;
}

/**
 * Creates a LiveKit access token with proper TTL and randomized identity.
 * Following LiveKit best practices from meet-main example.
 */
async function createRoomToken(params: TokenParams): Promise<{
  token: string;
  identity: string;
  name: string;
}> {
  const { userId, userName, userEmail, userImage, roomName, displayName } = params;

  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit API credentials not configured");
  }

  // Determine participant name
  let participantName = userName;
  if (displayName) {
    const validation = validateUsername(displayName);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid display name");
    }
    participantName = sanitizeUsername(displayName);
  }

  // Validate and sanitize user image URL
  const safeImageUrl = userImage && isValidImageUrl(userImage) ? userImage : null;

  // Generate randomized identity suffix to allow multiple tabs/sessions
  // Format: userId-randomHex (e.g., "user123-a1b2c3d4")
  const identitySuffix = randomBytes(4).toString("hex");
  const identity = `${userId}-${identitySuffix}`;

  // Create access token with TTL (as recommended by LiveKit docs)
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: participantName,
    ttl: TOKEN_TTL,
    metadata: JSON.stringify({
      email: userEmail,
      image: safeImageUrl,
    }),
  });

  // Grant room permissions
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
  });

  const token = await at.toJwt();

  return {
    token,
    identity,
    name: participantName,
  };
}

// ============================================================================
// Request Body Schema
// ============================================================================

interface TokenRequestBody {
  room: string;
  username?: string;
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(session.user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfter),
          },
        }
      );
    }

    // Parse request body
    let body: TokenRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { room: roomName, username: displayName } = body;

    // Validate room name
    if (!roomName) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    const roomValidation = validateRoomId(roomName);
    if (!roomValidation.isValid) {
      return NextResponse.json({ error: roomValidation.error }, { status: 400 });
    }

    // Validate display name if provided
    if (displayName) {
      const usernameValidation = validateUsername(displayName);
      if (!usernameValidation.isValid) {
        return NextResponse.json({ error: usernameValidation.error }, { status: 400 });
      }
    }

    // Generate token using shared helper
    const result = await createRoomToken({
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      userImage: session.user.image ?? null,
      roomName,
      displayName,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    const message = error instanceof Error ? error.message : "Failed to generate token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// Deprecated GET Endpoint - Returns 410 Gone
// ============================================================================

/**
 * GET endpoint is deprecated and removed.
 * Tokens should only be requested via POST to prevent caching and URL exposure.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use POST /api/livekit/token instead.",
      documentation: "https://docs.livekit.io/home/get-started/authentication",
    },
    { status: 410 }
  );
}
