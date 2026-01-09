import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getAgentWithDetails,
  listSchedulesForAgent,
  createAgentSchedule,
} from "@/lib/db/agent";
import { validateCreateScheduleRequest } from "@/lib/validation/agent";
import { AGENT_LIMITS } from "@/types/agent";
import type {
  CreateAgentScheduleResponse,
  ListAgentSchedulesResponse,
} from "@/types/agent";

interface RouteContext {
  params: Promise<{
    agentId: string;
  }>;
}

/**
 * GET /api/agents/[agentId]/schedules
 *
 * List all schedules for an agent.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ListAgentSchedulesResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await context.params;

  try {
    // Verify agent exists and belongs to user
    const agent = await getAgentWithDetails(agentId, session.user.id);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const schedules = await listSchedulesForAgent(agentId);

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error("List schedules error:", error);
    return NextResponse.json(
      { error: "Failed to list schedules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents/[agentId]/schedules
 *
 * Create a new schedule for an agent.
 * Body:
 * - scheduleType: "once" | "hourly" | "daily" | "weekly" | "monthly"
 * - scheduledAt: ISO string (required for "once")
 * - hour: 0-23 (for daily/weekly/monthly)
 * - minute: 0-59
 * - dayOfWeek: 0-6 (for weekly)
 * - dayOfMonth: 1-31 (for monthly)
 * - timezone: IANA timezone string (default: "UTC")
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<CreateAgentScheduleResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await context.params;

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateCreateScheduleRequest(body);
  if (!validation.isValid || !validation.sanitized) {
    return NextResponse.json(
      { error: validation.error ?? "Validation failed" },
      { status: 400 }
    );
  }

  try {
    // Verify agent exists and belongs to user
    const agent = await getAgentWithDetails(agentId, session.user.id);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check schedule limit
    const existingSchedules = await listSchedulesForAgent(agentId);
    if (existingSchedules.length >= AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT) {
      return NextResponse.json(
        { error: `Maximum of ${AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT} schedules per agent` },
        { status: 400 }
      );
    }

    const { sanitized } = validation;

    // Create schedule
    const schedule = await createAgentSchedule({
      agentId,
      scheduleType: sanitized.scheduleType,
      scheduledAt: sanitized.scheduledAt ? new Date(sanitized.scheduledAt) : undefined,
      hour: sanitized.hour,
      minute: sanitized.minute,
      dayOfWeek: sanitized.dayOfWeek,
      dayOfMonth: sanitized.dayOfMonth,
      timezone: sanitized.timezone,
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    console.error("Create schedule error:", error);
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 }
    );
  }
}
