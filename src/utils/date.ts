/**
 * Date Utilities — Centralized date handling for consistent behavior.
 * All date comparisons use local time via toDateString().
 */

/**
 * Returns today's date as a stable string key (local time).
 * Format: "Wed Jul 17 2026" — suitable for date comparisons.
 * @returns {string}
 */
export function todayStr(): string {
  return new Date().toDateString();
}

/**
 * Returns the current day of week (0=Sun ... 6=Sat).
 * @returns {number}
 */
export function currentDOW(): number {
  return new Date().getDay();
}

/**
 * Returns the current hour (0-23).
 * @returns {number}
 */
export function currentHour(): number {
  return new Date().getHours();
}

/**
 * Calculates the difference in days between two date strings.
 * @param dateStrA - Earlier date (toDateString format)
 * @param dateStrB - Later date (toDateString format)
 * @returns Positive integer day difference
 */
export function daysBetween(dateStrA: string, dateStrB: string): number {
  const a = new Date(dateStrA).getTime();
  const b = new Date(dateStrB).getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Returns an array of the last 7 date strings (oldest first).
 * @returns {string[]}
 */
export function last7Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toDateString());
  }
  return days;
}

/**
 * Day-of-week labels for weekly chart.
 */
export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/**
 * Formats minutes into a human-readable duration.
 * @param minutes
 * @returns e.g. "1h 30m" or "45m"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
