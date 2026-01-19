import { app, powerMonitor } from 'electron';
import { ServiceRefs, AppState } from '../types';
import { AgentService } from '../services/agent-service';

/**
 * Setup power monitoring handlers
 */
export function setupPowerMonitoring(
  agentService: AgentService | null,
  checkScheduleCallback: () => void
): void {
  powerMonitor.on('suspend', () => {
    console.log('[Power] System suspending');
    agentService?.sendHeartbeat({ isIdle: true, idleTime: 0 });
  });

  powerMonitor.on('resume', () => {
    console.log('[Power] System resumed');
    agentService?.reconnect();
    // Check schedule on resume
    checkScheduleCallback();
  });

  powerMonitor.on('lock-screen', () => {
    console.log('[Power] Screen locked');
    agentService?.sendHeartbeat({ isIdle: true, idleTime: 0 });
  });

  powerMonitor.on('unlock-screen', () => {
    console.log('[Power] Screen unlocked');
    agentService?.sendHeartbeat({ isIdle: false, idleTime: 0 });
  });
}

/**
 * Setup app lifecycle handlers
 */
export function setupAppLifecycleHandlers(
  serviceRefs: ServiceRefs,
  appState: AppState,
  onReady: () => Promise<void>
): void {
  app.on('ready', async () => {
    console.log('[App] NetWatch Agent starting...');
    await onReady();
  });

  app.on('window-all-closed', () => {
    // Keep running in background - don't quit
  });

  app.on('activate', () => {
    // macOS: Re-create window if needed
  });

  app.on('before-quit', () => {
    app.isQuitting = true;

    // Clear schedule check interval
    if (appState.scheduleCheckInterval) {
      clearInterval(appState.scheduleCheckInterval);
      appState.scheduleCheckInterval = null;
    }

    // Cleanup services
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
}

/**
 * Setup uncaught exception handlers
 */
export function setupErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    console.error('[Error] Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Error] Unhandled rejection:', reason);
  });
}
