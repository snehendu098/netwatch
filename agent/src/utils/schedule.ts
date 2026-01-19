/**
 * Schedule utility for controlling when monitoring is active
 */

export interface ScheduleConfig {
  enabled: boolean;
  days: number[];  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string;  // "HH:MM" format (24-hour)
  endTime: string;    // "HH:MM" format (24-hour)
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,  // When false, monitoring is always active
  days: [1, 2, 3, 4, 5],  // Monday to Friday
  startTime: "09:00",
  endTime: "18:00",
};

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time as minutes since midnight
 */
function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if monitoring should be active based on schedule
 */
export function isMonitoringActive(schedule: ScheduleConfig): boolean {
  // If scheduling is disabled, always monitor
  if (!schedule.enabled) {
    return true;
  }

  const now = new Date();
  const currentDay = now.getDay();  // 0 = Sunday
  const currentMinutes = getCurrentTimeMinutes();
  const startMinutes = parseTimeToMinutes(schedule.startTime);
  const endMinutes = parseTimeToMinutes(schedule.endTime);

  // Check if current day is in the schedule
  if (!schedule.days.includes(currentDay)) {
    return false;
  }

  // Handle time range (including overnight schedules)
  if (startMinutes <= endMinutes) {
    // Normal range (e.g., 09:00 to 18:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g., 22:00 to 06:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Get next time monitoring will be active
 */
export function getNextActiveTime(schedule: ScheduleConfig): Date | null {
  if (!schedule.enabled) {
    return null;  // Always active
  }

  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = getCurrentTimeMinutes();
  const startMinutes = parseTimeToMinutes(schedule.startTime);

  // Check each day for the next 7 days
  for (let i = 0; i < 7; i++) {
    const checkDay = (currentDay + i) % 7;

    if (schedule.days.includes(checkDay)) {
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + i);
      nextDate.setHours(Math.floor(startMinutes / 60));
      nextDate.setMinutes(startMinutes % 60);
      nextDate.setSeconds(0);
      nextDate.setMilliseconds(0);

      // If it's today and we're before start time, return today's start
      if (i === 0 && currentMinutes < startMinutes) {
        return nextDate;
      }
      // If it's a future day, return that day's start
      if (i > 0) {
        return nextDate;
      }
    }
  }

  return null;
}

/**
 * Get human-readable schedule description
 */
export function getScheduleDescription(schedule: ScheduleConfig): string {
  if (!schedule.enabled) {
    return "Monitoring is always active";
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activeDays = schedule.days.map(d => dayNames[d]).join(', ');

  return `Active on ${activeDays} from ${schedule.startTime} to ${schedule.endTime}`;
}

/**
 * Validate schedule configuration
 */
export function validateSchedule(schedule: Partial<ScheduleConfig>): ScheduleConfig {
  return {
    enabled: schedule.enabled ?? DEFAULT_SCHEDULE.enabled,
    days: Array.isArray(schedule.days) && schedule.days.length > 0
      ? schedule.days.filter(d => d >= 0 && d <= 6)
      : DEFAULT_SCHEDULE.days,
    startTime: isValidTimeFormat(schedule.startTime)
      ? schedule.startTime!
      : DEFAULT_SCHEDULE.startTime,
    endTime: isValidTimeFormat(schedule.endTime)
      ? schedule.endTime!
      : DEFAULT_SCHEDULE.endTime,
  };
}

/**
 * Check if time string is valid "HH:MM" format
 */
function isValidTimeFormat(time: string | undefined): boolean {
  if (!time) return false;
  const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(time);
}
