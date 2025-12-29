import { NextRequest, NextResponse } from "next/server";
import { runGlobalCleanup } from "@/lib/retention";
import { errorTracker } from "@/lib/error-tracking";

// Secret key for cron job authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/cleanup
 *
 * Automated data retention cleanup job.
 * Should be called by an external cron service (e.g., Vercel Cron, Railway Cron, or system cron).
 *
 * Authentication: Requires CRON_SECRET header to match environment variable.
 *
 * Example cron schedule: Daily at 3 AM
 * curl -X POST https://your-domain.com/api/cron/cleanup -H "x-cron-secret: your-secret"
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const providedSecret = request.headers.get("x-cron-secret");

    if (!CRON_SECRET) {
      console.warn("CRON_SECRET not configured. Skipping authentication.");
    } else if (providedSecret !== CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("Starting automated data retention cleanup...");
    const startTime = Date.now();

    const results = await runGlobalCleanup();

    const duration = Date.now() - startTime;

    // Calculate totals
    let totalDeleted = 0;
    const summary: Record<string, { deleted: number; errors: string[] }> = {};

    results.forEach((orgResults, orgName) => {
      summary[orgName] = { deleted: 0, errors: [] };
      orgResults.forEach((result) => {
        totalDeleted += result.deleted;
        summary[orgName].deleted += result.deleted;
        if (result.error) {
          summary[orgName].errors.push(`${result.model}: ${result.error}`);
        }
      });
    });

    console.log(`Cleanup completed in ${duration}ms. Total records deleted: ${totalDeleted}`);

    return NextResponse.json({
      success: true,
      message: "Data retention cleanup completed",
      duration: `${duration}ms`,
      totalDeleted,
      organizations: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    errorTracker.captureError(error as Error, {
      action: "cronCleanup",
    });
    console.error("Cleanup job failed:", error);
    return NextResponse.json(
      { error: "Cleanup job failed", details: String(error) },
      { status: 500 }
    );
  }
}

// Also support GET for simple testing/verification
export async function GET() {
  return NextResponse.json({
    name: "Data Retention Cleanup",
    description: "Automated cleanup of old data based on retention policies",
    endpoint: "POST /api/cron/cleanup",
    authentication: "x-cron-secret header required",
    schedule: "Recommended: Daily at 3 AM",
    configured: !!CRON_SECRET,
  });
}
