import { NextRequest, NextResponse } from "next/server";
import {
  cleanupStaleExecutions,
  countRunningExecutions,
} from "@/lib/db/agent";

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
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const vercelCronSignature = request.headers.get("x-vercel-cron-signature");

  // Check authentication:
  // 1. Valid CRON_SECRET bearer token, OR
  // 2. Request from Vercel's cron system (has signature header AND secret is configured)
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
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

    // Clean up executions that have been running for more than 5 minutes
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const { cleanedCount, executionIds } =
      await cleanupStaleExecutions(STALE_THRESHOLD_MS);

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
