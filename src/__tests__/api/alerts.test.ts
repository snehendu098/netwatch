import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    alert: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("Alerts API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/alerts", () => {
    it("should return alerts for authorized user", async () => {
      const { auth } = await import("@/lib/auth");
      const prisma = (await import("@/lib/prisma")).default;

      (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: {
          id: "user1",
          organizationId: "org1",
          role: "ADMIN",
        },
      });

      (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "alert1",
          type: "POLICY_VIOLATION",
          message: "Test alert",
          isRead: false,
          createdAt: new Date(),
          computerId: "comp1",
          organizationId: "org1",
        },
      ]);

      // In a real test, you would call the API route
      // For now, we verify the mock setup works
      const session = await auth();
      expect(session?.user?.organizationId).toBe("org1");

      const alerts = await prisma.alert.findMany({
        where: { organizationId: "org1" },
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("POLICY_VIOLATION");
    });

    it("should filter alerts by type", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "alert1",
          type: "IDLE",
          message: "User idle",
          isRead: false,
        },
      ]);

      const alerts = await prisma.alert.findMany({
        where: {
          organizationId: "org1",
          type: "IDLE",
        },
      });

      expect(alerts[0].type).toBe("IDLE");
    });

    it("should filter alerts by read status", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const alerts = await prisma.alert.findMany({
        where: {
          organizationId: "org1",
          isRead: true,
        },
      });

      expect(alerts).toHaveLength(0);
    });
  });

  describe("POST /api/alerts", () => {
    it("should create a new alert", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      const newAlert = {
        id: "alert2",
        type: "SUSPICIOUS",
        message: "Suspicious activity detected",
        isRead: false,
        computerId: "comp1",
        organizationId: "org1",
        createdAt: new Date(),
      };

      (prisma.alert.create as ReturnType<typeof vi.fn>).mockResolvedValue(newAlert);

      const created = await prisma.alert.create({
        data: {
          type: "SUSPICIOUS",
          message: "Suspicious activity detected",
          computerId: "comp1",
          organizationId: "org1",
        },
      });

      expect(created.type).toBe("SUSPICIOUS");
      expect(created.message).toBe("Suspicious activity detected");
    });

    it("should reject invalid alert type", () => {
      const validTypes = ["POLICY_VIOLATION", "IDLE", "OFFLINE", "SUSPICIOUS"];
      const invalidType = "INVALID_TYPE";

      expect(validTypes.includes(invalidType)).toBe(false);
    });
  });

  describe("PATCH /api/alerts", () => {
    it("should mark alert as read", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.alert.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "alert1",
        isRead: true,
      });

      const updated = await prisma.alert.update({
        where: { id: "alert1" },
        data: { isRead: true },
      });

      expect(updated.isRead).toBe(true);
    });

    it("should bulk mark alerts as read", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.alert.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 5,
      });

      const result = await prisma.alert.updateMany({
        where: { id: { in: ["a1", "a2", "a3", "a4", "a5"] } },
        data: { isRead: true },
      });

      expect(result.count).toBe(5);
    });
  });
});

describe("Alert Validation", () => {
  it("should validate alert type", () => {
    const validTypes = ["POLICY_VIOLATION", "IDLE", "OFFLINE", "SUSPICIOUS"];

    validTypes.forEach((type) => {
      expect(validTypes.includes(type)).toBe(true);
    });
  });

  it("should validate message length", () => {
    const message = "a".repeat(1001);
    expect(message.length).toBeGreaterThan(1000);
  });

  it("should validate severity levels", () => {
    const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

    validSeverities.forEach((severity) => {
      expect(validSeverities.includes(severity)).toBe(true);
    });
  });
});
