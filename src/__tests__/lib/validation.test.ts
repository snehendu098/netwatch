import { describe, it, expect } from "vitest";
import {
  createUserSchema,
  loginSchema,
  createComputerSchema,
  createPolicySchema,
  createCommandSchema,
  validateRequest,
  sanitizeHtml,
  sanitizeFilename,
} from "@/lib/validation";

describe("User Validation", () => {
  describe("createUserSchema", () => {
    it("should validate a correct user", () => {
      const validUser = {
        email: "test@example.com",
        password: "Password123",
        name: "Test User",
        role: "ADMIN",
      };

      const result = createUserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const invalidUser = {
        email: "not-an-email",
        password: "Password123",
        name: "Test User",
      };

      const result = createUserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });

    it("should reject weak password", () => {
      const weakPasswords = [
        "short1A",
        "nouppercase1",
        "NOLOWERCASE1",
        "NoNumbers",
      ];

      weakPasswords.forEach((password) => {
        const result = createUserSchema.safeParse({
          email: "test@example.com",
          password,
          name: "Test User",
        });
        expect(result.success).toBe(false);
      });
    });

    it("should accept strong password", () => {
      const strongPasswords = [
        "Password123",
        "SecureP@ss1",
        "MyStr0ngP@ssword",
      ];

      strongPasswords.forEach((password) => {
        const result = createUserSchema.safeParse({
          email: "test@example.com",
          password,
          name: "Test User",
        });
        expect(result.success).toBe(true);
      });
    });

    it("should default role to VIEWER", () => {
      const user = {
        email: "test@example.com",
        password: "Password123",
        name: "Test User",
      };

      const result = createUserSchema.safeParse(user);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("VIEWER");
      }
    });

    it("should reject invalid role", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        password: "Password123",
        name: "Test User",
        role: "SUPERADMIN",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("should validate correct login credentials", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "anypassword",
      });
      expect(result.success).toBe(true);
    });

    it("should validate login with 2FA token", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "anypassword",
        twoFactorToken: "123456",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid 2FA token length", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "anypassword",
        twoFactorToken: "12345",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Computer Validation", () => {
  describe("createComputerSchema", () => {
    it("should validate correct computer data", () => {
      const result = createComputerSchema.safeParse({
        name: "Workstation 1",
        hostname: "WS001",
        ipAddress: "192.168.1.100",
        macAddress: "00:11:22:33:44:55",
        osType: "windows",
      });
      expect(result.success).toBe(true);
    });

    it("should allow optional fields to be null", () => {
      const result = createComputerSchema.safeParse({
        name: "Workstation 1",
        hostname: "WS001",
        ipAddress: null,
        macAddress: null,
        osVersion: null,
        groupId: null,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid IP address", () => {
      const result = createComputerSchema.safeParse({
        name: "Workstation 1",
        hostname: "WS001",
        ipAddress: "not-an-ip",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid MAC address", () => {
      const result = createComputerSchema.safeParse({
        name: "Workstation 1",
        hostname: "WS001",
        macAddress: "invalid-mac",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid OS type", () => {
      const result = createComputerSchema.safeParse({
        name: "Workstation 1",
        hostname: "WS001",
        osType: "android",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Policy Validation", () => {
  describe("createPolicySchema", () => {
    it("should validate website blocking rule", () => {
      const result = createPolicySchema.safeParse({
        type: "WEBSITE",
        pattern: "*.facebook.com",
        action: "BLOCK",
      });
      expect(result.success).toBe(true);
    });

    it("should validate app blocking rule", () => {
      const result = createPolicySchema.safeParse({
        type: "APP",
        pattern: "chrome.exe",
        action: "WARN",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty pattern", () => {
      const result = createPolicySchema.safeParse({
        type: "WEBSITE",
        pattern: "",
        action: "BLOCK",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid action", () => {
      const result = createPolicySchema.safeParse({
        type: "WEBSITE",
        pattern: "*.example.com",
        action: "DELETE",
      });
      expect(result.success).toBe(false);
    });

    it("should default action to BLOCK", () => {
      const result = createPolicySchema.safeParse({
        type: "WEBSITE",
        pattern: "*.example.com",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe("BLOCK");
      }
    });
  });
});

describe("Command Validation", () => {
  describe("createCommandSchema", () => {
    it("should validate LOCK command", () => {
      const result = createCommandSchema.safeParse({
        computerId: "comp1",
        command: "LOCK",
      });
      expect(result.success).toBe(true);
    });

    it("should validate MESSAGE command with payload", () => {
      const result = createCommandSchema.safeParse({
        computerId: "comp1",
        command: "MESSAGE",
        payload: {
          message: "Please take a break!",
          title: "Reminder",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should validate EXECUTE command with timeout", () => {
      const result = createCommandSchema.safeParse({
        computerId: "comp1",
        command: "EXECUTE",
        payload: {
          command: "notepad.exe",
          timeout: 300,
        },
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid command", () => {
      const result = createCommandSchema.safeParse({
        computerId: "comp1",
        command: "DESTROY",
      });
      expect(result.success).toBe(false);
    });

    it("should reject message that is too long", () => {
      const result = createCommandSchema.safeParse({
        computerId: "comp1",
        command: "MESSAGE",
        payload: {
          message: "a".repeat(1001),
        },
      });
      expect(result.success).toBe(false);
    });

    it("should reject timeout that is too large", () => {
      const result = createCommandSchema.safeParse({
        computerId: "comp1",
        command: "EXECUTE",
        payload: {
          command: "test.exe",
          timeout: 7200,
        },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("validateRequest helper", () => {
  it("should return success with data for valid input", () => {
    const result = validateRequest(loginSchema, {
      email: "test@example.com",
      password: "password123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@example.com");
    }
  });

  it("should return errors for invalid input", () => {
    const result = validateRequest(loginSchema, {
      email: "not-an-email",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("Sanitization helpers", () => {
  describe("sanitizeHtml", () => {
    it("should escape HTML special characters", () => {
      expect(sanitizeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"
      );
    });

    it("should escape ampersands", () => {
      expect(sanitizeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    });

    it("should escape quotes", () => {
      expect(sanitizeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
    });

    it("should handle empty string", () => {
      expect(sanitizeHtml("")).toBe("");
    });
  });

  describe("sanitizeFilename", () => {
    it("should remove invalid characters", () => {
      expect(sanitizeFilename("file<>:name.txt")).toBe("file___name.txt");
    });

    it("should replace leading dots", () => {
      const result = sanitizeFilename("..hidden");
      expect(result.startsWith(".")).toBe(false);
    });

    it("should truncate long filenames", () => {
      const longName = "a".repeat(300);
      expect(sanitizeFilename(longName).length).toBe(255);
    });

    it("should handle normal filenames", () => {
      expect(sanitizeFilename("document.pdf")).toBe("document.pdf");
    });
  });
});
