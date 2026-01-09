import { NextRequest, NextResponse } from "next/server";
import {
  getDueSchedules,
  updateScheduleAfterRun,
  createAgentExecution,
  markExecutionStarted,
  markExecutionCompleted,
  markExecutionFailed,
  cleanupStaleExecutions,
  getUserById,
} from "@/lib/db/agent";
import { executeAgent, type ExecutorContext } from "@/lib/agents/executor";
import { getSecretOrDefault } from "@/lib/secrets";

/**
 * GET /api/agents/cron
 *
 * Cron endpoint for executing scheduled agents.
 * Should be called by Vercel Cron or similar service.
 *
 * Authentication:
 * - Vercel Cron: Uses CRON_SECRET header
 * - Vercel's built-in cron authentication via Authorization header
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron authentication
  const authHeader = request.headers.get("authorization");
  // Read from Docker secrets (production) or env var (development)
  const cronSecret = getSecretOrDefault("CRON_SECRET", "");

  // Check Vercel's built-in cron authentication or custom CRON_SECRET
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isValidCronSecret = cronSecret && request.headers.get("x-cron-secret") === cronSecret;

  if (!isVercelCron && !isValidCronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: {
    scheduleId: string;
    agentId: string;
    agentName: string;
    executionId: string;
    status: "success" | "failed" | "skipped";
    error?: string;
  }[] = [];

  try {
    // First, clean up any stale executions from previous runs
    const cleanupResult = await cleanupStaleExecutions();
    if (cleanupResult.cleanedCount > 0) {
      console.log(
        `Cleaned up ${cleanupResult.cleanedCount} stale executions:`,
        cleanupResult.executionIds
      );
    }

    // Get all schedules that are due to run
    const dueSchedules = await getDueSchedules();

    if (dueSchedules.length === 0) {
      return NextResponse.json({
        message: "No schedules due",
        processedCount: 0,
        results: [],
        cleanedStaleExecutions: cleanupResult.cleanedCount,
      });
    }

    // Process each due schedule
    for (const schedule of dueSchedules) {
      const { agent } = schedule;

      // Skip if agent is not active (double-check, though getDueSchedules should filter)
      if (!agent.isActive) {
        results.push({
          scheduleId: schedule.id,
          agentId: agent.id,
          agentName: agent.name,
          executionId: "",
          status: "skipped",
          error: "Agent is not active",
        });
        continue;
      }

      // Skip if agent has no instructions
      if (!agent.instructions?.trim()) {
        results.push({
          scheduleId: schedule.id,
          agentId: agent.id,
          agentName: agent.name,
          executionId: "",
          status: "skipped",
          error: "Agent has no instructions",
        });
        continue;
      }

      let executionId: string | null = null;

      try {
        // Get user info for executor context
        const user = await getUserById(agent.userId);
        if (!user) {
          results.push({
            scheduleId: schedule.id,
            agentId: agent.id,
            agentName: agent.name,
            executionId: "",
            status: "skipped",
            error: "User not found",
          });
          continue;
        }

        // Create execution record
        const execution = await createAgentExecution({
          agentId: agent.id,
          triggeredBy: "schedule",
          scheduleId: schedule.id,
        });
        executionId = execution.id;

        // Mark execution as started
        await markExecutionStarted(execution.id);

        // Build executor context
        const executorContext: ExecutorContext = {
          userId: user.id,
          userEmail: user.email,
          userName: user.name ?? "User",
        };

        // Execute the agent
        const result = await executeAgent(agent, execution, executorContext);

        // Update execution record based on result
        if (result.success) {
          await markExecutionCompleted(execution.id, result.outputResult);
          results.push({
            scheduleId: schedule.id,
            agentId: agent.id,
            agentName: agent.name,
            executionId: execution.id,
            status: "success",
          });
        } else {
          await markExecutionFailed(
            execution.id,
            result.errorMessage ?? "Unknown error",
            result.outputResult
          );
          results.push({
            scheduleId: schedule.id,
            agentId: agent.id,
            agentName: agent.name,
            executionId: execution.id,
            status: "failed",
            error: result.errorMessage,
          });
        }

        // Update schedule after run (recalculates next run time)
        await updateScheduleAfterRun(schedule.id);
      } catch (error) {
        console.error(`Failed to execute schedule ${schedule.id}:`, error);

        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Mark execution as failed if we have an execution record
        if (executionId) {
          try {
            await markExecutionFailed(executionId, errorMessage);
          } catch (updateError) {
            console.error("Failed to mark execution as failed:", updateError);
          }
        }

        // Still update schedule after run to prevent stuck schedules
        try {
          await updateScheduleAfterRun(schedule.id);
        } catch (updateError) {
          console.error("Failed to update schedule after run:", updateError);
        }

        results.push({
          scheduleId: schedule.id,
          agentId: agent.id,
          agentName: agent.name,
          executionId: executionId ?? "",
          status: "failed",
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      message: `Processed ${results.length} schedules`,
      processedCount: results.length,
      successCount,
      failedCount,
      skippedCount,
      cleanedStaleExecutions: cleanupResult.cleanedCount,
      results,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        error: "Failed to process scheduled agents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
