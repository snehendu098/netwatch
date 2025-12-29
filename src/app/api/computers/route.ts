import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { errorTracker } from "@/lib/error-tracking";

// GET /api/computers - List all computers
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {
      organizationId: session.user.organizationId,
    };

    if (groupId && groupId !== "all") {
      where.groupId = groupId;
    }

    if (status && status !== "all") {
      where.status = status.toUpperCase();
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { hostname: { contains: search } },
      ];
    }

    const computers = await prisma.computer.findMany({
      where,
      include: {
        group: true,
        _count: {
          select: {
            activityLogs: true,
            screenshots: true,
            alerts: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(computers);
  } catch (error) {
    errorTracker.captureError(error as Error, { action: "fetchComputers" });
    console.error("Error fetching computers:", error);
    return NextResponse.json(
      { error: "Failed to fetch computers" },
      { status: 500 }
    );
  }
}

// POST /api/computers - Create a new computer
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "VIEWER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, hostname, ipAddress, osType, groupId } = body;

    if (!name || !hostname) {
      return NextResponse.json(
        { error: "Name and hostname are required" },
        { status: 400 }
      );
    }

    const computer = await prisma.computer.create({
      data: {
        name,
        hostname,
        ipAddress,
        osType: osType || "windows",
        organizationId: session.user.organizationId,
        groupId: groupId || null,
      },
      include: { group: true },
    });

    return NextResponse.json(computer, { status: 201 });
  } catch (error) {
    errorTracker.captureError(error as Error, { action: "createComputer" });
    console.error("Error creating computer:", error);
    return NextResponse.json(
      { error: "Failed to create computer" },
      { status: 500 }
    );
  }
}
