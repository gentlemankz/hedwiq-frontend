import { NextRequest, NextResponse } from "next/server";
import {
  cleanupStaleExecutions,
  countRunningExecutions,
} from "@/lib/db/agent";
import { getSecretOrDefault, secureCompare } from "@/lib/secrets";

/**
 * GET /api/cron/cleanup-executions
 *
 * Cron job endpoint to clean up stale agent executions.
 * Marks executions that have been "running" for too long as failed.
 *
 * Security:
 * - In production: requires CRON_SECRET or Vercel cron header
 * - Vercel cron jobs automatically include the x-vercel-cron-signature header
 * - Manual invocation requires Bearer token matching CRON_SECRET
 * - Uses constant-time comparison to prevent timing attacks
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Read from Docker secrets (production) or env var (development)
  const cronSecret = getSecretOrDefault("CRON_SECRET", "");
  const authHeader = request.headers.get("authorization") ?? "";
  const vercelCronSignature = request.headers.get("x-vercel-cron-signature");

  // Check authentication using constant-time comparison:
  // 1. Valid CRON_SECRET bearer token, OR
  // 2. Request from Vercel's cron system (has signature header AND secret is configured)
  const expectedBearerToken = `Bearer ${cronSecret}`;
  const hasValidSecret = cronSecret && secureCompare(authHeader, expectedBearerToken);
  const isVercelCron = cronSecret && vercelCronSignature !== null;

  if (!hasValidSecret && !isVercelCron) {
    // In development without CRON_SECRET, only allow localhost
    const host = request.headers.get("host") || "";
    const isLocalDev = !cronSecret && host.startsWith("localhost");

    if (!isLocalDev) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Get count before cleanup for logging
    const runningBefore = await countRunningExecutions();

    // Clean up stale executions using configurable threshold
    // Default: 5 minutes, configurable via AGENT_EXECUTION_TIMEOUT_MS env var
    const { cleanedCount, executionIds } = await cleanupStaleExecutions();

    // Get count after cleanup
    const runningAfter = await countRunningExecutions();

    // Log for monitoring (internal only)
    if (cleanedCount > 0) {
      console.log(
        `[Cron] Cleaned up ${cleanedCount} stale executions:`,
        executionIds
      );
    }

    // Return minimal response (don't expose execution IDs externally)
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        runningBefore,
        runningAfter,
        cleanedCount,
      },
    });
  } catch (error) {
    console.error("[Cron] Cleanup executions error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
