import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAgentById, createAgentExecution } from "@/lib/db/agent";
import type { ExecuteAgentResponse } from "@/types/agent";

interface RouteContext {
  params: Promise<{
    agentId: string;
  }>;
}

/**
 * POST /api/agents/[agentId]/execute
 *
 * Manually execute an agent. Creates an execution record and queues the agent for processing.
 * The agent must be active to be executed.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ExecuteAgentResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await context.params;

  try {
    // Verify agent exists and belongs to user
    const agent = await getAgentById(agentId, session.user.id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if agent is active
    if (!agent.isActive) {
      return NextResponse.json(
        { error: "Agent must be active to execute" },
        { status: 400 }
      );
    }

    // Create execution record
    const execution = await createAgentExecution({
      agentId,
      triggeredBy: "manual",
    });

    // TODO: Queue the execution for actual processing (Phase 3)
    // This would typically involve:
    // 1. Publishing to a job queue (e.g., BullMQ, Inngest)
    // 2. Or calling an external service to process the agent
    // For now, we just create the record and return it

    return NextResponse.json({ execution });
  } catch (error) {
    console.error("Execute agent error:", error);
    return NextResponse.json(
      { error: "Failed to execute agent" },
      { status: 500 }
    );
  }
}
