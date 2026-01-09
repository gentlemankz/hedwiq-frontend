import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getAgentWithDetails,
  updateAgent,
  deleteAgent,
} from "@/lib/db/agent";
import { validateUpdateAgentRequest } from "@/lib/validation/agent";
import type {
  GetAgentResponse,
  UpdateAgentRequest,
  UpdateAgentResponse,
  DeleteAgentResponse,
} from "@/types/agent";

interface RouteContext {
  params: Promise<{
    agentId: string;
  }>;
}

/**
 * GET /api/agents/[agentId]
 *
 * Get a specific agent by ID with full details.
 * Returns the agent with schedules, triggers, and recent executions.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<GetAgentResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await context.params;

  try {
    const agent = await getAgentWithDetails(agentId, session.user.id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error("Get agent error:", error);
    return NextResponse.json(
      { error: "Failed to get agent" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agents/[agentId]
 *
 * Update an agent's properties.
 * Body:
 * - name: string (optional)
 * - description: string | null (optional)
 * - instructions: string (optional)
 * - model: "gpt-4o" | "gpt-4o-mini" | "gpt-4-turbo" (optional)
 * - isActive: boolean (optional)
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<UpdateAgentResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await context.params;

  // Parse request body
  let body: UpdateAgentRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate and sanitize request
  const validation = validateUpdateAgentRequest(body);
  if (!validation.isValid || !validation.sanitized) {
    return NextResponse.json(
      { error: validation.error ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { sanitized } = validation;

  try {
    const agent = await updateAgent(agentId, session.user.id, {
      name: sanitized.name,
      description: sanitized.description ?? undefined,
      instructions: sanitized.instructions,
      model: sanitized.model,
      isActive: sanitized.isActive,
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error("Update agent error:", error);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/[agentId]
 *
 * Delete an agent and all related data (schedules, triggers, executions).
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<DeleteAgentResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await context.params;

  try {
    const deleted = await deleteAgent(agentId, session.user.id);

    if (!deleted) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete agent error:", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
