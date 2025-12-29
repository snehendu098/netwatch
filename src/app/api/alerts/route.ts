import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { emailService } from "@/lib/email";
import { withRateLimit } from "@/lib/rate-limit";
import { errorTracker } from "@/lib/error-tracking";

// GET /api/alerts - List all alerts
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const isRead = searchParams.get("isRead");
    const computerId = searchParams.get("computerId");

    const where: Record<string, unknown> = {
      organizationId: session.user.organizationId,
    };

    if (type && type !== "all") {
      where.type = type;
    }

    if (isRead !== null && isRead !== "all") {
      where.isRead = isRead === "true";
    }

    if (computerId) {
      where.computerId = computerId;
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        computer: {
          select: {
            id: true,
            name: true,
            hostname: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    errorTracker.captureError(error as Error, { action: "fetchAlerts" });
    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create a new alert (typically from agent)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, message, computerId, severity = "MEDIUM" } = body;

    if (!type || !message || !computerId) {
      return NextResponse.json(
        { error: "Type, message, and computerId are required" },
        { status: 400 }
      );
    }

    // Verify computer belongs to organization
    const computer = await prisma.computer.findFirst({
      where: {
        id: computerId,
        organizationId: session.user.organizationId,
      },
    });

    if (!computer) {
      return NextResponse.json({ error: "Computer not found" }, { status: 404 });
    }

    const alert = await prisma.alert.create({
      data: {
        type,
        message,
        computerId,
        organizationId: session.user.organizationId,
      },
      include: {
        computer: {
          select: {
            id: true,
            name: true,
            hostname: true,
          },
        },
      },
    });

    // Send email notification for high severity alerts
    if (severity === "HIGH" || type === "SECURITY") {
      // Get admin users for the organization to notify
      const adminUsers = await prisma.user.findMany({
        where: {
          organizationId: session.user.organizationId,
          role: { in: ["ADMIN", "MANAGER"] },
        },
        select: { email: true },
      });

      const adminEmails = adminUsers
        .map((u) => u.email)
        .filter((email): email is string => !!email);

      if (adminEmails.length > 0) {
        // Send notification asynchronously (don't block response)
        emailService
          .sendAlertNotification(adminEmails, {
            alertType: type,
            computerName: computer.name || computer.hostname || "Unknown",
            message,
            severity,
            timestamp: new Date().toISOString(),
          })
          .catch((err) => {
            errorTracker.captureError(err as Error, {
              action: "sendAlertEmail",
              metadata: { alertId: alert.id, type },
            });
          });
      }
    }

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    errorTracker.captureError(error as Error, {
      userId: undefined,
      action: "createAlert",
    });
    console.error("Error creating alert:", error);
    return NextResponse.json(
      { error: "Failed to create alert" },
      { status: 500 }
    );
  }
}

// PATCH /api/alerts - Bulk update alerts (mark as read)
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { alertIds, isRead } = body;

    if (!alertIds || !Array.isArray(alertIds)) {
      return NextResponse.json(
        { error: "alertIds array is required" },
        { status: 400 }
      );
    }

    await prisma.alert.updateMany({
      where: {
        id: { in: alertIds },
        organizationId: session.user.organizationId,
      },
      data: { isRead: isRead ?? true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    errorTracker.captureError(error as Error, { action: "updateAlerts" });
    console.error("Error updating alerts:", error);
    return NextResponse.json(
      { error: "Failed to update alerts" },
      { status: 500 }
    );
  }
}
