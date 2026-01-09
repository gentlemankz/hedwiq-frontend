import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getAgentById,
  createAgentExecution,
  markExecutionStarted,
  markExecutionCompleted,
  markExecutionFailed,
} from "@/lib/db/agent";
import { executeAgent, type ExecutorContext } from "@/lib/agents/executor";
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

  // Track execution ID for cleanup in catch block
  let executionId: string | null = null;

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

    // Validate agent has instructions
    if (!agent.instructions?.trim()) {
      return NextResponse.json(
        { error: "Agent has no instructions configured" },
        { status: 400 }
      );
    }

    // Create execution record
    const execution = await createAgentExecution({
      agentId,
      triggeredBy: "manual",
    });
    executionId = execution.id; // Track for cleanup in catch block

    // Mark execution as started
    await markExecutionStarted(execution.id);

    // Build executor context from session and agent
    const executorContext: ExecutorContext = {
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name ?? "User",
      // Optional: could pull from request body for specific context
      meetingId: undefined,
      folderId: undefined,
    };

    // Execute the agent using the AI SDK
    const result = await executeAgent(agent, execution, executorContext);

    // Update execution record based on result
    if (result.success) {
      const updatedExecution = await markExecutionCompleted(
        execution.id,
        result.outputResult
      );
      if (!updatedExecution) {
        return NextResponse.json(
          { error: "Failed to update execution record" },
          { status: 500 }
        );
      }
      return NextResponse.json({ execution: updatedExecution });
    } else {
      const updatedExecution = await markExecutionFailed(
        execution.id,
        result.errorMessage ?? "Unknown error",
        result.outputResult
      );
      if (!updatedExecution) {
        return NextResponse.json(
          { error: "Failed to update execution record" },
          { status: 500 }
        );
      }
      // Return 422 Unprocessable Entity for failed agent execution
      // This distinguishes between server errors (500) and agent execution failures
      return NextResponse.json(
        { execution: updatedExecution, success: false },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error("Execute agent error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // If we have an execution record, mark it as failed
    if (executionId) {
      try {
        await markExecutionFailed(executionId, errorMessage);
      } catch (updateError) {
        console.error("Failed to mark execution as failed:", updateError);
      }
    }

    return NextResponse.json(
      { error: "Failed to execute agent", details: errorMessage },
      { status: 500 }
    );
  }
}
