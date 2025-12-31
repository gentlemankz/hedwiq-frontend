import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { RoomConfiguration, RoomAgentDispatch } from "@livekit/protocol";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  validateUsername,
  sanitizeUsername,
  validateRoomId,
  isValidImageUrl,
} from "@/lib/validation";
import { recordRoomParticipation } from "@/lib/db/room-access";
import { canUserStartMeeting } from "@/lib/polar/usage";
import {
  checkRateLimit,
  checkRateLimitByIP,
  getClientIP,
  TOKEN_RATE_LIMIT,
  type RateLimitConfig,
} from "@/lib/rate-limit";
import { sanitizeError, ERROR_MESSAGES } from "@/lib/error-handling";

/**
 * SECURITY FIX #14: IP-based rate limit for token generation.
 * This prevents a single IP from generating excessive tokens across multiple accounts.
 * More permissive than user-based limit since legitimate users may share IP (office NAT).
 */
const TOKEN_IP_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 tokens per minute per IP (more permissive for shared IPs)
  prefix: "token-ip",
  failMode: "open", // Don't block legitimate users from shared IPs
};

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

// ============================================================================
// Token Generation
// ============================================================================

/** Token TTL - short-lived tokens as recommended by LiveKit */
const TOKEN_TTL = "5m";

/**
 * Agent name for explicit dispatch (optional).
 * If not set, auto-dispatch will be used and agents without agent_name will join.
 * Set LIVEKIT_TRANSCRIPTION_AGENT env var to use explicit dispatch.
 */
const TRANSCRIPTION_AGENT_NAME = process.env.LIVEKIT_TRANSCRIPTION_AGENT?.trim() || "";

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

  // Configure room to dispatch transcription agent when participant joins
  // Only add explicit dispatch if agent name is configured
  if (TRANSCRIPTION_AGENT_NAME) {
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: TRANSCRIPTION_AGENT_NAME,
        }),
      ],
    });
  }

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
    // SECURITY FIX #14: Check IP-based rate limit FIRST (before auth)
    // This prevents abuse from a single IP across multiple accounts
    const clientIP = getClientIP(request.headers);
    const ipRateLimit = await checkRateLimitByIP(clientIP, TOKEN_IP_RATE_LIMIT);
    if (!ipRateLimit.allowed) {
      console.warn(
        `[Token API] IP rate limit exceeded: ${clientIP}. ` +
        `This may indicate abuse or a shared network with heavy usage.`
      );
      return NextResponse.json(
        { error: "Too many requests from this network. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(ipRateLimit.retryAfter || 60),
            "X-RateLimit-Remaining": String(ipRateLimit.remaining),
            "X-RateLimit-Reset": String(ipRateLimit.reset),
          },
        }
      );
    }

    // Verify authentication
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user-based rate limit (uses Redis in production for distributed limiting)
    const rateLimit = await checkRateLimit(session.user.id, TOKEN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfter || 60),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset),
          },
        }
      );
    }

    // CRITICAL SECURITY FIX: Check usage limits BEFORE generating token
    // This prevents users from bypassing frontend UI and directly calling this endpoint
    // to get tokens without limit verification
    const limitCheck = await canUserStartMeeting(session.user.id);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: "LIMIT_EXCEEDED",
          message: limitCheck.reason || "Monthly meeting minutes limit reached",
          tier: limitCheck.tier,
          minutesUsed: limitCheck.minutesUsed,
          minutesLimit: limitCheck.minutesLimit,
          remainingMinutes: limitCheck.remainingMinutes,
        },
        { status: 403 }
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

    // Note: displayName validation is handled by createRoomToken

    // Generate token using shared helper
    const result = await createRoomToken({
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      userImage: session.user.image ?? null,
      roomName,
      displayName,
    });

    // Record room participation for access control
    await recordRoomParticipation(session.user.id, roomName);

    return NextResponse.json(result);
  } catch (error) {
    // SECURITY FIX (Medium #15): Sanitize error message
    const safeError = sanitizeError(error, "Token API", ERROR_MESSAGES.INTERNAL_ERROR);
    return NextResponse.json(
      { error: safeError.message },
      { status: safeError.status }
    );
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
