/**
 * Trigger Dispatcher
 *
 * Handles dispatching agent executions based on trigger events.
 * Finds matching triggers for events and queues agent executions.
 */

import {
  findTriggersForEvent,
  createAgentExecution,
  markExecutionStarted,
  markExecutionCompleted,
  markExecutionFailed,
  getUserById,
} from "@/lib/db/agent";
import { executeAgent, type ExecutorContext } from "./executor";
import type {
  AgentTriggerType,
  AgentExecutionInputContext,
} from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

export interface TriggerEvent {
  /** Type of trigger event */
  type: AgentTriggerType;
  /** User ID who owns the meeting/folder */
  userId: string;
  /** Meeting ID (for meeting_end, meeting_start) */
  meetingId?: string;
  /** Folder ID (for new_meeting_in_folder, or meeting context) */
  folderId?: string;
  /** Team ID (for scoping) */
  teamId?: string;
  /** When true, only match triggers with exact team scope (excludes unscoped). Use for per-team dispatches. */
  exactTeamScope?: boolean;
}

export interface DispatchResult {
  /** Number of triggers that matched */
  triggersMatched: number;
  /** Number of executions queued */
  executionsQueued: number;
  /** Number of executions that succeeded */
  executionsSucceeded: number;
  /** Number of executions that failed */
  executionsFailed: number;
  /** Details of each execution */
  executions: Array<{
    agentId: string;
    agentName: string;
    executionId: string;
    triggerId: string;
    status: "success" | "failed";
    errorMessage?: string;
  }>;
}

// ============================================================================
// Dispatcher
// ============================================================================

/** Result of executing a single trigger */
interface SingleExecutionResult {
  agentId: string;
  agentName: string;
  executionId: string;
  triggerId: string;
  status: "success" | "failed";
  errorMessage?: string;
}

/**
 * Executes a single trigger and returns the result.
 * Handles execution record creation, agent execution, and status updates.
 */
async function executeSingleTrigger(
  trigger: Awaited<ReturnType<typeof findTriggersForEvent>>[number],
  event: TriggerEvent,
  executorContext: ExecutorContext
): Promise<SingleExecutionResult> {
  const agent = trigger.agent;
  const agentName = agent.name ?? "Unknown";
  let executionId: string | undefined;

  try {
    // Build input context
    const inputContext: AgentExecutionInputContext = {
      triggerEvent: {
        type: event.type,
        meetingId: event.meetingId,
        folderId: event.folderId,
      },
    };

    if (event.meetingId) {
      inputContext.meetingIds = [event.meetingId];
    }
    if (event.folderId) {
      inputContext.folderIds = [event.folderId];
    }
    if (event.teamId) {
      inputContext.teamIds = [event.teamId];
    }

    // Create execution record
    const execution = await createAgentExecution({
      agentId: agent.id,
      triggeredBy: "trigger",
      triggerId: trigger.id,
      inputContext,
    });

    executionId = execution.id;

    // Mark execution as running
    await markExecutionStarted(execution.id);

    // Execute the agent
    const execResult = await executeAgent(agent, execution, executorContext);

    // Update execution with results
    if (execResult.success) {
      await markExecutionCompleted(execution.id, execResult.outputResult);
      return {
        agentId: agent.id,
        agentName,
        executionId: execution.id,
        triggerId: trigger.id,
        status: "success",
      };
    } else {
      await markExecutionFailed(
        execution.id,
        execResult.errorMessage ?? "Unknown error",
        execResult.outputResult
      );
      return {
        agentId: agent.id,
        agentName,
        executionId: execution.id,
        triggerId: trigger.id,
        status: "failed",
        errorMessage: execResult.errorMessage,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[TriggerDispatcher] Error executing agent ${agent.id}:`, error);

    // Mark execution as failed if it was created
    if (executionId) {
      try {
        await markExecutionFailed(executionId, errorMessage);
      } catch (markError) {
        console.error(
          `[TriggerDispatcher] Failed to mark execution ${executionId} as failed:`,
          markError
        );
      }

      return {
        agentId: agent.id,
        agentName,
        executionId,
        triggerId: trigger.id,
        status: "failed",
        errorMessage,
      };
    }

    // Execution wasn't created, return a synthetic failure result
    return {
      agentId: agent.id,
      agentName,
      executionId: "not-created",
      triggerId: trigger.id,
      status: "failed",
      errorMessage,
    };
  }
}

/**
 * Dispatches agent executions based on a trigger event.
 *
 * Finds all matching triggers for the event, creates executions,
 * and runs the agents in parallel to avoid head-of-line blocking.
 */
export async function dispatchTriggerEvent(
  event: TriggerEvent
): Promise<DispatchResult> {
  const result: DispatchResult = {
    triggersMatched: 0,
    executionsQueued: 0,
    executionsSucceeded: 0,
    executionsFailed: 0,
    executions: [],
  };

  try {
    // Find all matching triggers
    const matchingTriggers = await findTriggersForEvent({
      triggerType: event.type,
      folderId: event.folderId,
      teamId: event.teamId,
      userId: event.userId,
      exactTeamScope: event.exactTeamScope,
    });

    result.triggersMatched = matchingTriggers.length;

    if (matchingTriggers.length === 0) {
      return result;
    }

    // Get user info for executor context
    const user = await getUserById(event.userId);
    if (!user) {
      console.error(`[TriggerDispatcher] User not found: ${event.userId}`);
      return result;
    }

    // Build executor context (shared across all executions)
    const executorContext: ExecutorContext = {
      userId: event.userId,
      userEmail: user.email,
      userName: user.name ?? user.email,
      meetingId: event.meetingId,
      folderId: event.folderId,
    };

    // Execute all triggers in parallel to avoid head-of-line blocking
    const executionPromises = matchingTriggers.map((trigger) =>
      executeSingleTrigger(trigger, event, executorContext)
    );

    const executionResults = await Promise.allSettled(executionPromises);

    // Aggregate results
    result.executionsQueued = matchingTriggers.length;

    for (const settledResult of executionResults) {
      if (settledResult.status === "fulfilled") {
        const execResult = settledResult.value;
        result.executions.push(execResult);
        if (execResult.status === "success") {
          result.executionsSucceeded++;
        } else {
          result.executionsFailed++;
        }
      } else {
        // Promise rejected (shouldn't happen since executeSingleTrigger catches errors)
        result.executionsFailed++;
        console.error(
          "[TriggerDispatcher] Unexpected rejection:",
          settledResult.reason
        );
      }
    }
  } catch (error) {
    console.error("[TriggerDispatcher] Error dispatching trigger event:", error);
  }

  return result;
}

/**
 * Dispatches a meeting_end trigger event.
 * Called when a meeting session ends.
 */
export async function dispatchMeetingEndTrigger(params: {
  meetingId: string;
  userId: string;
  folderId?: string;
  teamId?: string;
  /** When true, only match triggers with exact team scope. Use for per-team dispatches. */
  exactTeamScope?: boolean;
}): Promise<DispatchResult> {
  console.log(
    `[TriggerDispatcher] Dispatching meeting_end for meeting ${params.meetingId}`
  );

  return dispatchTriggerEvent({
    type: "meeting_end",
    userId: params.userId,
    meetingId: params.meetingId,
    folderId: params.folderId,
    teamId: params.teamId,
    exactTeamScope: params.exactTeamScope,
  });
}

/**
 * Dispatches a meeting_start trigger event.
 * Called when a meeting session starts.
 */
export async function dispatchMeetingStartTrigger(params: {
  meetingId: string;
  userId: string;
  folderId?: string;
  teamId?: string;
}): Promise<DispatchResult> {
  console.log(
    `[TriggerDispatcher] Dispatching meeting_start for meeting ${params.meetingId}`
  );

  return dispatchTriggerEvent({
    type: "meeting_start",
    userId: params.userId,
    meetingId: params.meetingId,
    folderId: params.folderId,
    teamId: params.teamId,
  });
}

/**
 * Dispatches a new_meeting_in_folder trigger event.
 * Called when a new meeting is created in a folder.
 */
export async function dispatchNewMeetingInFolderTrigger(params: {
  meetingId: string;
  userId: string;
  folderId: string;
  teamId?: string;
}): Promise<DispatchResult> {
  console.log(
    `[TriggerDispatcher] Dispatching new_meeting_in_folder for meeting ${params.meetingId} in folder ${params.folderId}`
  );

  return dispatchTriggerEvent({
    type: "new_meeting_in_folder",
    userId: params.userId,
    meetingId: params.meetingId,
    folderId: params.folderId,
    teamId: params.teamId,
  });
}
