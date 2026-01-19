import { BrowserWindow, ipcMain, dialog, app } from 'electron';
import Store from 'electron-store';
import { StoreSchema, SetupData } from '../types';
import { ScheduleConfig, validateSchedule, getScheduleDescription } from '../utils/schedule';
import { verifyAdminPassword, setAdminPassword } from '../helpers/auth';
import { getPasswordDialogHTML, getSchedulePasswordDialogHTML } from '../screens/password-dialog';
import { getScheduleDialogHTML } from '../screens/schedule-dialog';
import { getSetupDialogHTML } from '../screens/setup-dialog';

/**
 * Show admin password prompt dialog
 */
export async function promptForAdminPassword(
  store: Store<StoreSchema>,
  parentWindow: BrowserWindow | null
): Promise<void> {
  const passwordWindow = new BrowserWindow({
    width: 350,
    height: 180,
    parent: parentWindow || undefined,
    modal: true,
    show: false,
    frame: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  const html = getPasswordDialogHTML();
  passwordWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  passwordWindow.once('ready-to-show', () => {
    passwordWindow.show();
  });

  // Handle password verification
  ipcMain.once('verify-admin-password', (_, password: string) => {
    if (verifyAdminPassword(store, password)) {
      passwordWindow.close();
      app.isQuitting = true;
      app.quit();
    } else {
      passwordWindow.webContents.send('password-invalid');
      // Re-register handler for retry
      ipcMain.once('verify-admin-password', (__, retryPassword: string) => {
        if (verifyAdminPassword(store, retryPassword)) {
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

/**
 * Show schedule configuration dialog (admin-protected)
 */
export async function promptForScheduleConfig(
  store: Store<StoreSchema>,
  parentWindow: BrowserWindow | null,
  onScheduleUpdated: () => void
): Promise<void> {
  // First verify admin password
  const passwordVerified = await new Promise<boolean>((resolve) => {
    const passwordWindow = new BrowserWindow({
      width: 350,
      height: 180,
      parent: parentWindow || undefined,
      modal: true,
      show: false,
      frame: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    const html = getSchedulePasswordDialogHTML();
    passwordWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    passwordWindow.once('ready-to-show', () => passwordWindow.show());

    const cleanup = () => {
      ipcMain.removeAllListeners('verify-schedule-password');
      ipcMain.removeAllListeners('cancel-schedule-password');
    };

    ipcMain.once('verify-schedule-password', (_, password: string) => {
      if (verifyAdminPassword(store, password)) {
        cleanup();
        passwordWindow.close();
        resolve(true);
      } else {
        passwordWindow.webContents.send('password-invalid-schedule');
        ipcMain.once('verify-schedule-password', (__, retryPassword: string) => {
          cleanup();
          passwordWindow.close();
          resolve(verifyAdminPassword(store, retryPassword));
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
    parent: parentWindow || undefined,
    modal: true,
    show: false,
    frame: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  const html = getScheduleDialogHTML(currentSchedule);
  scheduleWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  scheduleWindow.once('ready-to-show', () => scheduleWindow.show());

  ipcMain.once('save-schedule-config', (_, newSchedule: ScheduleConfig) => {
    store.set('schedule', validateSchedule(newSchedule));
    scheduleWindow.close();
    // Restart schedule checking with new config
    onScheduleUpdated();
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

/**
 * Show first-time setup dialog
 */
export async function showFirstTimeSetup(
  store: Store<StoreSchema>
): Promise<boolean> {
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

    const html = getSetupDialogHTML();
    setupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    setupWindow.show();

    ipcMain.once('setup-complete', (_, data: SetupData) => {
      store.set('serverUrl', data.serverUrl);
      if (data.adminPassword) {
        setAdminPassword(store, data.adminPassword);
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
