import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateToken, hashPassword } from "@/lib/encryption";
import { sendEmail } from "@/lib/email";

// POST - Request password reset or reset password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Request password reset
    if (action === "request") {
      const { email } = body;
      if (!email) {
        return NextResponse.json(
          { error: "Email is required" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, name: true, email: true },
      });

      // Always return success to prevent email enumeration
      if (!user) {
        return NextResponse.json({
          message: "If an account exists with this email, a reset link has been sent.",
        });
      }

      // Generate reset token
      const resetToken = generateToken(32);
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      });

      // Send reset email
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

      await sendEmail({
        to: user.email,
        subject: "Reset Your NetWatch Password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">Password Reset Request</h1>
            <p>Hi ${user.name},</p>
            <p>We received a request to reset your NetWatch password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this reset, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;" />
            <p style="color: #666; font-size: 12px;">
              This is an automated message from NetWatch. Please do not reply to this email.
            </p>
          </div>
        `,
      });

      return NextResponse.json({
        message: "If an account exists with this email, a reset link has been sent.",
      });
    }

    // Verify reset token
    if (action === "verify") {
      const { token } = body;
      if (!token) {
        return NextResponse.json(
          { error: "Token is required" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: { gt: new Date() },
        },
        select: { id: true, email: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: "Invalid or expired reset token" },
          { status: 400 }
        );
      }

      return NextResponse.json({ valid: true, email: user.email });
    }

    // Reset password
    if (action === "reset") {
      const { token, password } = body;
      if (!token || !password) {
        return NextResponse.json(
          { error: "Token and password are required" },
          { status: 400 }
        );
      }

      // Validate password strength
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: { gt: new Date() },
        },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: "Invalid or expired reset token" },
          { status: 400 }
        );
      }

      // Hash new password and clear reset token
      const hashedPassword = hashPassword(password);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      // Send confirmation email
      await sendEmail({
        to: user.email,
        subject: "Your NetWatch Password Has Been Changed",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">Password Changed Successfully</h1>
            <p>Hi ${user.name},</p>
            <p>Your NetWatch password has been successfully changed.</p>
            <p>If you didn't make this change, please contact support immediately.</p>
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;" />
            <p style="color: #666; font-size: 12px;">
              This is an automated message from NetWatch. Please do not reply to this email.
            </p>
          </div>
        `,
      });

      return NextResponse.json({
        message: "Password has been reset successfully. You can now log in.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Password Reset] Error:", error);
    return NextResponse.json(
      { error: "Failed to process password reset" },
      { status: 500 }
    );
  }
}
