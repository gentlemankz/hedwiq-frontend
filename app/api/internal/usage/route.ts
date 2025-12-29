/**
 * Internal Usage Reporting API
 *
 * This endpoint is used by internal services (like the Python agent) to report
 * usage data to Polar for billing purposes.
 *
 * Authentication: Bearer token using INTERNAL_SERVICE_TOKEN
 *
 * POST /api/internal/usage
 * - Report usage events (meeting minutes, email drafts, storage)
 *
 * GET /api/internal/usage
 * - Get user's current usage status and limits
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import {
  reportMeetingMinutes,
  reportEmailDraft,
  reportStorageChange,
  canUserStartMeeting,
  canUserCreateEmailDraft,
  getCustomerState,
  USAGE_EVENTS,
} from "@/lib/polar/usage";
import { TIER_LIMITS } from "@/lib/polar/constants";

// ============================================================================
// Authentication Helper
// ============================================================================

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

/**
 * Timing-safe string comparison to prevent timing attacks
 * Uses Node.js crypto.timingSafeEqual for proper constant-time comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  // Convert strings to buffers - use same length to prevent length-based leaks
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // If lengths differ, we still need to do constant-time work
  // Compare against a dummy to maintain timing consistency
  if (bufferA.length !== bufferB.length) {
    // Create a buffer of same length as A for constant-time comparison
    const dummy = Buffer.alloc(bufferA.length);
    cryptoTimingSafeEqual(bufferA, dummy);
    return false;
  }

  return cryptoTimingSafeEqual(bufferA, bufferB);
}

function validateServiceToken(request: NextRequest): boolean {
  if (!INTERNAL_SERVICE_TOKEN) {
    console.warn("[Internal Usage API] INTERNAL_SERVICE_TOKEN not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.substring(7);
  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(token, INTERNAL_SERVICE_TOKEN);
}

// ============================================================================
// Types
// ============================================================================

type UsageEventType = "meeting-minutes" | "email-drafts" | "storage-bytes";

interface UsageReportBody {
  userId: string;
  eventType: UsageEventType;
  value: number;
  metadata?: Record<string, unknown>;
}

// Per-event-type validation constraints
const VALUE_CONSTRAINTS: Record<UsageEventType, { min: number; max: number; description: string }> = {
  "meeting-minutes": {
    min: 1,
    max: 1440, // Max 24 hours per single session
    description: "Meeting minutes must be between 1 and 1440 (24 hours)",
  },
  "email-drafts": {
    min: 1,
    max: 100, // Reasonable batch size for drafts
    description: "Email draft count must be between 1 and 100",
  },
  "storage-bytes": {
    // Storage can be negative (for deletions) but within limits
    // Max 1GB per single operation (1073741824 bytes)
    min: -1073741824,
    max: 1073741824,
    description: "Storage bytes must be between -1GB and +1GB per operation",
  },
};

// ============================================================================
// POST Handler - Report Usage
// ============================================================================

/**
 * POST /api/internal/usage
 *
 * Report usage events to Polar.
 *
 * Body:
 * - userId: string (required) - The user's ID
 * - eventType: string (required) - Type of usage event
 * - value: number (required) - The value to report
 * - metadata: object (optional) - Additional metadata
 *
 * Headers:
 * - Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
 */
export async function POST(request: NextRequest) {
  // Validate service token
  if (!validateServiceToken(request)) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing service token" },
      { status: 401 }
    );
  }

  // Parse request body
  let body: UsageReportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  if (!body.userId || typeof body.userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (!body.eventType || typeof body.eventType !== "string") {
    return NextResponse.json({ error: "eventType is required" }, { status: 400 });
  }

  if (typeof body.value !== "number") {
    return NextResponse.json({ error: "value must be a number" }, { status: 400 });
  }

  // Validate event type
  const validEventTypes = Object.values(USAGE_EVENTS);
  if (!validEventTypes.includes(body.eventType as typeof USAGE_EVENTS[keyof typeof USAGE_EVENTS])) {
    return NextResponse.json(
      {
        error: "Invalid eventType",
        validTypes: validEventTypes,
      },
      { status: 400 }
    );
  }

  // Validate value range per event type
  const constraints = VALUE_CONSTRAINTS[body.eventType as UsageEventType];
  if (constraints) {
    if (!Number.isFinite(body.value)) {
      return NextResponse.json(
        { error: "value must be a finite number" },
        { status: 400 }
      );
    }

    if (body.value < constraints.min || body.value > constraints.max) {
      return NextResponse.json(
        {
          error: "value out of range",
          message: constraints.description,
          constraints: { min: constraints.min, max: constraints.max },
          received: body.value,
        },
        { status: 400 }
      );
    }

    // For non-storage events, ensure integer values
    if (body.eventType !== "storage-bytes" && !Number.isInteger(body.value)) {
      return NextResponse.json(
        { error: "value must be an integer for this event type" },
        { status: 400 }
      );
    }
  }

  try {
    let result;

    switch (body.eventType) {
      case USAGE_EVENTS.MEETING_MINUTES:
        result = await reportMeetingMinutes(
          body.userId,
          body.value,
          body.metadata as { roomId?: string; meetingId?: string; sessionId?: string }
        );
        break;

      case USAGE_EVENTS.EMAIL_DRAFTS:
        result = await reportEmailDraft(
          body.userId,
          body.value,
          body.metadata as { meetingId?: string; actionType?: string }
        );
        break;

      case USAGE_EVENTS.STORAGE_BYTES:
        result = await reportStorageChange(
          body.userId,
          body.value,
          body.metadata as { documentId?: string; fileName?: string; action?: "upload" | "delete" }
        );
        break;

      default:
        return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eventType: body.eventType,
      value: body.value,
      userId: body.userId,
    });
  } catch (error) {
    console.error("[Internal Usage API] Error reporting usage:", error);
    return NextResponse.json(
      { error: "Failed to report usage" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET Handler - Check Usage Status
// ============================================================================

/**
 * GET /api/internal/usage
 *
 * Get a user's current usage status and limits.
 *
 * Query Parameters:
 * - userId: string (required) - The user's ID
 * - checkType: string (optional) - Type of check: "meeting", "email-draft", "all"
 *
 * Headers:
 * - Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
 */
export async function GET(request: NextRequest) {
  // Validate service token
  if (!validateServiceToken(request)) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing service token" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get("userId");
  const checkType = searchParams.get("checkType") || "all";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    // Build response based on check type
    const response: Record<string, unknown> = {
      userId,
      timestamp: new Date().toISOString(),
    };

    if (checkType === "meeting" || checkType === "all") {
      const meetingCheck = await canUserStartMeeting(userId);
      response.meeting = {
        allowed: meetingCheck.allowed,
        tier: meetingCheck.tier,
        minutesUsed: meetingCheck.minutesUsed,
        minutesLimit: meetingCheck.minutesLimit,
        remainingMinutes: meetingCheck.remainingMinutes,
        reason: meetingCheck.reason,
      };
    }

    if (checkType === "email-draft" || checkType === "all") {
      const emailCheck = await canUserCreateEmailDraft(userId);
      response.emailDraft = {
        allowed: emailCheck.allowed,
        tier: emailCheck.tier,
        remainingDrafts: emailCheck.remainingDrafts,
        reason: emailCheck.reason,
      };
    }

    if (checkType === "all") {
      const customerState = await getCustomerState(userId);
      if (customerState) {
        const limits = TIER_LIMITS[customerState.tier];
        response.subscription = {
          tier: customerState.tier,
          limits: {
            minutesPerMonth: limits.minutesPerMonth,
            storageGb: limits.storageGb,
            historyDays: limits.historyDays,
            emailDraftsPerMonth: limits.emailDraftsPerMonth,
          },
          usage: {
            minutesUsed: customerState.minutesUsed,
            emailDraftsUsed: customerState.emailDraftsUsed,
            storageUsedBytes: customerState.storageUsedBytes,
          },
          hasActiveSubscription: customerState.activeSubscriptions.length > 0,
        };
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Internal Usage API] Error checking usage:", error);
    return NextResponse.json(
      { error: "Failed to check usage" },
      { status: 500 }
    );
  }
}
