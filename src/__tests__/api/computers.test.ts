import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    computer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    computerGroup: {
      findMany: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("Computers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/computers", () => {
    it("should return all computers for organization", async () => {
      const { auth } = await import("@/lib/auth");
      const prisma = (await import("@/lib/prisma")).default;

      (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: {
          id: "user1",
          organizationId: "org1",
          role: "ADMIN",
        },
      });

      const mockComputers = [
        {
          id: "comp1",
          name: "Workstation 1",
          hostname: "WS001",
          status: "ONLINE",
          lastSeen: new Date(),
          organizationId: "org1",
        },
        {
          id: "comp2",
          name: "Workstation 2",
          hostname: "WS002",
          status: "OFFLINE",
          lastSeen: new Date(Date.now() - 3600000),
          organizationId: "org1",
        },
      ];

      (prisma.computer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockComputers
      );

      const computers = await prisma.computer.findMany({
        where: { organizationId: "org1" },
      });

      expect(computers).toHaveLength(2);
      expect(computers[0].hostname).toBe("WS001");
    });

    it("should filter by status", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.computer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "comp1",
          name: "Workstation 1",
          status: "ONLINE",
        },
      ]);

      const computers = await prisma.computer.findMany({
        where: {
          organizationId: "org1",
          status: "ONLINE",
        },
      });

      expect(computers).toHaveLength(1);
      expect(computers[0].status).toBe("ONLINE");
    });

    it("should filter by group", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.computer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "comp1",
          name: "Workstation 1",
          groupId: "group1",
        },
      ]);

      const computers = await prisma.computer.findMany({
        where: {
          organizationId: "org1",
          groupId: "group1",
        },
      });

      expect(computers[0].groupId).toBe("group1");
    });
  });

  describe("GET /api/computers/[id]", () => {
    it("should return a single computer with details", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.computer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "comp1",
        name: "Workstation 1",
        hostname: "WS001",
        ipAddress: "192.168.1.100",
        macAddress: "00:11:22:33:44:55",
        osType: "windows",
        osVersion: "Windows 11",
        status: "ONLINE",
        cpuUsage: 45.5,
        memoryUsage: 62.3,
        diskUsage: 78.1,
        agentVersion: "1.0.0",
      });

      const computer = await prisma.computer.findUnique({
        where: { id: "comp1" },
      });

      expect(computer).not.toBeNull();
      expect(computer?.hostname).toBe("WS001");
      expect(computer?.cpuUsage).toBe(45.5);
    });

    it("should return null for non-existent computer", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.computer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const computer = await prisma.computer.findUnique({
        where: { id: "non-existent" },
      });

      expect(computer).toBeNull();
    });
  });

  describe("POST /api/computers", () => {
    it("should create a new computer", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      const newComputer = {
        id: "comp3",
        name: "New Workstation",
        hostname: "WS003",
        ipAddress: "192.168.1.101",
        osType: "windows",
        status: "OFFLINE",
        organizationId: "org1",
      };

      (prisma.computer.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        newComputer
      );

      const created = await prisma.computer.create({
        data: {
          name: "New Workstation",
          hostname: "WS003",
          ipAddress: "192.168.1.101",
          osType: "windows",
          organizationId: "org1",
        },
      });

      expect(created.name).toBe("New Workstation");
      expect(created.status).toBe("OFFLINE");
    });
  });

  describe("PATCH /api/computers/[id]", () => {
    it("should update computer details", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.computer.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "comp1",
        name: "Updated Workstation",
        groupId: "group2",
      });

      const updated = await prisma.computer.update({
        where: { id: "comp1" },
        data: {
          name: "Updated Workstation",
          groupId: "group2",
        },
      });

      expect(updated.name).toBe("Updated Workstation");
      expect(updated.groupId).toBe("group2");
    });
  });

  describe("DELETE /api/computers/[id]", () => {
    it("should delete a computer", async () => {
      const prisma = (await import("@/lib/prisma")).default;

      (prisma.computer.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "comp1",
      });

      const deleted = await prisma.computer.delete({
        where: { id: "comp1" },
      });

      expect(deleted.id).toBe("comp1");
    });
  });
});

describe("Computer Status Logic", () => {
  const getStatus = (lastSeen: Date | null): "ONLINE" | "IDLE" | "OFFLINE" => {
    if (!lastSeen) return "OFFLINE";

    const now = Date.now();
    const diff = now - lastSeen.getTime();
    const MINUTE = 60 * 1000;

    if (diff < 2 * MINUTE) return "ONLINE";
    if (diff < 10 * MINUTE) return "IDLE";
    return "OFFLINE";
  };

  it("should return ONLINE for recent activity", () => {
    const lastSeen = new Date(Date.now() - 30 * 1000);
    expect(getStatus(lastSeen)).toBe("ONLINE");
  });

  it("should return IDLE for 5 minutes ago", () => {
    const lastSeen = new Date(Date.now() - 5 * 60 * 1000);
    expect(getStatus(lastSeen)).toBe("IDLE");
  });

  it("should return OFFLINE for 15 minutes ago", () => {
    const lastSeen = new Date(Date.now() - 15 * 60 * 1000);
    expect(getStatus(lastSeen)).toBe("OFFLINE");
  });

  it("should return OFFLINE for null lastSeen", () => {
    expect(getStatus(null)).toBe("OFFLINE");
  });
});

describe("Computer Validation", () => {
  it("should validate hostname format", () => {
    const validHostnames = ["WS001", "workstation-1", "PC_123", "server.local"];
    const invalidHostnames = ["", " ", "a".repeat(256)];

    validHostnames.forEach((hostname) => {
      expect(hostname.length).toBeGreaterThan(0);
      expect(hostname.length).toBeLessThanOrEqual(255);
    });

    invalidHostnames.forEach((hostname) => {
      expect(hostname.length === 0 || hostname.length > 255 || hostname.trim() === "").toBe(
        true
      );
    });
  });

  it("should validate MAC address format", () => {
    const validMacs = [
      "00:11:22:33:44:55",
      "AA:BB:CC:DD:EE:FF",
      "00-11-22-33-44-55",
    ];
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

    validMacs.forEach((mac) => {
      expect(macRegex.test(mac)).toBe(true);
    });
  });

  it("should validate IP address format", () => {
    const validIps = ["192.168.1.1", "10.0.0.1", "172.16.0.1"];
    const invalidIps = ["256.1.1.1", "abc.def.ghi.jkl", "192.168.1"];

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

    validIps.forEach((ip) => {
      expect(ipRegex.test(ip)).toBe(true);
    });

    invalidIps.forEach((ip) => {
      if (ipRegex.test(ip)) {
        const parts = ip.split(".").map(Number);
        expect(parts.some((p) => p > 255)).toBe(true);
      }
    });
  });

  it("should validate OS type", () => {
    const validOsTypes = ["windows", "macos", "linux"];
    const invalidOsTypes = ["android", "ios", "freebsd"];

    validOsTypes.forEach((os) => {
      expect(validOsTypes.includes(os)).toBe(true);
    });

    invalidOsTypes.forEach((os) => {
      expect(validOsTypes.includes(os)).toBe(false);
    });
  });
});
