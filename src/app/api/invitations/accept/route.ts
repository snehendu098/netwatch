import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { acceptInvitationSchema, validateRequest } from "@/lib/validation";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// POST /api/invitations/accept - Accept invitation and create user (public)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = validateRequest(acceptInvitationSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const { token, password, name } = validation.data;

    // Hash the provided token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find the invitation
    const invitation = await prisma.invitation.findUnique({
      where: { token: hashedToken },
      include: {
        organization: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { error: "This invitation has already been used or cancelled" },
        { status: 400 }
      );
    }

    // Check if invitation is expired
    if (new Date() > invitation.expiresAt) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 }
      );
    }

    // Check if user with this email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and update invitation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the user
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          name,
          role: invitation.role,
          organizationId: invitation.organizationId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      // Update invitation status
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      message: "Account created successfully. You can now log in.",
      user: {
        email: result.email,
        name: result.name,
      },
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
