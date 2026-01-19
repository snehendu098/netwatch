import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { emailService } from "@/lib/email";
import crypto from "crypto";
import { format } from "date-fns";

// POST /api/invitations/[id]/resend - Resend invitation with new token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can resend invitations
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Find the invitation
    const invitation = await prisma.invitation.findUnique({
      where: { id },
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

    // Verify invitation belongs to the user's organization
    if (invitation.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only resend pending invitations
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { error: "Can only resend pending invitations" },
        { status: 400 }
      );
    }

    // Generate new token
    const plainToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(plainToken).digest("hex");

    // Set new expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update invitation with new token and expiration
    const updatedInvitation = await prisma.invitation.update({
      where: { id },
      data: {
        token: hashedToken,
        expiresAt,
        updatedAt: new Date(),
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Send new invitation email
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteLink = `${baseUrl}/accept-invitation?token=${plainToken}`;

    await emailService.sendInvitation(invitation.email, {
      inviterName: session.user.name || session.user.email || "An administrator",
      organizationName: invitation.organization.name,
      role: invitation.role,
      inviteLink,
      expiresAt: format(expiresAt, "PPP"),
    });

    return NextResponse.json(updatedInvitation);
  } catch (error) {
    console.error("Error resending invitation:", error);
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    );
  }
}
