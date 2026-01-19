import Store from 'electron-store';
import { ScheduleConfig, isMonitoringActive, getScheduleDescription } from '../utils/schedule';
import { ServiceRefs, AppState, StoreSchema } from '../types';

/**
 * Start all monitoring services
 */
export function startMonitoringServices(
  serviceRefs: ServiceRefs,
  appState: AppState,
  updateTrayMenu: (status: string) => void
): void {
  if (appState.isMonitoringEnabled) {
    console.log('[Monitoring] Already active');
    return;
  }

  console.log('[Monitoring] Starting services...');
  serviceRefs.screenCapture?.start();
  serviceRefs.processMonitor?.start();
  serviceRefs.activityTracker?.start();
  serviceRefs.clipboardMonitor?.start();
  serviceRefs.keyloggerService?.start();
  serviceRefs.blockingService?.start();

  appState.isMonitoringEnabled = true;
  updateTrayMenu(serviceRefs.agentService?.isConnected() ? 'Connected' : 'Disconnected');
  console.log('[Monitoring] Services started');
}

/**
 * Stop all monitoring services
 */
export function stopMonitoringServices(
  serviceRefs: ServiceRefs,
  appState: AppState,
  updateTrayMenu: (status: string) => void
): void {
  if (!appState.isMonitoringEnabled) {
    console.log('[Monitoring] Already inactive');
    return;
  }

  console.log('[Monitoring] Stopping services...');
  serviceRefs.screenCapture?.stop();
  serviceRefs.processMonitor?.stop();
  serviceRefs.activityTracker?.stop();
  serviceRefs.clipboardMonitor?.stop();
  serviceRefs.keyloggerService?.stop();
  // Keep blocking service running to maintain blocks
  // serviceRefs.blockingService?.stop();

  appState.isMonitoringEnabled = false;
  updateTrayMenu('Paused (Scheduled)');
  console.log('[Monitoring] Services stopped');
}

/**
 * Check schedule and update monitoring state
 */
export function checkScheduleAndUpdateMonitoring(
  store: Store<StoreSchema>,
  serviceRefs: ServiceRefs,
  appState: AppState,
  updateTrayMenu: (status: string) => void
): void {
  const schedule = store.get('schedule') as ScheduleConfig;
  const shouldBeActive = isMonitoringActive(schedule);

  if (shouldBeActive && !appState.isMonitoringEnabled) {
    console.log('[Schedule] Monitoring period started');
    startMonitoringServices(serviceRefs, appState, updateTrayMenu);
  } else if (!shouldBeActive && appState.isMonitoringEnabled) {
    console.log('[Schedule] Monitoring period ended');
    stopMonitoringServices(serviceRefs, appState, updateTrayMenu);
  }
}

/**
 * Setup schedule checking interval
 */
export function setupScheduleChecking(
  store: Store<StoreSchema>,
  serviceRefs: ServiceRefs,
  appState: AppState,
  updateTrayMenu: (status: string) => void
): void {
  const schedule = store.get('schedule') as ScheduleConfig;

  // Clear existing interval if any
  if (appState.scheduleCheckInterval) {
    clearInterval(appState.scheduleCheckInterval);
    appState.scheduleCheckInterval = null;
  }

  // If scheduling is disabled, ensure monitoring is active
  if (!schedule.enabled) {
    console.log('[Schedule] Always active (24/7)');
    if (!appState.isMonitoringEnabled) {
      startMonitoringServices(serviceRefs, appState, updateTrayMenu);
    }
    return;
  }

  // Check every minute for schedule changes
  console.log('[Schedule] ' + getScheduleDescription(schedule));
  appState.scheduleCheckInterval = setInterval(
    () => checkScheduleAndUpdateMonitoring(store, serviceRefs, appState, updateTrayMenu),
    60000
  );

  // Do initial check
  checkScheduleAndUpdateMonitoring(store, serviceRefs, appState, updateTrayMenu);
}
