import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReport, ReportData } from "@/lib/report-generator";
import { sendEmail } from "@/lib/email";

// Helper functions for report formatting
function getColumnsForReportType(reportType: string): ReportData["columns"] {
  switch (reportType) {
    case "ACTIVITY":
      return [
        { key: "computer", header: "Computer", width: 100 },
        { key: "application", header: "Application", width: 150 },
        { key: "title", header: "Window Title", width: 200 },
        { key: "duration", header: "Duration", width: 80 },
        { key: "startTime", header: "Start Time", width: 120 },
      ];
    case "PRODUCTIVITY":
      return [
        { key: "computer", header: "Computer", width: 150 },
        { key: "productive", header: "Productive (min)", width: 100 },
        { key: "unproductive", header: "Unproductive (min)", width: 100 },
        { key: "neutral", header: "Neutral (min)", width: 100 },
        { key: "score", header: "Score (%)", width: 80 },
      ];
    case "SCREENSHOTS":
      return [
        { key: "computer", header: "Computer", width: 150 },
        { key: "activeWindow", header: "Active Window", width: 200 },
        { key: "capturedAt", header: "Captured At", width: 150 },
      ];
    case "WEBSITES":
      return [
        { key: "computer", header: "Computer", width: 100 },
        { key: "url", header: "URL", width: 250 },
        { key: "title", header: "Title", width: 150 },
        { key: "duration", header: "Duration", width: 80 },
        { key: "visitedAt", header: "Visited At", width: 120 },
      ];
    case "APPLICATIONS":
      return [
        { key: "computer", header: "Computer", width: 100 },
        { key: "application", header: "Application", width: 150 },
        { key: "title", header: "Window Title", width: 200 },
        { key: "duration", header: "Duration (min)", width: 100 },
      ];
    default:
      return [{ key: "data", header: "Data", width: 400 }];
  }
}

function formatReportRows(
  reportType: string,
  data: unknown[]
): ReportData["rows"] {
  const rows: ReportData["rows"] = [];

  for (const item of data as Record<string, unknown>[]) {
    switch (reportType) {
      case "ACTIVITY":
        rows.push({
          computer: (item.computer as { name: string })?.name || "Unknown",
          application: (item.applicationName as string) || "",
          title: (item.windowTitle as string) || (item.title as string) || "",
          duration: Math.round(((item.duration as number) || 0) / 60000) + " min",
          startTime: item.startTime
            ? new Date(item.startTime as string).toLocaleString()
            : "",
        });
        break;
      case "PRODUCTIVITY":
        rows.push({
          computer: (item.computerName as string) || "",
          productive: Math.round(((item.productive as number) || 0) / 60000),
          unproductive: Math.round(((item.unproductive as number) || 0) / 60000),
          neutral: Math.round(((item.neutral as number) || 0) / 60000),
          score: (item.score as number) || 0,
        });
        break;
      case "SCREENSHOTS":
        rows.push({
          computer: (item.computer as { name: string })?.name || "Unknown",
          activeWindow: (item.activeWindow as string) || "",
          capturedAt: item.capturedAt
            ? new Date(item.capturedAt as string).toLocaleString()
            : "",
        });
        break;
      case "WEBSITES":
        rows.push({
          computer: (item.computer as { name: string })?.name || "Unknown",
          url: (item.url as string) || "",
          title: (item.title as string) || "",
          duration: Math.round(((item.duration as number) || 0) / 60) + " min",
          visitedAt: item.visitedAt
            ? new Date(item.visitedAt as string).toLocaleString()
            : "",
        });
        break;
      case "APPLICATIONS":
        rows.push({
          computer: (item.computer as { name: string })?.name || "Unknown",
          application: (item.applicationName as string) || "",
          title: (item.windowTitle as string) || "",
          duration: Math.round(((item.duration as number) || 0) / 60000),
        });
        break;
      default:
        rows.push({ data: JSON.stringify(item) });
    }
  }

  return rows;
}

// This endpoint should be called by a cron job (e.g., every hour)
// Vercel Cron: Add to vercel.json
// {
//   "crons": [
//     { "path": "/api/cron/scheduled-reports", "schedule": "0 * * * *" }
//   ]
// }

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Find reports that need to run
    const dueReports = await prisma.scheduledReport.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      include: {
        organization: true,
      },
    });

    const results: { id: string; status: string; error?: string }[] = [];

    for (const report of dueReports) {
      try {
        const filters = report.filters ? JSON.parse(report.filters) : {};
        const recipients = JSON.parse(report.recipients) as string[];

        // Calculate date range based on schedule
        let startDate: Date;
        const endDate = new Date();

        if (report.schedule === "DAILY") {
          startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() - 1);
        } else if (report.schedule === "WEEKLY") {
          startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() - 7);
        } else {
          // MONTHLY
          startDate = new Date(endDate);
          startDate.setMonth(startDate.getMonth() - 1);
        }

        // Generate the report
        const reportData = await generateReportData(
          report.reportType,
          report.organizationId,
          startDate,
          endDate,
          filters
        );

        // Generate report file - build proper ReportData structure
        const reportDataFormatted = {
          title: `${report.reportType} Report`,
          subtitle: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
          generatedAt: new Date(),
          columns: getColumnsForReportType(report.reportType),
          rows: formatReportRows(report.reportType, reportData),
        };

        const reportFile = await generateReport(
          reportDataFormatted,
          report.format.toLowerCase() as "pdf" | "csv" | "xlsx"
        );

        // Send to recipients
        for (const email of recipients) {
          await sendEmail({
            to: email,
            subject: `[NetWatch] Scheduled Report: ${report.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #1a1a1a;">Scheduled Report: ${report.name}</h1>
                <p>Your scheduled ${report.reportType.toLowerCase()} report is attached.</p>
                <p><strong>Report Period:</strong> ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</p>
                <p><strong>Format:</strong> ${report.format}</p>
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;" />
                <p style="color: #666; font-size: 12px;">
                  This is an automated report from NetWatch.
                </p>
              </div>
            `,
            attachments: [
              {
                filename: `${report.name.replace(/[^a-z0-9]/gi, "_")}_${startDate.toISOString().split("T")[0]}.${report.format.toLowerCase()}`,
                content: reportFile,
              },
            ],
          });
        }

        // Calculate next run time
        const nextRunAt = calculateNextRunAt(
          report.schedule,
          report.scheduleTime,
          report.scheduleDay ?? undefined
        );

        // Update report with last run and next run
        await prisma.scheduledReport.update({
          where: { id: report.id },
          data: {
            lastRunAt: now,
            nextRunAt,
          },
        });

        results.push({ id: report.id, status: "success" });
      } catch (error) {
        console.error(`[Scheduled Reports] Failed to run report ${report.id}:`, error);
        results.push({
          id: report.id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[Scheduled Reports] Cron error:", error);
    return NextResponse.json(
      { error: "Failed to process scheduled reports" },
      { status: 500 }
    );
  }
}

function calculateNextRunAt(
  schedule: string,
  scheduleTime: string,
  scheduleDay?: number
): Date {
  const [hours, minutes] = scheduleTime.split(":").map(Number);
  const now = new Date();
  const next = new Date();

  next.setHours(hours, minutes, 0, 0);

  if (schedule === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else if (schedule === "WEEKLY") {
    next.setDate(next.getDate() + 7);
  } else if (schedule === "MONTHLY") {
    next.setMonth(next.getMonth() + 1);
    if (scheduleDay) {
      next.setDate(scheduleDay);
    }
  }

  return next;
}

async function generateReportData(
  reportType: string,
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: { groupIds?: string[]; computerIds?: string[] }
) {
  const computerFilter: Record<string, unknown> = {
    organizationId,
  };

  if (filters.computerIds?.length) {
    computerFilter.id = { in: filters.computerIds };
  } else if (filters.groupIds?.length) {
    computerFilter.groupId = { in: filters.groupIds };
  }

  const computers = await prisma.computer.findMany({
    where: computerFilter,
    select: { id: true, name: true },
  });

  const computerIds = computers.map((c) => c.id);

  switch (reportType) {
    case "ACTIVITY":
      return prisma.activityLog.findMany({
        where: {
          computerId: { in: computerIds },
          startTime: { gte: startDate, lte: endDate },
        },
        include: { computer: { select: { name: true } } },
        orderBy: { startTime: "desc" },
      });

    case "PRODUCTIVITY":
      const activities = await prisma.activityLog.findMany({
        where: {
          computerId: { in: computerIds },
          startTime: { gte: startDate, lte: endDate },
        },
        select: {
          computerId: true,
          category: true,
          duration: true,
        },
      });

      // Calculate productivity scores
      const productivityByComputer: Record<
        string,
        { productive: number; unproductive: number; neutral: number }
      > = {};

      for (const activity of activities) {
        if (!productivityByComputer[activity.computerId]) {
          productivityByComputer[activity.computerId] = {
            productive: 0,
            unproductive: 0,
            neutral: 0,
          };
        }

        const duration = activity.duration || 0;
        if (
          activity.category === "DEVELOPMENT" ||
          activity.category === "PRODUCTIVITY"
        ) {
          productivityByComputer[activity.computerId].productive += duration;
        } else if (
          activity.category === "ENTERTAINMENT" ||
          activity.category === "SOCIAL"
        ) {
          productivityByComputer[activity.computerId].unproductive += duration;
        } else {
          productivityByComputer[activity.computerId].neutral += duration;
        }
      }

      return Object.entries(productivityByComputer).map(([computerId, stats]) => ({
        computerId,
        computerName: computers.find((c) => c.id === computerId)?.name,
        ...stats,
        score:
          stats.productive + stats.unproductive + stats.neutral > 0
            ? Math.round(
                (stats.productive /
                  (stats.productive + stats.unproductive + stats.neutral)) *
                  100
              )
            : 0,
      }));

    case "SCREENSHOTS":
      return prisma.screenshot.findMany({
        where: {
          computerId: { in: computerIds },
          capturedAt: { gte: startDate, lte: endDate },
        },
        include: { computer: { select: { name: true } } },
        orderBy: { capturedAt: "desc" },
        take: 1000,
      });

    case "WEBSITES":
      return prisma.websiteLog.findMany({
        where: {
          computerId: { in: computerIds },
          visitedAt: { gte: startDate, lte: endDate },
        },
        include: { computer: { select: { name: true } } },
        orderBy: { visitedAt: "desc" },
      });

    case "APPLICATIONS":
      return prisma.activityLog.findMany({
        where: {
          computerId: { in: computerIds },
          startTime: { gte: startDate, lte: endDate },
          type: "APP",
        },
        include: { computer: { select: { name: true } } },
        orderBy: { startTime: "desc" },
      });

    default:
      return [];
  }
}
