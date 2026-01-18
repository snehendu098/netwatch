"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import {
  getConsoleSocket,
  connectConsole,
  ScreenFrame,
  Heartbeat,
  KeystrokeData,
  ClipboardData,
  ProcessData,
  TerminalOutput,
  CommandResponse
} from "@/lib/socket-client";

interface UseSocketOptions {
  userId?: string;
  autoConnect?: boolean;
}

interface SocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  onlineAgents: string[];
}

export function useSocket(options: UseSocketOptions = {}) {
  const { userId, autoConnect = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<SocketState>({
    connected: false,
    connecting: false,
    error: null,
    onlineAgents: [],
  });

  useEffect(() => {
    if (!autoConnect || !userId) return;

    const socket = getConsoleSocket();
    socketRef.current = socket;

    setState(s => ({ ...s, connecting: true }));

    connectConsole(userId)
      .then((data) => {
        setState({
          connected: true,
          connecting: false,
          error: null,
          onlineAgents: data.onlineAgents.map(a => a.computerId),
        });
      })
      .catch((error) => {
        setState(s => ({
          ...s,
          connecting: false,
          error: error.message,
        }));
      });

    // Listen for agent status changes
    socket.on("agent_online", (data: { computerId: string }) => {
      setState(s => ({
        ...s,
        onlineAgents: [...new Set([...s.onlineAgents, data.computerId])],
      }));
    });

    socket.on("agent_offline", (data: { computerId: string }) => {
      setState(s => ({
        ...s,
        onlineAgents: s.onlineAgents.filter(id => id !== data.computerId),
      }));
    });

    socket.on("disconnect", () => {
      setState(s => ({ ...s, connected: false }));
    });

    socket.on("connect", () => {
      setState(s => ({ ...s, connected: true }));
    });

    return () => {
      socket.off("agent_online");
      socket.off("agent_offline");
      socket.off("disconnect");
      socket.off("connect");
    };
  }, [userId, autoConnect]);

  const watchComputer = useCallback((computerId: string) => {
    socketRef.current?.emit("watch_computer", { computerId });
  }, []);

  const unwatchComputer = useCallback((computerId: string) => {
    socketRef.current?.emit("unwatch_computer", { computerId });
  }, []);

  const sendCommand = useCallback((computerId: string, command: string, payload?: Record<string, unknown>) => {
    return new Promise<{ commandId: string; queued: boolean }>((resolve) => {
      socketRef.current?.emit("send_command", { computerId, command, payload });
      socketRef.current?.once("command_sent", resolve);
    });
  }, []);

  const startRemoteControl = useCallback((computerId: string, mode: "VIEW" | "CONTROL") => {
    return new Promise<{ sessionId: string }>((resolve) => {
      socketRef.current?.emit("start_remote_control", { computerId, mode });
      socketRef.current?.once("remote_control_started", resolve);
    });
  }, []);

  const sendRemoteInput = useCallback((computerId: string, type: "mouse" | "keyboard", event: Record<string, unknown>) => {
    socketRef.current?.emit("remote_input", { computerId, type, event });
  }, []);

  const startTerminal = useCallback((computerId: string, shell?: string) => {
    return new Promise<{ sessionId: string }>((resolve) => {
      socketRef.current?.emit("start_terminal", { computerId, shell });
      socketRef.current?.once("terminal_started", resolve);
    });
  }, []);

  const sendTerminalInput = useCallback((computerId: string, sessionId: string, input: string) => {
    socketRef.current?.emit("terminal_input", { computerId, sessionId, input });
  }, []);

  const requestScreenshot = useCallback((computerId: string) => {
    socketRef.current?.emit("request_screenshot", { computerId });
  }, []);

  const initiateFileTransfer = useCallback((
    computerId: string,
    direction: "UPLOAD" | "DOWNLOAD",
    remotePath: string,
    options?: { localPath?: string; fileData?: string }
  ) => {
    return new Promise<{ transferId: string }>((resolve) => {
      socketRef.current?.emit("file_transfer", {
        computerId,
        direction,
        remotePath,
        ...options,
      });
      socketRef.current?.once("file_transfer_started", resolve);
    });
  }, []);

  // Event listeners
  const onScreenFrame = useCallback((callback: (data: ScreenFrame) => void) => {
    socketRef.current?.on("screen_frame", callback);
    return () => socketRef.current?.off("screen_frame", callback);
  }, []);

  const onHeartbeat = useCallback((callback: (data: Heartbeat) => void) => {
    socketRef.current?.on("heartbeat", callback);
    return () => socketRef.current?.off("heartbeat", callback);
  }, []);

  const onKeystrokes = useCallback((callback: (data: KeystrokeData) => void) => {
    socketRef.current?.on("keystrokes", callback);
    return () => socketRef.current?.off("keystrokes", callback);
  }, []);

  const onClipboard = useCallback((callback: (data: ClipboardData) => void) => {
    socketRef.current?.on("clipboard", callback);
    return () => socketRef.current?.off("clipboard", callback);
  }, []);

  const onProcessList = useCallback((callback: (data: ProcessData) => void) => {
    socketRef.current?.on("process_list", callback);
    return () => socketRef.current?.off("process_list", callback);
  }, []);

  const onTerminalOutput = useCallback((callback: (data: TerminalOutput) => void) => {
    socketRef.current?.on("terminal_output", callback);
    return () => socketRef.current?.off("terminal_output", callback);
  }, []);

  const onCommandResponse = useCallback((callback: (data: CommandResponse) => void) => {
    socketRef.current?.on("command_response", callback);
    return () => socketRef.current?.off("command_response", callback);
  }, []);

  const getSocket = useCallback(() => socketRef.current, []);

  return {
    ...state,
    getSocket,
    watchComputer,
    unwatchComputer,
    sendCommand,
    startRemoteControl,
    sendRemoteInput,
    startTerminal,
    sendTerminalInput,
    requestScreenshot,
    initiateFileTransfer,
    onScreenFrame,
    onHeartbeat,
    onKeystrokes,
    onClipboard,
    onProcessList,
    onTerminalOutput,
    onCommandResponse,
  };
}
