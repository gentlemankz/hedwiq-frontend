import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getAgentWithDetails,
  listTriggersWithScope,
  listTriggersForAgent,
  createAgentTrigger,
  countTriggersForAgent,
} from "@/lib/db/agent";
import { isFolderOwner } from "@/lib/db/folder";
import { isTeamMember } from "@/lib/db/team";
import { validateCreateTriggerRequest } from "@/lib/validation/agent";
import { AGENT_LIMITS } from "@/types/agent";
import type {
  CreateAgentTriggerResponse,
  ListAgentTriggersResponse,
} from "@/types/agent";

interface RouteContext {
  params: Promise<{
    agentId: string;
  }>;
}

/**
 * GET /api/agents/[agentId]/triggers
 *
 * List all triggers for an agent with scope details.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ListAgentTriggersResponse | { error: string }>> {
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

    const triggers = await listTriggersWithScope(agentId);

    return NextResponse.json({ triggers });
  } catch (error) {
    console.error("List triggers error:", error);
    return NextResponse.json(
      { error: "Failed to list triggers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents/[agentId]/triggers
 *
 * Create a new trigger for an agent.
 * Body:
 * - triggerType: "meeting_end" | "meeting_start" | "new_meeting_in_folder" | "manual"
 * - scopeFolderId: (optional) Limit trigger to meetings in this folder
 * - scopeTeamId: (optional) Limit trigger to meetings involving this team
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<CreateAgentTriggerResponse | { error: string }>> {
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
  const validation = validateCreateTriggerRequest(body);
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

    // Check trigger limit
    const existingTriggerCount = await countTriggersForAgent(agentId);
    if (existingTriggerCount >= AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT) {
      return NextResponse.json(
        { error: `Maximum of ${AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT} triggers per agent` },
        { status: 400 }
      );
    }

    const { sanitized } = validation;

    // Validate folder ownership if scopeFolderId is provided
    if (sanitized.scopeFolderId) {
      const ownsFolder = await isFolderOwner(sanitized.scopeFolderId, session.user.id);
      if (!ownsFolder) {
        return NextResponse.json(
          { error: "Folder not found or you don't have access to it" },
          { status: 403 }
        );
      }
    }

    // Validate team membership if scopeTeamId is provided
    if (sanitized.scopeTeamId) {
      const isMember = await isTeamMember(sanitized.scopeTeamId, session.user.id);
      if (!isMember) {
        return NextResponse.json(
          { error: "Team not found or you're not a member" },
          { status: 403 }
        );
      }
    }

    // Check for duplicate triggers (same type and scope)
    const existingTriggers = await listTriggersForAgent(agentId);
    const isDuplicate = existingTriggers.some((t) =>
      t.triggerType === sanitized.triggerType &&
      t.scopeFolderId === (sanitized.scopeFolderId ?? null) &&
      t.scopeTeamId === (sanitized.scopeTeamId ?? null)
    );
    if (isDuplicate) {
      return NextResponse.json(
        { error: "A trigger with the same type and scope already exists" },
        { status: 400 }
      );
    }

    // Create trigger
    const trigger = await createAgentTrigger({
      agentId,
      triggerType: sanitized.triggerType,
      scopeFolderId: sanitized.scopeFolderId ?? undefined,
      scopeTeamId: sanitized.scopeTeamId ?? undefined,
    });

    return NextResponse.json({ trigger }, { status: 201 });
  } catch (error) {
    console.error("Create trigger error:", error);
    return NextResponse.json(
      { error: "Failed to create trigger" },
      { status: 500 }
    );
  }
}
