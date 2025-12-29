import { app, BrowserWindow, Tray, Menu, nativeImage, powerMonitor, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';
import AutoLaunch from 'auto-launch';
import * as crypto from 'crypto';
import { AgentService } from './services/agent-service';
import { hashPassword, verifyPassword, isLegacyHash } from './utils/password';
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

// Load external configuration if available
interface AgentConfig {
  serverUrl: string;
  autoStart: boolean;
  screenshotInterval: number;
  activityLogInterval: number;
  adminPasswordHash: string;
}

function loadExternalConfig(): Partial<AgentConfig> {
  const configPaths = [
    path.join(app.getPath('userData'), 'config.json'),
    path.join(process.resourcesPath || '', 'config.json'),
    path.join(__dirname, '../../config.json'),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData);
        console.log(`Loaded config from: ${configPath}`);
        return config;
      }
    } catch (err) {
      console.warn(`Failed to load config from ${configPath}:`, err);
    }
  }
  return {};
}

const externalConfig = loadExternalConfig();

// Configuration store with environment variable and config file support
const store = new Store({
  defaults: {
    serverUrl: externalConfig.serverUrl || process.env.NETWATCH_SERVER_URL || '',
    autoStart: externalConfig.autoStart ?? true,
    screenshotInterval: externalConfig.screenshotInterval || 5000,
    activityLogInterval: externalConfig.activityLogInterval || 10000,
    // Use external config hash, env var, or generate a random secure default
    adminPasswordHash: externalConfig.adminPasswordHash ||
      process.env.NETWATCH_ADMIN_PASSWORD_HASH ||
      crypto.createHash('sha256').update(crypto.randomBytes(32).toString('hex')).digest('hex'),
  }
});

// Global references
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agentService: AgentService | null = null;
let screenCapture: ScreenCapture | null = null;
let processMonitor: ProcessMonitor | null = null;
let activityTracker: ActivityTracker | null = null;
let clipboardMonitor: ClipboardMonitor | null = null;
let commandExecutor: CommandExecutor | null = null;
let remoteControl: RemoteControl | null = null;
let terminalService: TerminalService | null = null;
let fileTransfer: FileTransfer | null = null;
let blockingService: BlockingService | null = null;
let screenRecorder: ScreenRecorder | null = null;
let systemRestrictions: SystemRestrictions | null = null;
let keyloggerService: KeyloggerService | null = null;

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'NetWatch Agent',
  path: app.getPath('exe'),
  isHidden: false, // Always visible
});

// Password verification using secure PBKDF2
function verifyAdminPassword(password: string): boolean {
  const storedHash = store.get('adminPasswordHash') as string;
  const isValid = verifyPassword(password, storedHash);

  // Auto-migrate legacy SHA256 hashes to secure format
  if (isValid && isLegacyHash(storedHash)) {
    const newHash = hashPassword(password);
    store.set('adminPasswordHash', newHash);
    console.log('Password hash migrated to secure format');
  }

  return isValid;
}

// Update admin password (requires old password)
function updateAdminPassword(oldPassword: string, newPassword: string): boolean {
  if (!verifyAdminPassword(oldPassword)) {
    return false;
  }
  const newHash = hashPassword(newPassword);
  store.set('adminPasswordHash', newHash);
  return true;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 350,
    show: false,
    frame: true,
    resizable: false,
    skipTaskbar: false, // Always show in taskbar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../assets/index.html'));

  // Prevent window from being closed without password
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let trayIcon: Electron.NativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // Create a default icon if file doesn't exist
      trayIcon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAKRSURBVFiF7ZZNaBNBFMf/s5tNskmapLZJNcRqi4gfIFgPXgQvgnjwIHjRk+DBgyAePHjx4smTJ0+ePHny5MmTJ0+ePEmpVKytxrYxTZOYzW52x8Mm3WSTbdLGg+APFnZn5v3f+83sziyQYII9xn+tAJYVQqBpGhYWFjA3NwdN04Y1iGMHECJE13UUi0WUy2VYljWiRRwrgBAhhmGgUChgeXkZpmkCgKIoqNVqaDabCAKW67pwXRdXrlyBLMuRNqMG6OsEQoSwLAuNRgO6riMIAgCAZVlYWVlBq9WCZVlQFAWu6+LixYuQJCnSLgqgbwJCCBiGAU3TIMsygiCAaZpYXV1Fq9VCs9kEAKiqCsdxcOHChQECQa0jU0CINAoYhgFd1yFJEoIggGEYWFtbQ7PZRKPRAABkMhk4joNz587t+PKuOsKkgGEY0DQNkiQhCAI0Gg1sbm6iXq+j0WjAdd1OWafTwdmzZ3cR4EIOIbBtG5qmQRRF+L6Pur6FjY0N1Go1NJtNNBoNdDqdTlk6ncapU6cgSRJ838/VarUuAkJ3DyGEgG3b0HUdgiDA932sr69ja2sL1WoVzWYTzWYTnU6nU5ZMJnH8+HGIogjf9/OVSmXXEBACQgjYto1CoQBBEOB5HtbW1lCpVFCpVNBsNtFqtdDpdDpl8Xgcx44dgyiK8DzveKlUGhiCkCm4vb0NXdchCAI8z0OpVEKlUkG5XO4QaLfbnbJYLIYjR45AEAT4vn+yUCjA87yB9YRA2Bew22lIkoQgCFAqlVAul1EqlToE2u12pywWi+HQoUMIguBksVjc0RQMnYKBQBgGVFWF53nIF4sol8soFosdAu12u1OmqioOHDgAAPB9/1Q+nz/h+/7uTcEx/gLsE/4DOi/VKKqBcccAAAAASUVORK5CYII='
      );
    }
  } catch {
    // Create a default icon
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAKRSURBVFiF7ZZNaBNBFMf/s5tNskmapLZJNcRqi4gfIFgPXgQvgnjwIHjRk+DBgyAePHjx4smTJ0+ePHny5MmTJ0+ePEmpVKytxrYxTZOYzW52x8Mm3WSTbdLGg+APFnZn5v3f+83sziyQYII9xn+tAJYVQqBpGhYWFjA3NwdN04Y1iGMHECJE13UUi0WUy2VYljWiRRwrgBAhhmGgUChgeXkZpmkCgKIoqNVqaDabCAKW67pwXRdXrlyBLMuRNqMG6OsEQoSwLAuNRgO6riMIAgCAZVlYWVlBq9WCZVlQFAWu6+LixYuQJCnSLgqgbwJCCBiGAU3TIMsygiCAaZpYXV1Fq9VCs9kEAKiqCsdxcOHChQECQa0jU0CINAoYhgFd1yFJEoIggGEYWFtbQ7PZRKPRAABkMhk4joNz587t+PKuOsKkgGEY0DQNkiQhCAI0Gg1sbm6iXq+j0WjAdd1OWafTwdmzZ3cR4EIOIbBtG5qmQRRF+L6Pur6FjY0N1Go1NJtNNBoNdDqdTlk6ncapU6cgSRJ838/VarUuAkJ3DyGEgG3b0HUdgiDA932sr69ja2sL1WoVzWYTzWYTnU6nU5ZMJnH8+HGIogjf9/OVSmXXEBACQgjYto1CoQBBEOB5HtbW1lCpVFCpVNBsNtFqtdDpdDpl8Xgcx44dgyiK8DzveKlUGhiCkCm4vb0NXdchCAI8z0OpVEKlUkG5XO4QaLfbnbJYLIYjR45AEAT4vn+yUCjA87yB9YRA2Bew22lIkoQgCFAqlVAul1EqlToE2u12pywWi+HQoUMIguBksVjc0RQMnYKBQBgGVFWF53nIF4sol8soFosdAu12u1OmqioOHDgAAPB9/1Q+nz/h+/7uTcEx/gLsE/4DOi/VKKqBcccAAAAASUVORK5CYII='
    );
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('NetWatch Agent - Monitoring Active');

  updateTrayMenu('Connecting...');

  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

function updateTrayMenu(status: string): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Status: ${status}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Status Window',
      click: () => mainWindow?.show(),
    },
    {
      label: 'About NetWatch',
      click: () => {
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
      label: 'Exit (Admin Only)',
      click: async () => {
        await promptForAdminPassword();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

async function promptForAdminPassword(): Promise<void> {
  // Create a simple password dialog window
  const passwordWindow = new BrowserWindow({
    width: 350,
    height: 180,
    parent: mainWindow || undefined,
    modal: true,
    show: false,
    frame: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 20px;
          background: #f5f5f5;
        }
        h3 { margin: 0 0 15px 0; color: #333; }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-sizing: border-box;
        }
        .buttons { display: flex; gap: 10px; margin-top: 15px; }
        button {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .primary { background: #007bff; color: white; }
        .secondary { background: #6c757d; color: white; }
        .error { color: red; font-size: 12px; display: none; }
      </style>
    </head>
    <body>
      <h3>Admin Password Required</h3>
      <input type="password" id="password" placeholder="Enter admin password" autofocus>
      <div class="error" id="error">Incorrect password</div>
      <div class="buttons">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="verify()">Verify</button>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        document.getElementById('password').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') verify();
        });
        function verify() {
          const password = document.getElementById('password').value;
          ipcRenderer.send('verify-admin-password', password);
        }
        function cancel() {
          ipcRenderer.send('cancel-password-dialog');
        }
        ipcRenderer.on('password-invalid', () => {
          document.getElementById('error').style.display = 'block';
          document.getElementById('password').value = '';
          document.getElementById('password').focus();
        });
      </script>
    </body>
    </html>
  `;

  passwordWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  passwordWindow.once('ready-to-show', () => {
    passwordWindow.show();
  });

  // Handle password verification
  ipcMain.once('verify-admin-password', (_, password: string) => {
    if (verifyAdminPassword(password)) {
      passwordWindow.close();
      app.isQuitting = true;
      app.quit();
    } else {
      passwordWindow.webContents.send('password-invalid');
      // Re-register handler for retry
      ipcMain.once('verify-admin-password', (__, retryPassword: string) => {
        if (verifyAdminPassword(retryPassword)) {
          passwordWindow.close();
          app.isQuitting = true;
          app.quit();
        } else {
          dialog.showErrorBox('Access Denied', 'Incorrect password. Exit cancelled.');
          passwordWindow.close();
        }
      });
    }
  });

  ipcMain.once('cancel-password-dialog', () => {
    passwordWindow.close();
  });
}

async function initializeServices(): Promise<void> {
  const serverUrl = store.get('serverUrl') as string;

  // Initialize core agent service (handles socket connection)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentService = new AgentService(serverUrl, store as any);

  // Initialize monitoring services
  screenCapture = new ScreenCapture(agentService);
  processMonitor = new ProcessMonitor(agentService);
  activityTracker = new ActivityTracker(agentService);
  clipboardMonitor = new ClipboardMonitor(agentService);
  keyloggerService = new KeyloggerService(agentService);

  // Initialize control services
  commandExecutor = new CommandExecutor(agentService);
  remoteControl = new RemoteControl(agentService);
  terminalService = new TerminalService(agentService);
  fileTransfer = new FileTransfer(agentService);
  blockingService = new BlockingService(agentService);
  screenRecorder = new ScreenRecorder(agentService);
  systemRestrictions = new SystemRestrictions(agentService);

  // Set up connection status callback
  agentService.onConnectionChange((connected) => {
    updateTrayMenu(connected ? 'Connected' : 'Disconnected');
  });

  // Connect to server
  await agentService.connect();

  // Start monitoring services
  screenCapture.start();
  processMonitor.start();
  activityTracker.start();
  clipboardMonitor.start();
  keyloggerService.start();
  blockingService.start();

  // Register command handlers
  commandExecutor.registerHandlers();
  remoteControl.registerHandlers();
  terminalService.registerHandlers();
  fileTransfer.registerHandlers();
  systemRestrictions.registerHandlers();

  updateTrayMenu('Connected');
  console.log('All services initialized and running');
}

async function setupAutoStart(): Promise<void> {
  const autoStart = store.get('autoStart') as boolean;

  try {
    const isEnabled = await autoLauncher.isEnabled();

    if (autoStart && !isEnabled) {
      await autoLauncher.enable();
      console.log('Auto-start enabled');
    } else if (!autoStart && isEnabled) {
      await autoLauncher.disable();
      console.log('Auto-start disabled');
    }
  } catch (error) {
    console.error('Failed to configure auto-start:', error);
  }
}

// Power state monitoring
function setupPowerMonitoring(): void {
  powerMonitor.on('suspend', () => {
    console.log('System suspending');
    agentService?.sendHeartbeat({ isIdle: true, idleTime: 0 });
  });

  powerMonitor.on('resume', () => {
    console.log('System resumed');
    agentService?.reconnect();
  });

  powerMonitor.on('lock-screen', () => {
    console.log('Screen locked');
    agentService?.sendHeartbeat({ isIdle: true, idleTime: 0 });
  });

  powerMonitor.on('unlock-screen', () => {
    console.log('Screen unlocked');
    agentService?.sendHeartbeat({ isIdle: false, idleTime: 0 });
  });
}

// First-time setup to configure server URL
async function showFirstTimeSetup(): Promise<boolean> {
  return new Promise((resolve) => {
    const setupWindow = new BrowserWindow({
      width: 500,
      height: 400,
      resizable: false,
      frame: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 30px;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: white;
            margin: 0;
          }
          h2 { margin: 0 0 10px 0; font-size: 24px; }
          p { color: #94a3b8; margin: 0 0 25px 0; }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 500; }
          input {
            width: 100%;
            padding: 12px;
            border: 1px solid #334155;
            border-radius: 8px;
            background: #1e293b;
            color: white;
            font-size: 14px;
            box-sizing: border-box;
          }
          input:focus { outline: none; border-color: #3b82f6; }
          input::placeholder { color: #64748b; }
          .hint { font-size: 12px; color: #64748b; margin-top: 6px; }
          .buttons { display: flex; gap: 12px; margin-top: 30px; }
          button {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          }
          .primary { background: #3b82f6; color: white; }
          .primary:hover { background: #2563eb; }
          .secondary { background: #334155; color: white; }
          .secondary:hover { background: #475569; }
          .logo { text-align: center; margin-bottom: 20px; }
          .logo svg { width: 48px; height: 48px; }
          .error { color: #ef4444; font-size: 12px; margin-top: 6px; display: none; }
        </style>
      </head>
      <body>
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h2>NetWatch Agent Setup</h2>
        <p>Configure the connection to your NetWatch server</p>

        <div class="form-group">
          <label for="serverUrl">Server URL</label>
          <input type="url" id="serverUrl" placeholder="https://your-netwatch-server.com" required>
          <div class="hint">Enter the URL of your NetWatch dashboard server</div>
          <div class="error" id="urlError">Please enter a valid URL</div>
        </div>

        <div class="form-group">
          <label for="adminPassword">Admin Password</label>
          <input type="password" id="adminPassword" placeholder="Enter a secure password">
          <div class="hint">This password is required to exit or reconfigure the agent</div>
        </div>

        <div class="buttons">
          <button class="secondary" onclick="cancel()">Cancel</button>
          <button class="primary" onclick="save()">Save & Connect</button>
        </div>

        <script>
          const { ipcRenderer } = require('electron');

          document.getElementById('serverUrl').focus();

          function isValidUrl(string) {
            try {
              const url = new URL(string);
              return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (_) {
              return false;
            }
          }

          function save() {
            const serverUrl = document.getElementById('serverUrl').value.trim();
            const adminPassword = document.getElementById('adminPassword').value;

            if (!isValidUrl(serverUrl)) {
              document.getElementById('urlError').style.display = 'block';
              return;
            }
            document.getElementById('urlError').style.display = 'none';

            ipcRenderer.send('setup-complete', { serverUrl, adminPassword });
          }

          function cancel() {
            ipcRenderer.send('setup-cancelled');
          }

          document.getElementById('serverUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              document.getElementById('adminPassword').focus();
            }
          });

          document.getElementById('adminPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') save();
          });
        </script>
      </body>
      </html>
    `;

    setupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    setupWindow.show();

    ipcMain.once('setup-complete', (_, data: { serverUrl: string; adminPassword: string }) => {
      store.set('serverUrl', data.serverUrl);
      if (data.adminPassword) {
        // Use secure PBKDF2 hashing
        const hash = hashPassword(data.adminPassword);
        store.set('adminPasswordHash', hash);
      }
      setupWindow.close();
      resolve(true);
    });

    ipcMain.once('setup-cancelled', () => {
      setupWindow.close();
      resolve(false);
    });

    setupWindow.on('closed', () => {
      resolve(false);
    });
  });
}

// Application lifecycle
app.on('ready', async () => {
  console.log('NetWatch Agent starting...');

  // Check if first-time setup is needed
  const serverUrl = store.get('serverUrl') as string;
  if (!serverUrl) {
    console.log('No server URL configured, showing setup...');
    const setupComplete = await showFirstTimeSetup();
    if (!setupComplete) {
      console.log('Setup cancelled, exiting...');
      app.quit();
      return;
    }
  }

  createWindow();
  createTray();
  await setupAutoStart();
  setupPowerMonitoring();

  try {
    await initializeServices();
    console.log('NetWatch Agent is running');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    updateTrayMenu('Error');
  }
});

app.on('window-all-closed', () => {
  // Keep running in background - don't quit
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;

  // Cleanup services
  screenCapture?.stop();
  processMonitor?.stop();
  activityTracker?.stop();
  clipboardMonitor?.stop();
  keyloggerService?.stop();
  blockingService?.stop();
  terminalService?.stopAll();
  agentService?.disconnect();

  console.log('NetWatch Agent stopped');
});

// Type extension is in types.d.ts

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
