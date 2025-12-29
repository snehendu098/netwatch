import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const alertRuleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  type: z.enum([
    "IDLE_TIME",
    "POLICY_VIOLATION",
    "OFFLINE_DURATION",
    "SUSPICIOUS_ACTIVITY",
    "PRODUCTIVITY",
  ]),
  condition: z.object({
    operator: z.enum(["gt", "lt", "eq", "gte", "lte"]),
    value: z.number(),
    unit: z.string().optional(),
  }),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  actions: z.object({
    email: z.boolean().default(true),
    slack: z.boolean().optional(),
    webhook: z.string().url().optional().or(z.literal("")),
  }),
  groupIds: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
});

// GET - List all alert rules
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const isActive = searchParams.get("isActive");

    const rules = await prisma.alertRule.findMany({
      where: {
        organizationId: session.user.organizationId,
        ...(type && { type }),
        ...(isActive !== null && { isActive: isActive === "true" }),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      rules: rules.map((rule) => ({
        ...rule,
        condition: JSON.parse(rule.condition),
        actions: JSON.parse(rule.actions),
        groupIds: rule.groupIds ? rule.groupIds.split(",") : null,
      })),
    });
  } catch (error) {
    console.error("[Alert Rules] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert rules" },
      { status: 500 }
    );
  }
}

// POST - Create alert rule
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
    const validation = alertRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    const rule = await prisma.alertRule.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        condition: JSON.stringify(data.condition),
        severity: data.severity,
        actions: JSON.stringify(data.actions),
        groupIds: data.groupIds?.join(",") || null,
        isActive: data.isActive,
        organizationId: session.user.organizationId,
      },
    });

    return NextResponse.json({
      rule: {
        ...rule,
        condition: JSON.parse(rule.condition),
        actions: JSON.parse(rule.actions),
        groupIds: rule.groupIds ? rule.groupIds.split(",") : null,
      },
    });
  } catch (error) {
    console.error("[Alert Rules] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create alert rule" },
      { status: 500 }
    );
  }
}

// PATCH - Update alert rule
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
      return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
    }

    // Verify rule belongs to organization
    const existingRule = await prisma.alertRule.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!existingRule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.condition !== undefined) updateData.condition = JSON.stringify(updates.condition);
    if (updates.severity !== undefined) updateData.severity = updates.severity;
    if (updates.actions !== undefined) updateData.actions = JSON.stringify(updates.actions);
    if (updates.groupIds !== undefined) updateData.groupIds = updates.groupIds?.join(",") || null;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    const rule = await prisma.alertRule.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      rule: {
        ...rule,
        condition: JSON.parse(rule.condition),
        actions: JSON.parse(rule.actions),
        groupIds: rule.groupIds ? rule.groupIds.split(",") : null,
      },
    });
  } catch (error) {
    console.error("[Alert Rules] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update alert rule" },
      { status: 500 }
    );
  }
}

// DELETE - Delete alert rule
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
      return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
    }

    // Verify rule belongs to organization
    const existingRule = await prisma.alertRule.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!existingRule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await prisma.alertRule.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[Alert Rules] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete alert rule" },
      { status: 500 }
    );
  }
}
