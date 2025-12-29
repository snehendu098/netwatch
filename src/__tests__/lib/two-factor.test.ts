import { describe, it, expect, beforeAll } from "vitest";

// Set up environment before tests
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
});

describe("Two-Factor Authentication", () => {
  describe("generateTwoFactorSecret", () => {
    it("should generate a valid secret", async () => {
      const { generateTwoFactorSecret } = await import("@/lib/two-factor");

      const secret = await generateTwoFactorSecret("test@example.com");

      expect(secret).toHaveProperty("secret");
      expect(secret).toHaveProperty("otpauthUrl");
      expect(secret).toHaveProperty("qrCodeDataUrl");
      expect(secret.secret).toHaveLength(52); // Base32 encoded 32-byte secret
      expect(secret.otpauthUrl).toContain("otpauth://totp/");
      expect(secret.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("should include app name in otpauth URL", async () => {
      const { generateTwoFactorSecret } = await import("@/lib/two-factor");

      const secret = await generateTwoFactorSecret("user@domain.com");

      expect(secret.otpauthUrl).toContain("NetWatch");
      // URL encodes the @ symbol
      expect(secret.otpauthUrl).toContain("user");
      expect(secret.otpauthUrl).toContain("domain.com");
    });
  });

  describe("verifyTwoFactorToken", () => {
    it("should verify a valid token", async () => {
      const { generateTwoFactorSecret, verifyTwoFactorToken, generateCurrentToken } =
        await import("@/lib/two-factor");

      const { secret } = await generateTwoFactorSecret("test@example.com");
      const token = generateCurrentToken(secret);
      const isValid = verifyTwoFactorToken(token, secret);

      expect(isValid).toBe(true);
    });

    it("should reject an invalid token", async () => {
      const { generateTwoFactorSecret, verifyTwoFactorToken } = await import(
        "@/lib/two-factor"
      );

      const { secret } = await generateTwoFactorSecret("test@example.com");
      const isValid = verifyTwoFactorToken("000000", secret);

      expect(isValid).toBe(false);
    });

    it("should reject malformed tokens", async () => {
      const { verifyTwoFactorToken } = await import("@/lib/two-factor");

      expect(verifyTwoFactorToken("abc", "JBSWY3DPEHPK3PXP")).toBe(false);
      expect(verifyTwoFactorToken("", "JBSWY3DPEHPK3PXP")).toBe(false);
      expect(verifyTwoFactorToken("12345", "JBSWY3DPEHPK3PXP")).toBe(false);
    });

    it("should handle window parameter for time drift", async () => {
      const { generateTwoFactorSecret, verifyTwoFactorToken, generateCurrentToken } =
        await import("@/lib/two-factor");

      const { secret } = await generateTwoFactorSecret("test@example.com");
      const token = generateCurrentToken(secret);

      // Should work with default window of 1
      expect(verifyTwoFactorToken(token, secret, 1)).toBe(true);

      // Should work with larger window
      expect(verifyTwoFactorToken(token, secret, 2)).toBe(true);
    });
  });

  describe("generateBackupCodes", () => {
    it("should generate the correct number of codes", async () => {
      const { generateBackupCodes } = await import("@/lib/two-factor");

      const codes5 = generateBackupCodes(5);
      const codes10 = generateBackupCodes(10);
      const codesDefault = generateBackupCodes();

      expect(codes5).toHaveLength(5);
      expect(codes10).toHaveLength(10);
      expect(codesDefault).toHaveLength(10);
    });

    it("should generate unique codes", async () => {
      const { generateBackupCodes } = await import("@/lib/two-factor");

      const codes = generateBackupCodes(100);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(100);
    });

    it("should generate codes in correct format", async () => {
      const { generateBackupCodes } = await import("@/lib/two-factor");

      const codes = generateBackupCodes(10);
      const codeFormat = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

      codes.forEach((code) => {
        expect(codeFormat.test(code)).toBe(true);
      });
    });
  });

  describe("hashBackupCodes and verifyBackupCode", () => {
    it("should hash and verify backup codes", async () => {
      const { generateBackupCodes, hashBackupCodes, verifyBackupCode } =
        await import("@/lib/two-factor");

      const codes = generateBackupCodes(5);
      const hashedCodes = hashBackupCodes(codes);

      // Should verify a valid code
      const result = verifyBackupCode(codes[0], hashedCodes);
      expect(result.valid).toBe(true);
      expect(result.remainingCodes).toHaveLength(4);
    });

    it("should reject invalid backup code", async () => {
      const { generateBackupCodes, hashBackupCodes, verifyBackupCode } =
        await import("@/lib/two-factor");

      const codes = generateBackupCodes(5);
      const hashedCodes = hashBackupCodes(codes);

      const result = verifyBackupCode("INVALID-CODE", hashedCodes);
      expect(result.valid).toBe(false);
      expect(result.remainingCodes).toHaveLength(5);
    });

    it("should not allow reuse of backup code", async () => {
      const { generateBackupCodes, hashBackupCodes, verifyBackupCode } =
        await import("@/lib/two-factor");

      const codes = generateBackupCodes(3);
      const hashedCodes = hashBackupCodes(codes);

      // First use should succeed
      const result1 = verifyBackupCode(codes[0], hashedCodes);
      expect(result1.valid).toBe(true);

      // Second use should fail (code was removed)
      const result2 = verifyBackupCode(codes[0], result1.remainingCodes);
      expect(result2.valid).toBe(false);
    });

    it("should produce different hashes for different codes", async () => {
      const { hashBackupCodes } = await import("@/lib/two-factor");

      const codes = ["ABCD-1234", "EFGH-5678"];
      const hashed = hashBackupCodes(codes);

      expect(hashed[0]).not.toBe(hashed[1]);
      expect(hashed[0]).toHaveLength(64); // SHA-256 hex
    });
  });

  describe("generateCurrentToken", () => {
    it("should generate a 6-digit token", async () => {
      const { generateTwoFactorSecret, generateCurrentToken } = await import(
        "@/lib/two-factor"
      );

      const { secret } = await generateTwoFactorSecret("test@example.com");
      const token = generateCurrentToken(secret);

      expect(token).toMatch(/^\d{6}$/);
    });

    it("should generate different tokens for different secrets", async () => {
      const { generateTwoFactorSecret, generateCurrentToken } = await import(
        "@/lib/two-factor"
      );

      const { secret: secret1 } = await generateTwoFactorSecret("user1@example.com");
      const { secret: secret2 } = await generateTwoFactorSecret("user2@example.com");

      const token1 = generateCurrentToken(secret1);
      const token2 = generateCurrentToken(secret2);

      // Very unlikely to be the same
      expect(token1).not.toBe(token2);
    });
  });
});
