import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
} from "@/lib/two-factor";
import { encrypt } from "@/lib/encryption";

// GET - Get 2FA status for current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const backupCodesRemaining = user.twoFactorBackupCodes
      ? JSON.parse(user.twoFactorBackupCodes).length
      : 0;

    return NextResponse.json({
      enabled: user.twoFactorEnabled,
      backupCodesRemaining,
    });
  } catch (error) {
    console.error("[2FA] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get 2FA status" },
      { status: 500 }
    );
  }
}

// POST - Setup 2FA (generate secret and QR code)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate new 2FA setup
    if (action === "setup") {
      if (user.twoFactorEnabled) {
        return NextResponse.json(
          { error: "2FA is already enabled" },
          { status: 400 }
        );
      }

      const secret = await generateTwoFactorSecret(user.email);

      // Store encrypted secret temporarily (not enabled yet)
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          twoFactorSecret: encrypt(secret.secret),
        },
      });

      return NextResponse.json({
        qrCodeDataUrl: secret.qrCodeDataUrl,
        manualEntryKey: secret.secret,
      });
    }

    // Verify token and enable 2FA
    if (action === "enable") {
      const { token } = body;
      if (!token) {
        return NextResponse.json(
          { error: "Token is required" },
          { status: 400 }
        );
      }

      if (!user.twoFactorSecret) {
        return NextResponse.json(
          { error: "Please setup 2FA first" },
          { status: 400 }
        );
      }

      // Decrypt and verify
      const { decrypt } = await import("@/lib/encryption");
      const secret = decrypt(user.twoFactorSecret);
      const isValid = verifyTwoFactorToken(token, secret);

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes(10);
      const hashedCodes = hashBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorBackupCodes: JSON.stringify(hashedCodes),
        },
      });

      return NextResponse.json({
        enabled: true,
        backupCodes,
        message: "2FA has been enabled. Please save your backup codes securely.",
      });
    }

    // Verify 2FA token (for login)
    if (action === "verify") {
      const { token } = body;
      if (!token) {
        return NextResponse.json(
          { error: "Token is required" },
          { status: 400 }
        );
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json(
          { error: "2FA is not enabled" },
          { status: 400 }
        );
      }

      const { decrypt } = await import("@/lib/encryption");
      const secret = decrypt(user.twoFactorSecret);
      const isValid = verifyTwoFactorToken(token, secret);

      return NextResponse.json({ valid: isValid });
    }

    // Verify backup code
    if (action === "verify-backup") {
      const { code } = body;
      if (!code) {
        return NextResponse.json(
          { error: "Backup code is required" },
          { status: 400 }
        );
      }

      if (!user.twoFactorBackupCodes) {
        return NextResponse.json(
          { error: "No backup codes available" },
          { status: 400 }
        );
      }

      const hashedCodes = JSON.parse(user.twoFactorBackupCodes);
      const result = verifyBackupCode(code, hashedCodes);

      if (result.valid) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: {
            twoFactorBackupCodes: JSON.stringify(result.remainingCodes),
          },
        });
      }

      return NextResponse.json({
        valid: result.valid,
        remainingCodes: result.remainingCodes.length,
      });
    }

    // Regenerate backup codes
    if (action === "regenerate-backup-codes") {
      const { token } = body;
      if (!token) {
        return NextResponse.json(
          { error: "Token is required" },
          { status: 400 }
        );
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json(
          { error: "2FA must be enabled" },
          { status: 400 }
        );
      }

      // Verify current token
      const { decrypt } = await import("@/lib/encryption");
      const secret = decrypt(user.twoFactorSecret);
      const isValid = verifyTwoFactorToken(token, secret);

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      const backupCodes = generateBackupCodes(10);
      const hashedCodes = hashBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          twoFactorBackupCodes: JSON.stringify(hashedCodes),
        },
      });

      return NextResponse.json({ backupCodes });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[2FA] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process 2FA request" },
      { status: 500 }
    );
  }
}

// DELETE - Disable 2FA
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { token, password } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        password: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: "2FA is not enabled" },
        { status: 400 }
      );
    }

    // Verify password
    const bcrypt = await import("bcryptjs");
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 400 }
      );
    }

    // Verify 2FA token
    if (user.twoFactorSecret) {
      const { decrypt } = await import("@/lib/encryption");
      const secret = decrypt(user.twoFactorSecret);
      const isValid = verifyTwoFactorToken(token, secret);

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
      },
    });

    return NextResponse.json({
      disabled: true,
      message: "2FA has been disabled",
    });
  } catch (error) {
    console.error("[2FA] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to disable 2FA" },
      { status: 500 }
    );
  }
}
