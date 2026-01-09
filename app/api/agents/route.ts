import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createAgent,
  listAgentsForUser,
  countAgentsOwnedByUser,
} from "@/lib/db/agent";
import { validateCreateAgentRequest } from "@/lib/validation/agent";
import { AGENT_LIMITS } from "@/types/agent";
import type {
  CreateAgentRequest,
  CreateAgentResponse,
  ListAgentsResponse,
} from "@/types/agent";

/**
 * GET /api/agents
 *
 * List all agents for the authenticated user.
 * Returns agents with schedule/trigger/execution counts.
 */
export async function GET(): Promise<NextResponse<ListAgentsResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const agents = await listAgentsForUser(session.user.id);

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("List agents error:", error);
    return NextResponse.json(
      { error: "Failed to list agents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents
 *
 * Create a new agent for the authenticated user.
 * Body:
 * - name: string (required, 3-100 chars)
 * - description: string (optional, max 500 chars)
 * - instructions: string (required, max 5000 chars)
 * - model: "gpt-4o" | "gpt-4o-mini" | "gpt-4-turbo" (optional, default: gpt-4o)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateAgentResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: CreateAgentRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate and sanitize request
  const validation = validateCreateAgentRequest(body);
  if (!validation.isValid || !validation.sanitized) {
    return NextResponse.json(
      { error: validation.error ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { sanitized } = validation;

  try {
    // Check agent limit
    const agentCount = await countAgentsOwnedByUser(session.user.id);
    if (agentCount >= AGENT_LIMITS.MAX_AGENTS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${AGENT_LIMITS.MAX_AGENTS_PER_USER} agents allowed` },
        { status: 400 }
      );
    }

    const agent = await createAgent({
      userId: session.user.id,
      name: sanitized.name,
      description: sanitized.description ?? undefined,
      instructions: sanitized.instructions,
      model: sanitized.model,
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("Create agent error:", error);

    // Handle specific error for agent limit
    if (error instanceof Error && error.message.includes("Maximum of")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
