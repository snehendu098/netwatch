import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const scheduledReportSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  reportType: z.enum([
    "ACTIVITY",
    "PRODUCTIVITY",
    "SCREENSHOTS",
    "WEBSITES",
    "APPLICATIONS",
  ]),
  format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF"),
  schedule: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  scheduleTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)")
    .default("09:00"),
  scheduleDay: z.number().min(0).max(31).optional(),
  recipients: z.array(z.string().email()).min(1, "At least one recipient is required"),
  filters: z
    .object({
      groupIds: z.array(z.string()).optional(),
      computerIds: z.array(z.string()).optional(),
      dateRange: z.string().optional(),
    })
    .optional(),
  isActive: z.boolean().default(true),
});

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
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (schedule === "WEEKLY") {
    const targetDay = scheduleDay ?? 1; // Default to Monday
    const currentDay = next.getDay();
    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0 || (daysUntilTarget === 0 && next <= now)) {
      daysUntilTarget += 7;
    }
    next.setDate(next.getDate() + daysUntilTarget);
  } else if (schedule === "MONTHLY") {
    const targetDay = scheduleDay ?? 1; // Default to 1st
    next.setDate(targetDay);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next;
}

// GET - List all scheduled reports
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    const reports = await prisma.scheduledReport.findMany({
      where: {
        organizationId: session.user.organizationId,
        ...(isActive !== null && { isActive: isActive === "true" }),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      reports: reports.map((report) => ({
        ...report,
        recipients: JSON.parse(report.recipients),
        filters: report.filters ? JSON.parse(report.filters) : null,
      })),
    });
  } catch (error) {
    console.error("[Scheduled Reports] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheduled reports" },
      { status: 500 }
    );
  }
}

// POST - Create scheduled report
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "VIEWER") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const validation = scheduledReportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const nextRunAt = calculateNextRunAt(
      data.schedule,
      data.scheduleTime,
      data.scheduleDay
    );

    const report = await prisma.scheduledReport.create({
      data: {
        name: data.name,
        reportType: data.reportType,
        format: data.format,
        schedule: data.schedule,
        scheduleTime: data.scheduleTime,
        scheduleDay: data.scheduleDay,
        recipients: JSON.stringify(data.recipients),
        filters: data.filters ? JSON.stringify(data.filters) : null,
        isActive: data.isActive,
        nextRunAt,
        organizationId: session.user.organizationId,
      },
    });

    return NextResponse.json({
      report: {
        ...report,
        recipients: JSON.parse(report.recipients),
        filters: report.filters ? JSON.parse(report.filters) : null,
      },
    });
  } catch (error) {
    console.error("[Scheduled Reports] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create scheduled report" },
      { status: 500 }
    );
  }
}

// PATCH - Update scheduled report
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "VIEWER") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    // Verify report belongs to organization
    const existingReport = await prisma.scheduledReport.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!existingReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.reportType !== undefined) updateData.reportType = updates.reportType;
    if (updates.format !== undefined) updateData.format = updates.format;
    if (updates.schedule !== undefined) updateData.schedule = updates.schedule;
    if (updates.scheduleTime !== undefined) updateData.scheduleTime = updates.scheduleTime;
    if (updates.scheduleDay !== undefined) updateData.scheduleDay = updates.scheduleDay;
    if (updates.recipients !== undefined) updateData.recipients = JSON.stringify(updates.recipients);
    if (updates.filters !== undefined) updateData.filters = updates.filters ? JSON.stringify(updates.filters) : null;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    // Recalculate next run if schedule changed
    if (updates.schedule || updates.scheduleTime || updates.scheduleDay) {
      const schedule = updates.schedule || existingReport.schedule;
      const scheduleTime = updates.scheduleTime || existingReport.scheduleTime;
      const scheduleDay = updates.scheduleDay ?? existingReport.scheduleDay ?? undefined;
      updateData.nextRunAt = calculateNextRunAt(schedule, scheduleTime, scheduleDay);
    }

    const report = await prisma.scheduledReport.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      report: {
        ...report,
        recipients: JSON.parse(report.recipients),
        filters: report.filters ? JSON.parse(report.filters) : null,
      },
    });
  } catch (error) {
    console.error("[Scheduled Reports] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update scheduled report" },
      { status: 500 }
    );
  }
}

// DELETE - Delete scheduled report
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "VIEWER") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    // Verify report belongs to organization
    const existingReport = await prisma.scheduledReport.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!existingReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await prisma.scheduledReport.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[Scheduled Reports] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete scheduled report" },
      { status: 500 }
    );
  }
}
