import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  verifyTriggerOwnership,
  updateAgentTrigger,
  deleteAgentTrigger,
  listTriggersForAgent,
} from "@/lib/db/agent";
import { isFolderOwner } from "@/lib/db/folder";
import { isTeamMember } from "@/lib/db/team";
import { validateUpdateTriggerRequest } from "@/lib/validation/agent";
import type {
  UpdateAgentTriggerResponse,
  DeleteAgentTriggerResponse,
  AgentTrigger,
} from "@/types/agent";

interface RouteContext {
  params: Promise<{
    agentId: string;
    triggerId: string;
  }>;
}

/**
 * GET /api/agents/[agentId]/triggers/[triggerId]
 *
 * Get a specific trigger.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<{ trigger: AgentTrigger } | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, triggerId } = await context.params;

  try {
    // Verify trigger belongs to user's agent
    const trigger = await verifyTriggerOwnership(triggerId, session.user.id);
    if (!trigger) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    // Verify trigger belongs to the specified agent
    if (trigger.agentId !== agentId) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    return NextResponse.json({ trigger });
  } catch (error) {
    console.error("Get trigger error:", error);
    return NextResponse.json(
      { error: "Failed to get trigger" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agents/[agentId]/triggers/[triggerId]
 *
 * Update a trigger.
 * Body (all optional):
 * - triggerType: "meeting_end" | "meeting_start" | "new_meeting_in_folder" | "manual"
 * - scopeFolderId: string | null
 * - scopeTeamId: string | null
 * - isEnabled: boolean
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<UpdateAgentTriggerResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, triggerId } = await context.params;

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateUpdateTriggerRequest(body);
  if (!validation.isValid || !validation.sanitized) {
    return NextResponse.json(
      { error: validation.error ?? "Validation failed" },
      { status: 400 }
    );
  }

  try {
    // Verify trigger belongs to user's agent
    const existingTrigger = await verifyTriggerOwnership(triggerId, session.user.id);
    if (!existingTrigger) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    // Verify trigger belongs to the specified agent
    if (existingTrigger.agentId !== agentId) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    const { sanitized } = validation;

    // If changing to new_meeting_in_folder, ensure scopeFolderId is set
    // (either from update or from existing trigger)
    const newTriggerType = sanitized.triggerType ?? existingTrigger.triggerType;
    const newScopeFolderId = sanitized.scopeFolderId !== undefined
      ? sanitized.scopeFolderId
      : existingTrigger.scopeFolderId;

    if (newTriggerType === "new_meeting_in_folder" && !newScopeFolderId) {
      return NextResponse.json(
        { error: "scopeFolderId is required for 'new_meeting_in_folder' trigger type" },
        { status: 400 }
      );
    }

    // Validate folder ownership if scopeFolderId is being set
    if (sanitized.scopeFolderId) {
      const ownsFolder = await isFolderOwner(sanitized.scopeFolderId, session.user.id);
      if (!ownsFolder) {
        return NextResponse.json(
          { error: "Folder not found or you don't have access to it" },
          { status: 403 }
        );
      }
    }

    // Validate team membership if scopeTeamId is being set
    if (sanitized.scopeTeamId) {
      const isMember = await isTeamMember(sanitized.scopeTeamId, session.user.id);
      if (!isMember) {
        return NextResponse.json(
          { error: "Team not found or you're not a member" },
          { status: 403 }
        );
      }
    }

    // Calculate effective new values (update value or existing value)
    const effectiveScopeFolderId = sanitized.scopeFolderId !== undefined
      ? sanitized.scopeFolderId
      : existingTrigger.scopeFolderId;
    const effectiveScopeTeamId = sanitized.scopeTeamId !== undefined
      ? sanitized.scopeTeamId
      : existingTrigger.scopeTeamId;

    // Check for duplicate triggers (same type and scope, excluding current trigger)
    const existingTriggers = await listTriggersForAgent(agentId);
    const isDuplicate = existingTriggers.some((t) =>
      t.id !== triggerId &&
      t.triggerType === newTriggerType &&
      t.scopeFolderId === (effectiveScopeFolderId ?? null) &&
      t.scopeTeamId === (effectiveScopeTeamId ?? null)
    );
    if (isDuplicate) {
      return NextResponse.json(
        { error: "A trigger with the same type and scope already exists" },
        { status: 400 }
      );
    }

    // Build update object
    const updates: Parameters<typeof updateAgentTrigger>[1] = {};
    if (sanitized.triggerType !== undefined) {
      updates.triggerType = sanitized.triggerType;
    }
    if (sanitized.scopeFolderId !== undefined) {
      updates.scopeFolderId = sanitized.scopeFolderId;
    }
    if (sanitized.scopeTeamId !== undefined) {
      updates.scopeTeamId = sanitized.scopeTeamId;
    }
    if (sanitized.isEnabled !== undefined) {
      updates.isEnabled = sanitized.isEnabled;
    }

    // Update trigger
    const trigger = await updateAgentTrigger(triggerId, updates);

    if (!trigger) {
      return NextResponse.json(
        { error: "Failed to update trigger" },
        { status: 500 }
      );
    }

    return NextResponse.json({ trigger });
  } catch (error) {
    console.error("Update trigger error:", error);
    return NextResponse.json(
      { error: "Failed to update trigger" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/[agentId]/triggers/[triggerId]
 *
 * Delete a trigger.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<DeleteAgentTriggerResponse | { error: string }>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, triggerId } = await context.params;

  try {
    // Verify trigger belongs to user's agent
    const trigger = await verifyTriggerOwnership(triggerId, session.user.id);
    if (!trigger) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    // Verify trigger belongs to the specified agent
    if (trigger.agentId !== agentId) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    // Delete trigger
    const success = await deleteAgentTrigger(triggerId);

    return NextResponse.json({ success });
  } catch (error) {
    console.error("Delete trigger error:", error);
    return NextResponse.json(
      { error: "Failed to delete trigger" },
      { status: 500 }
    );
  }
}
