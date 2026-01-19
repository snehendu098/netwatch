import { io, Socket } from 'socket.io-client';
import { machineIdSync } from 'node-machine-id';
import * as os from 'os';
import * as si from 'systeminformation';
import Store from 'electron-store';
import { EventEmitter } from 'events';

interface AgentConfig {
  screenshotInterval: number;
  activityLogInterval: number;
  keystrokeBufferSize: number;
}

interface HeartbeatData {
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  activeWindow?: string;
  activeProcess?: string;
  isIdle?: boolean;
  idleTime?: number;
}

interface CommandData {
  id: string;
  command: string;
  payload?: Record<string, unknown>;
}

export class AgentService extends EventEmitter {
  private socket: Socket | null = null;
  private serverUrl: string;
  private store: Store<Record<string, unknown>>;
  private machineId: string;
  private computerId: string | null = null;
  private config: AgentConfig = {
    screenshotInterval: 5000,
    activityLogInterval: 10000,
    keystrokeBufferSize: 100,
  };
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private connectionChangeCallback: ((connected: boolean) => void) | null = null;

  constructor(serverUrl: string, store: Store<Record<string, unknown>>) {
    super();
    this.serverUrl = serverUrl;
    this.store = store;
    this.machineId = machineIdSync();
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionChangeCallback = callback;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to server: ${this.serverUrl}`);

      // Parse URL to handle path prefixes (e.g., https://domain.com/nw-socket)
      let socketUrl = this.serverUrl;
      let socketPath = '/socket.io';

      try {
        const url = new URL(this.serverUrl);
        if (url.pathname && url.pathname !== '/') {
          // Server has a path prefix, adjust socket.io path accordingly
          socketPath = `${url.pathname.replace(/\/$/, '')}/socket.io`;
          socketUrl = `${url.protocol}//${url.host}`;
          console.log(`Using custom socket path: ${socketPath}`);
        }
      } catch (e) {
        console.warn('Could not parse server URL, using as-is');
      }

      this.socket = io(`${socketUrl}/agent`, {
        path: socketPath,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 20000,
      });

      this.socket.on('connect', async () => {
        console.log('Connected to server');
        this.reconnectAttempts = 0;

        // Send authentication
        const systemInfo = await this.getSystemInfo();
        this.socket?.emit('auth', systemInfo);
      });

      this.socket.on('auth_success', (data: { computerId: string; config: AgentConfig }) => {
        console.log(`Authenticated as computer: ${data.computerId}`);
        this.computerId = data.computerId;
        this.config = { ...this.config, ...data.config };

        // Start heartbeat
        this.startHeartbeat();

        // Notify connection change
        this.connectionChangeCallback?.(true);

        // Emit ready event
        this.emit('ready', data);
        resolve();
      });

      this.socket.on('auth_error', (data: { message: string }) => {
        console.error('Authentication failed:', data.message);
        reject(new Error(data.message));
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        this.stopHeartbeat();
        this.connectionChangeCallback?.(false);
        this.emit('disconnected', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        this.reconnectAttempts++;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Max reconnection attempts reached'));
        }
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        this.emit('reconnected');
      });

      // Command handlers
      this.socket.on('command', (data: CommandData) => {
        console.log(`Received command: ${data.command}`);
        this.emit('command', data);
      });

      this.socket.on('start_screen_stream', (data: { quality: number; fps: number }) => {
        this.emit('start_screen_stream', data);
      });

      this.socket.on('stop_screen_stream', () => {
        this.emit('stop_screen_stream');
      });

      this.socket.on('capture_screenshot', () => {
        this.emit('capture_screenshot');
      });

      this.socket.on('remote_input', (data: { type: string; event: Record<string, unknown> }) => {
        this.emit('remote_input', data);
      });

      this.socket.on('start_remote_control', (data: { sessionId: string; mode: string; quality: number; fps: number }) => {
        this.emit('start_remote_control', data);
      });

      this.socket.on('start_terminal', (data: { sessionId: string; shell?: string }) => {
        this.emit('start_terminal', data);
      });

      this.socket.on('terminal_input', (data: { sessionId: string; input: string }) => {
        this.emit('terminal_input', data);
      });

      this.socket.on('file_transfer', (data: { transferId: string; direction: string; remotePath: string; fileData?: string }) => {
        this.emit('file_transfer', data);
      });
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    await this.connect();
  }

  private async getSystemInfo(): Promise<Record<string, unknown>> {
    const [osInfo, networkInterfaces] = await Promise.all([
      si.osInfo(),
      si.networkInterfaces(),
    ]);

    // Get primary network interface
    const primaryInterface = (networkInterfaces as si.Systeminformation.NetworkInterfacesData[]).find(
      (iface) => !iface.internal && iface.mac !== '00:00:00:00:00:00'
    );

    return {
      machineId: this.machineId,
      hostname: os.hostname(),
      osType: osInfo.platform.toUpperCase(),
      osVersion: `${osInfo.distro} ${osInfo.release}`,
      macAddress: primaryInterface?.mac || 'unknown',
      ipAddress: primaryInterface?.ip4 || 'unknown',
      agentVersion: '1.0.0',
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat({});
    }, 10000);

    // Send initial heartbeat
    this.sendHeartbeat({});
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async sendHeartbeat(data: HeartbeatData): Promise<void> {
    if (!this.socket?.connected) return;

    try {
      const [cpu, mem, disk] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
      ]);

      const primaryDisk = disk[0];
      const memUsage = ((mem.total - mem.available) / mem.total) * 100;
      const diskUsage = primaryDisk ? primaryDisk.use : 0;

      this.socket.emit('heartbeat', {
        cpuUsage: data.cpuUsage ?? cpu.currentLoad,
        memoryUsage: data.memoryUsage ?? memUsage,
        diskUsage: data.diskUsage ?? diskUsage,
        activeWindow: data.activeWindow,
        activeProcess: data.activeProcess,
        isIdle: data.isIdle ?? false,
        idleTime: data.idleTime ?? 0,
      });
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  // Emit methods for sending data to server
  sendScreenFrame(frame: string, monitorIndex: number = 0): void {
    if (!this.socket?.connected) return;

    this.socket.emit('screen_frame', {
      frame,
      timestamp: Date.now(),
      monitorIndex,
    });
  }

  sendScreenshot(image: string, activeWindow: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('screenshot', {
      image,
      timestamp: Date.now(),
      activeWindow,
    });
  }

  sendActivityLogs(logs: Array<{
    applicationName: string;
    windowTitle: string;
    startTime: number;
    endTime: number;
    duration: number;
    category?: string;
  }>): void {
    if (!this.socket?.connected) return;

    this.socket.emit('activity_log', { logs });
  }

  sendKeystrokes(strokes: Array<{
    keys: string;
    applicationName: string;
    windowTitle: string;
    timestamp: number;
  }>): void {
    if (!this.socket?.connected) return;

    this.socket.emit('keystrokes', { strokes });
  }

  sendClipboard(content: string, contentType: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('clipboard', {
      content,
      contentType,
      timestamp: Date.now(),
    });
  }

  sendProcessList(processes: Array<{
    processName: string;
    processId: number;
    path: string;
    cpuUsage: number;
    memoryUsage: number;
    username: string;
    startedAt?: number;
  }>): void {
    if (!this.socket?.connected) return;

    this.socket.emit('process_list', { processes });
  }

  sendWebsiteVisit(data: {
    url: string;
    title: string;
    browser: string;
    duration: number;
  }): void {
    if (!this.socket?.connected) return;

    this.socket.emit('website_visit', {
      ...data,
      timestamp: Date.now(),
    });
  }

  sendCommandResponse(commandId: string, success: boolean, response?: string, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('command_response', {
      commandId,
      success,
      response,
      error,
    });
  }

  sendTerminalOutput(sessionId: string, output: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('terminal_output', {
      sessionId,
      output,
    });
  }

  sendFileTransferProgress(transferId: string, progress: number, bytesTransferred: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('file_transfer_progress', {
      transferId,
      progress,
      bytesTransferred,
    });
  }

  sendRecordingStatus(recordingId: string, status: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('recording_status', {
      recordingId,
      status,
      timestamp: Date.now(),
    });
  }

  sendRecordingComplete(recordingId: string, filePath: string, duration: number, fileSize: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('recording_complete', {
      recordingId,
      filePath,
      duration,
      fileSize,
      timestamp: Date.now(),
    });
  }

  sendRecordingChunk(recordingId: string, chunk: string, chunkIndex: number, totalChunks: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('recording_chunk', {
      recordingId,
      chunk,
      chunkIndex,
      totalChunks,
    });
  }

  getConfig(): AgentConfig {
    return this.config;
  }

  getComputerId(): string | null {
    return this.computerId;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
