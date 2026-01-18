import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";

const APP_NAME = "NetWatch";

export interface TwoFactorSecret {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/**
 * Generate a new 2FA secret for a user
 */
export async function generateTwoFactorSecret(
  userEmail: string
): Promise<TwoFactorSecret> {
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME}:${userEmail}`,
    issuer: APP_NAME,
    length: 32,
  });

  const otpauthUrl = secret.otpauth_url!;
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret: secret.base32,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTwoFactorToken(
  token: string,
  secret: string,
  window: number = 1
): boolean {
  try {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window,
    });
    return verified;
  } catch (error) {
    console.error("[2FA] Verification error:", error);
    return false;
  }
}

/**
 * Generate backup codes for recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    )
      .join("")
      .toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Hash backup codes for storage (using simple hash for demo)
 */
export function hashBackupCodes(codes: string[]): string[] {
  return codes.map((code) =>
    crypto.createHash("sha256").update(code).digest("hex")
  );
}

/**
 * Verify a backup code
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): { valid: boolean; remainingCodes: string[] } {
  const hashedInput = crypto.createHash("sha256").update(code).digest("hex");

  const index = hashedCodes.indexOf(hashedInput);
  if (index === -1) {
    return { valid: false, remainingCodes: hashedCodes };
  }

  // Remove used code
  const remainingCodes = [...hashedCodes];
  remainingCodes.splice(index, 1);

  return { valid: true, remainingCodes };
}

/**
 * Generate current TOTP for testing purposes
 */
export function generateCurrentToken(secret: string): string {
  return speakeasy.totp({
    secret,
    encoding: "base32",
  });
}
