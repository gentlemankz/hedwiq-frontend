import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  updateAgentSchedule,
  deleteAgentSchedule,
  verifyScheduleOwnership,
} from "@/lib/db/agent";
import { validateUpdateScheduleRequest } from "@/lib/validation/agent";
import type {
  UpdateAgentScheduleResponse,
  DeleteAgentScheduleResponse,
  AgentSchedule,
} from "@/types/agent";

interface RouteContext {
  params: Promise<{
    agentId: string;
    scheduleId: string;
  }>;
}

/**
 * GET /api/agents/[agentId]/schedules/[scheduleId]
 *
 * Get a specific schedule.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<{ schedule: AgentSchedule } | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, scheduleId } = await context.params;

  try {
    // Verify ownership
    const schedule = await verifyScheduleOwnership(scheduleId, session.user.id);
    if (!schedule || schedule.agentId !== agentId) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Get schedule error:", error);
    return NextResponse.json(
      { error: "Failed to get schedule" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agents/[agentId]/schedules/[scheduleId]
 *
 * Update a schedule.
 * Body:
 * - scheduleType: "once" | "hourly" | "daily" | "weekly" | "monthly" (optional)
 * - scheduledAt: ISO string (optional)
 * - hour: 0-23 (optional)
 * - minute: 0-59 (optional)
 * - dayOfWeek: 0-6 (optional)
 * - dayOfMonth: 1-31 (optional)
 * - timezone: IANA timezone string (optional)
 * - isEnabled: boolean (optional)
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<UpdateAgentScheduleResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, scheduleId } = await context.params;

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateUpdateScheduleRequest(body);
  if (!validation.isValid || !validation.sanitized) {
    return NextResponse.json(
      { error: validation.error ?? "Validation failed" },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    const existingSchedule = await verifyScheduleOwnership(scheduleId, session.user.id);
    if (!existingSchedule || existingSchedule.agentId !== agentId) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const { sanitized } = validation;

    // Update schedule
    // Note: scheduledAt is passed as raw string - updateAgentSchedule parses it with timezone
    const schedule = await updateAgentSchedule(scheduleId, {
      scheduleType: sanitized.scheduleType,
      scheduledAt: sanitized.scheduledAt,
      hour: sanitized.hour,
      minute: sanitized.minute,
      dayOfWeek: sanitized.dayOfWeek,
      dayOfMonth: sanitized.dayOfMonth,
      timezone: sanitized.timezone,
      isEnabled: sanitized.isEnabled,
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Update schedule error:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/[agentId]/schedules/[scheduleId]
 *
 * Delete a schedule.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<DeleteAgentScheduleResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, scheduleId } = await context.params;

  try {
    // Verify ownership
    const existingSchedule = await verifyScheduleOwnership(scheduleId, session.user.id);
    if (!existingSchedule || existingSchedule.agentId !== agentId) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const deleted = await deleteAgentSchedule(scheduleId);
    if (!deleted) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete schedule error:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}
