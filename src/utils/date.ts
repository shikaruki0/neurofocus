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

/** Returns the user's local calendar date in ISO format for safe comparisons. */
export function localISODate(date: Date = new Date()): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Validates a local ISO date string YYYY-MM-DD without overflow. */
export function isValidISODate(isoDate: string): boolean {
  if (typeof isoDate !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Safely parses a local ISO date string to a local Date, or null if invalid. */
export function parseLocalISODate(isoDate: string): Date | null {
  if (!isValidISODate(isoDate)) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Moves a local ISO calendar date without UTC conversion. Safe against invalid input. */
export function shiftISODate(isoDate: string, days: number): string {
  const parsed = parseLocalISODate(isoDate);
  if (!parsed) return localISODate();
  parsed.setDate(parsed.getDate() + days);
  return localISODate(parsed);
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
