import { app, BrowserWindow, Tray, Menu, nativeImage, powerMonitor, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';
import AutoLaunch from 'auto-launch';
import * as crypto from 'crypto';
import { AgentService } from './services/agent-service';
import { hashPassword, verifyPassword, isLegacyHash } from './utils/password';
import { ScheduleConfig, DEFAULT_SCHEDULE, isMonitoringActive, getScheduleDescription, validateSchedule } from './utils/schedule';
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
  schedule: ScheduleConfig;
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
    // Schedule configuration
    schedule: externalConfig.schedule || DEFAULT_SCHEDULE,
  }
});

// Track monitoring state
let isMonitoringEnabled = false;  // Will be set by schedule checking
let scheduleCheckInterval: NodeJS.Timeout | null = null;

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

  const schedule = store.get('schedule') as ScheduleConfig;
  const scheduleDesc = getScheduleDescription(schedule);

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
        dialog.showMessageBox({
          type: 'info',
          title: 'Monitoring Schedule',
          message: 'Current Schedule',
          detail: scheduleDesc,
        });
      },
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
      label: 'Configure Schedule (Admin)',
      click: async () => {
        await promptForScheduleConfig();
      },
    },
    {
      label: 'Exit (Admin Only)',
      click: async () => {
        await promptForAdminPassword();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`NetWatch Agent - ${status}`);
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

// Prompt for schedule configuration (admin-protected)
async function promptForScheduleConfig(): Promise<void> {
  // First verify admin password
  const passwordVerified = await new Promise<boolean>((resolve) => {
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; background: #f5f5f5; }
          h3 { margin: 0 0 15px 0; color: #333; }
          input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
          .buttons { display: flex; gap: 10px; margin-top: 15px; }
          button { flex: 1; padding: 10px; border: none; border-radius: 4px; cursor: pointer; }
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
          document.getElementById('password').addEventListener('keypress', (e) => { if (e.key === 'Enter') verify(); });
          function verify() { ipcRenderer.send('verify-schedule-password', document.getElementById('password').value); }
          function cancel() { ipcRenderer.send('cancel-schedule-password'); }
          ipcRenderer.on('password-invalid-schedule', () => {
            document.getElementById('error').style.display = 'block';
            document.getElementById('password').value = '';
          });
        </script>
      </body>
      </html>
    `;

    passwordWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    passwordWindow.once('ready-to-show', () => passwordWindow.show());

    const cleanup = () => {
      ipcMain.removeAllListeners('verify-schedule-password');
      ipcMain.removeAllListeners('cancel-schedule-password');
    };

    ipcMain.once('verify-schedule-password', (_, password: string) => {
      if (verifyAdminPassword(password)) {
        cleanup();
        passwordWindow.close();
        resolve(true);
      } else {
        passwordWindow.webContents.send('password-invalid-schedule');
        ipcMain.once('verify-schedule-password', (__, retryPassword: string) => {
          cleanup();
          passwordWindow.close();
          resolve(verifyAdminPassword(retryPassword));
        });
      }
    });

    ipcMain.once('cancel-schedule-password', () => {
      cleanup();
      passwordWindow.close();
      resolve(false);
    });

    passwordWindow.on('closed', () => {
      cleanup();
      resolve(false);
    });
  });

  if (!passwordVerified) return;

  // Show schedule configuration dialog
  const currentSchedule = store.get('schedule') as ScheduleConfig;

  const scheduleWindow = new BrowserWindow({
    width: 500,
    height: 450,
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 25px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; margin: 0; }
        h3 { margin: 0 0 20px 0; font-size: 18px; }
        label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 500; font-size: 14px; }
        .hint { font-size: 12px; color: #64748b; margin-top: 8px; }
        .buttons { display: flex; gap: 12px; margin-top: 25px; }
        button { flex: 1; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; }
        .primary { background: #3b82f6; color: white; }
        .primary:hover { background: #2563eb; }
        .secondary { background: #334155; color: white; }
        .secondary:hover { background: #475569; }
        .schedule-toggle { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .toggle-switch { position: relative; width: 48px; height: 26px; background: #334155; border-radius: 13px; cursor: pointer; transition: background 0.3s; }
        .toggle-switch.active { background: #3b82f6; }
        .toggle-switch::after { content: ''; position: absolute; width: 22px; height: 22px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: left 0.3s; }
        .toggle-switch.active::after { left: 24px; }
        .toggle-label { font-size: 14px; color: #e2e8f0; }
        .schedule-options { display: none; }
        .schedule-options.visible { display: block; }
        .days-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; }
        .day-btn { padding: 8px 12px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #94a3b8; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .day-btn.selected { background: #3b82f6; border-color: #3b82f6; color: white; }
        .day-btn:hover { border-color: #3b82f6; }
        .time-row { display: flex; gap: 15px; align-items: center; }
        .time-row .form-group { flex: 1; margin-bottom: 0; }
        input[type="time"] { width: 100%; padding: 10px; border: 1px solid #334155; border-radius: 8px; background: #1e293b; color: white; font-size: 14px; box-sizing: border-box; }
        input[type="time"]:focus { outline: none; border-color: #3b82f6; }
        .form-group { margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <h3>Configure Monitoring Schedule</h3>

      <div class="schedule-toggle">
        <div class="toggle-switch ${currentSchedule.enabled ? 'active' : ''}" id="scheduleToggle" onclick="toggleSchedule()"></div>
        <span class="toggle-label" id="scheduleLabel">${currentSchedule.enabled ? 'Custom Schedule' : 'Always Active (24/7)'}</span>
      </div>

      <div class="schedule-options ${currentSchedule.enabled ? 'visible' : ''}" id="scheduleOptions">
        <label>Active Days</label>
        <div class="days-grid">
          <button type="button" class="day-btn ${currentSchedule.days.includes(0) ? 'selected' : ''}" data-day="0">Sun</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(1) ? 'selected' : ''}" data-day="1">Mon</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(2) ? 'selected' : ''}" data-day="2">Tue</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(3) ? 'selected' : ''}" data-day="3">Wed</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(4) ? 'selected' : ''}" data-day="4">Thu</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(5) ? 'selected' : ''}" data-day="5">Fri</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(6) ? 'selected' : ''}" data-day="6">Sat</button>
        </div>

        <div class="time-row">
          <div class="form-group">
            <label for="startTime">Start Time</label>
            <input type="time" id="startTime" value="${currentSchedule.startTime}">
          </div>
          <div class="form-group">
            <label for="endTime">End Time</label>
            <input type="time" id="endTime" value="${currentSchedule.endTime}">
          </div>
        </div>
        <div class="hint">Monitoring will only be active during these hours on selected days</div>
      </div>

      <div class="buttons">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="save()">Save Schedule</button>
      </div>

      <script>
        const { ipcRenderer } = require('electron');
        let scheduleEnabled = ${currentSchedule.enabled};
        let selectedDays = ${JSON.stringify(currentSchedule.days)};

        document.querySelectorAll('.day-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const day = parseInt(btn.dataset.day);
            btn.classList.toggle('selected');
            if (btn.classList.contains('selected')) {
              if (!selectedDays.includes(day)) selectedDays.push(day);
            } else {
              selectedDays = selectedDays.filter(d => d !== day);
            }
            selectedDays.sort((a, b) => a - b);
          });
        });

        function toggleSchedule() {
          scheduleEnabled = !scheduleEnabled;
          const toggle = document.getElementById('scheduleToggle');
          const label = document.getElementById('scheduleLabel');
          const options = document.getElementById('scheduleOptions');
          if (scheduleEnabled) {
            toggle.classList.add('active');
            label.textContent = 'Custom Schedule';
            options.classList.add('visible');
          } else {
            toggle.classList.remove('active');
            label.textContent = 'Always Active (24/7)';
            options.classList.remove('visible');
          }
        }

        function save() {
          const schedule = {
            enabled: scheduleEnabled,
            days: selectedDays,
            startTime: document.getElementById('startTime').value,
            endTime: document.getElementById('endTime').value
          };
          ipcRenderer.send('save-schedule-config', schedule);
        }

        function cancel() {
          ipcRenderer.send('cancel-schedule-config');
        }
      </script>
    </body>
    </html>
  `;

  scheduleWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  scheduleWindow.once('ready-to-show', () => scheduleWindow.show());

  ipcMain.once('save-schedule-config', (_, newSchedule: ScheduleConfig) => {
    store.set('schedule', validateSchedule(newSchedule));
    scheduleWindow.close();
    // Restart schedule checking with new config
    setupScheduleChecking();
    dialog.showMessageBox({
      type: 'info',
      title: 'Schedule Updated',
      message: 'Monitoring schedule has been updated.',
      detail: getScheduleDescription(store.get('schedule') as ScheduleConfig),
    });
  });

  ipcMain.once('cancel-schedule-config', () => {
    scheduleWindow.close();
  });

  scheduleWindow.on('closed', () => {
    ipcMain.removeAllListeners('save-schedule-config');
    ipcMain.removeAllListeners('cancel-schedule-config');
  });
}

async function initializeServices(): Promise<void> {
  const serverUrl = store.get('serverUrl') as string;

  // Initialize core agent service (handles socket connection)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentService = new AgentService(serverUrl, store as any);

  // Initialize monitoring services (but don't start them yet)
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
    // Only show "Connected" if monitoring is active
    if (isMonitoringEnabled) {
      updateTrayMenu(connected ? 'Connected' : 'Disconnected');
    } else {
      updateTrayMenu('Paused (Scheduled)');
    }
  });

  // Connect to server (always maintain connection for commands)
  await agentService.connect();

  // Register command handlers (always available)
  commandExecutor.registerHandlers();
  remoteControl.registerHandlers();
  terminalService.registerHandlers();
  fileTransfer.registerHandlers();
  systemRestrictions.registerHandlers();

  // Setup schedule checking - this will start/stop monitoring as needed
  setupScheduleChecking();

  console.log('All services initialized');
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
    // Check schedule on resume
    checkScheduleAndUpdateMonitoring();
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

// Start monitoring services
function startMonitoringServices(): void {
  if (isMonitoringEnabled) {
    console.log('Monitoring already active');
    return;
  }

  console.log('Starting monitoring services...');
  screenCapture?.start();
  processMonitor?.start();
  activityTracker?.start();
  clipboardMonitor?.start();
  keyloggerService?.start();
  blockingService?.start();

  isMonitoringEnabled = true;
  updateTrayMenu(agentService?.isConnected() ? 'Connected' : 'Disconnected');
  console.log('Monitoring services started');
}

// Stop monitoring services
function stopMonitoringServices(): void {
  if (!isMonitoringEnabled) {
    console.log('Monitoring already inactive');
    return;
  }

  console.log('Stopping monitoring services...');
  screenCapture?.stop();
  processMonitor?.stop();
  activityTracker?.stop();
  clipboardMonitor?.stop();
  keyloggerService?.stop();
  // Keep blocking service running to maintain blocks
  // blockingService?.stop();

  isMonitoringEnabled = false;
  updateTrayMenu('Paused (Scheduled)');
  console.log('Monitoring services stopped');
}

// Check schedule and update monitoring state
function checkScheduleAndUpdateMonitoring(): void {
  const schedule = store.get('schedule') as ScheduleConfig;
  const shouldBeActive = isMonitoringActive(schedule);

  if (shouldBeActive && !isMonitoringEnabled) {
    console.log('Schedule: Monitoring period started');
    startMonitoringServices();
  } else if (!shouldBeActive && isMonitoringEnabled) {
    console.log('Schedule: Monitoring period ended');
    stopMonitoringServices();
  }
}

// Setup schedule checking interval
function setupScheduleChecking(): void {
  const schedule = store.get('schedule') as ScheduleConfig;

  // Clear existing interval if any
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
    scheduleCheckInterval = null;
  }

  // If scheduling is disabled, ensure monitoring is active
  if (!schedule.enabled) {
    console.log('Schedule: Always active (24/7)');
    if (!isMonitoringEnabled) {
      startMonitoringServices();
    }
    return;
  }

  // Check every minute for schedule changes
  console.log('Schedule: ' + getScheduleDescription(schedule));
  scheduleCheckInterval = setInterval(checkScheduleAndUpdateMonitoring, 60000);

  // Do initial check
  checkScheduleAndUpdateMonitoring();
}

// First-time setup to configure server URL and schedule
async function showFirstTimeSetup(): Promise<boolean> {
  return new Promise((resolve) => {
    const setupWindow = new BrowserWindow({
      width: 550,
      height: 700,
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
            overflow-y: auto;
          }
          h2 { margin: 0 0 10px 0; font-size: 24px; }
          h3 { margin: 20px 0 10px 0; font-size: 16px; color: #e2e8f0; }
          p { color: #94a3b8; margin: 0 0 20px 0; }
          .form-group { margin-bottom: 16px; }
          label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 500; }
          input[type="url"], input[type="password"], input[type="time"] {
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
          .buttons { display: flex; gap: 12px; margin-top: 25px; }
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
          .logo { text-align: center; margin-bottom: 15px; }
          .logo svg { width: 40px; height: 40px; }
          .error { color: #ef4444; font-size: 12px; margin-top: 6px; display: none; }

          /* Schedule styles */
          .schedule-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155; }
          .schedule-toggle { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
          .toggle-switch {
            position: relative;
            width: 48px;
            height: 26px;
            background: #334155;
            border-radius: 13px;
            cursor: pointer;
            transition: background 0.3s;
          }
          .toggle-switch.active { background: #3b82f6; }
          .toggle-switch::after {
            content: '';
            position: absolute;
            width: 22px;
            height: 22px;
            background: white;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            transition: left 0.3s;
          }
          .toggle-switch.active::after { left: 24px; }
          .toggle-label { font-size: 14px; color: #e2e8f0; }

          .schedule-options { display: none; }
          .schedule-options.visible { display: block; }

          .days-grid {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 15px;
          }
          .day-btn {
            padding: 8px 12px;
            border: 1px solid #334155;
            border-radius: 6px;
            background: #1e293b;
            color: #94a3b8;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
          }
          .day-btn.selected {
            background: #3b82f6;
            border-color: #3b82f6;
            color: white;
          }
          .day-btn:hover { border-color: #3b82f6; }

          .time-row {
            display: flex;
            gap: 15px;
            align-items: center;
          }
          .time-row .form-group { flex: 1; margin-bottom: 0; }
          .time-row input[type="time"] { padding: 10px; }

          .preset-btns {
            display: flex;
            gap: 8px;
            margin-bottom: 15px;
          }
          .preset-btn {
            padding: 6px 12px;
            border: 1px solid #334155;
            border-radius: 6px;
            background: transparent;
            color: #94a3b8;
            cursor: pointer;
            font-size: 12px;
          }
          .preset-btn:hover { border-color: #3b82f6; color: #3b82f6; }
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

        <div class="schedule-section">
          <h3>Monitoring Schedule</h3>
          <div class="schedule-toggle">
            <div class="toggle-switch" id="scheduleToggle" onclick="toggleSchedule()"></div>
            <span class="toggle-label" id="scheduleLabel">Always Active (24/7)</span>
          </div>

          <div class="schedule-options" id="scheduleOptions">
            <div class="preset-btns">
              <button type="button" class="preset-btn" onclick="setPreset('weekdays')">Weekdays Only</button>
              <button type="button" class="preset-btn" onclick="setPreset('alldays')">All Days</button>
              <button type="button" class="preset-btn" onclick="setPreset('business')">Business Hours</button>
            </div>

            <label>Active Days</label>
            <div class="days-grid">
              <button type="button" class="day-btn" data-day="0">Sun</button>
              <button type="button" class="day-btn selected" data-day="1">Mon</button>
              <button type="button" class="day-btn selected" data-day="2">Tue</button>
              <button type="button" class="day-btn selected" data-day="3">Wed</button>
              <button type="button" class="day-btn selected" data-day="4">Thu</button>
              <button type="button" class="day-btn selected" data-day="5">Fri</button>
              <button type="button" class="day-btn" data-day="6">Sat</button>
            </div>

            <div class="time-row">
              <div class="form-group">
                <label for="startTime">Start Time</label>
                <input type="time" id="startTime" value="09:00">
              </div>
              <div class="form-group">
                <label for="endTime">End Time</label>
                <input type="time" id="endTime" value="18:00">
              </div>
            </div>
            <div class="hint">Monitoring will only be active during these hours on selected days</div>
          </div>
        </div>

        <div class="buttons">
          <button class="secondary" onclick="cancel()">Cancel</button>
          <button class="primary" onclick="save()">Save & Connect</button>
        </div>

        <script>
          const { ipcRenderer } = require('electron');

          let scheduleEnabled = false;
          let selectedDays = [1, 2, 3, 4, 5]; // Mon-Fri default

          document.getElementById('serverUrl').focus();

          // Day button click handlers
          document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const day = parseInt(btn.dataset.day);
              btn.classList.toggle('selected');
              if (btn.classList.contains('selected')) {
                if (!selectedDays.includes(day)) selectedDays.push(day);
              } else {
                selectedDays = selectedDays.filter(d => d !== day);
              }
              selectedDays.sort((a, b) => a - b);
            });
          });

          function toggleSchedule() {
            scheduleEnabled = !scheduleEnabled;
            const toggle = document.getElementById('scheduleToggle');
            const label = document.getElementById('scheduleLabel');
            const options = document.getElementById('scheduleOptions');

            if (scheduleEnabled) {
              toggle.classList.add('active');
              label.textContent = 'Custom Schedule';
              options.classList.add('visible');
            } else {
              toggle.classList.remove('active');
              label.textContent = 'Always Active (24/7)';
              options.classList.remove('visible');
            }
          }

          function setPreset(preset) {
            const dayBtns = document.querySelectorAll('.day-btn');
            dayBtns.forEach(btn => btn.classList.remove('selected'));

            if (preset === 'weekdays') {
              selectedDays = [1, 2, 3, 4, 5];
              document.getElementById('startTime').value = '09:00';
              document.getElementById('endTime').value = '18:00';
            } else if (preset === 'alldays') {
              selectedDays = [0, 1, 2, 3, 4, 5, 6];
              document.getElementById('startTime').value = '00:00';
              document.getElementById('endTime').value = '23:59';
            } else if (preset === 'business') {
              selectedDays = [1, 2, 3, 4, 5];
              document.getElementById('startTime').value = '08:00';
              document.getElementById('endTime').value = '17:00';
            }

            selectedDays.forEach(day => {
              document.querySelector('.day-btn[data-day="' + day + '"]').classList.add('selected');
            });
          }

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

            const schedule = {
              enabled: scheduleEnabled,
              days: selectedDays,
              startTime: document.getElementById('startTime').value,
              endTime: document.getElementById('endTime').value
            };

            ipcRenderer.send('setup-complete', { serverUrl, adminPassword, schedule });
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

    ipcMain.once('setup-complete', (_, data: { serverUrl: string; adminPassword: string; schedule: ScheduleConfig }) => {
      store.set('serverUrl', data.serverUrl);
      if (data.adminPassword) {
        // Use secure PBKDF2 hashing
        const hash = hashPassword(data.adminPassword);
        store.set('adminPasswordHash', hash);
      }
      // Save schedule configuration
      store.set('schedule', validateSchedule(data.schedule));
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

  // Clear schedule check interval
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
    scheduleCheckInterval = null;
  }

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
