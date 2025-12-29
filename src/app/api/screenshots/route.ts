import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { errorTracker } from "@/lib/error-tracking";

// GET /api/screenshots - List screenshots
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const computerId = searchParams.get("computerId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {
      computer: {
        organizationId: session.user.organizationId,
      },
    };

    if (computerId) {
      where.computerId = computerId;
    }

    if (startDate || endDate) {
      where.capturedAt = {};
      if (startDate) {
        (where.capturedAt as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.capturedAt as Record<string, Date>).lte = new Date(endDate);
      }
    }

    const [screenshots, total] = await Promise.all([
      prisma.screenshot.findMany({
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
        orderBy: { capturedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.screenshot.count({ where }),
    ]);

    return NextResponse.json({
      screenshots,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + screenshots.length < total,
      },
    });
  } catch (error) {
    errorTracker.captureError(error as Error, { action: "fetchScreenshots" });
    console.error("Error fetching screenshots:", error);
    return NextResponse.json(
      { error: "Failed to fetch screenshots" },
      { status: 500 }
    );
  }
}

// POST /api/screenshots - Upload a screenshot (from agent)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { computerId, imageUrl, activeWindow, capturedAt } = body;

    if (!computerId || !imageUrl) {
      return NextResponse.json(
        { error: "computerId and imageUrl are required" },
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

    const screenshot = await prisma.screenshot.create({
      data: {
        computerId,
        imageUrl,
        activeWindow,
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
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

    return NextResponse.json(screenshot, { status: 201 });
  } catch (error) {
    errorTracker.captureError(error as Error, { action: "createScreenshot" });
    console.error("Error creating screenshot:", error);
    return NextResponse.json(
      { error: "Failed to create screenshot" },
      { status: 500 }
    );
  }
}
