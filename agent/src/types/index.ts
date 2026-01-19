import { ScheduleConfig } from '../utils/schedule';

// Agent configuration interface
export interface AgentConfig {
  serverUrl: string;
  autoStart: boolean;
  screenshotInterval: number;
  activityLogInterval: number;
  adminPasswordHash: string;
  schedule: ScheduleConfig;
}

// Store schema type
export interface StoreSchema {
  serverUrl: string;
  autoStart: boolean;
  screenshotInterval: number;
  activityLogInterval: number;
  adminPasswordHash: string;
  schedule: ScheduleConfig;
}

// App state interface
export interface AppState {
  isMonitoringEnabled: boolean;
  scheduleCheckInterval: NodeJS.Timeout | null;
}

// Service references interface
export interface ServiceRefs {
  agentService: import('../services/agent-service').AgentService | null;
  screenCapture: import('../services/screen-capture').ScreenCapture | null;
  processMonitor: import('../services/process-monitor').ProcessMonitor | null;
  activityTracker: import('../services/activity-tracker').ActivityTracker | null;
  clipboardMonitor: import('../services/clipboard-monitor').ClipboardMonitor | null;
  commandExecutor: import('../services/command-executor').CommandExecutor | null;
  remoteControl: import('../services/remote-control').RemoteControl | null;
  terminalService: import('../services/terminal-service').TerminalService | null;
  fileTransfer: import('../services/file-transfer').FileTransfer | null;
  blockingService: import('../services/blocking-service').BlockingService | null;
  screenRecorder: import('../services/screen-recorder').ScreenRecorder | null;
  systemRestrictions: import('../services/system-restrictions').SystemRestrictions | null;
  keyloggerService: import('../services/keylogger-service').KeyloggerService | null;
}

// Window references interface
export interface WindowRefs {
  mainWindow: Electron.BrowserWindow | null;
  tray: Electron.Tray | null;
}

// Setup data from first-time setup
export interface SetupData {
  serverUrl: string;
  adminPassword: string;
  schedule: ScheduleConfig;
}
