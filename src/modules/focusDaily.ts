/**
 * Daily Focus Truth — one source of truth for "how much did I focus on day X?".
 *
 * Why this module exists:
 *   The app used to answer that question in two different ways.
 *     1. The Home tab read `data.focusMinutes` — a plain running counter that was
 *        only zeroed by the daily reset that runs once, when the page loads.
 *     2. The "Today's Focus" panel read the recorded session log (`data.sessions`).
 *
 *   Those two answers drift apart whenever anything touches one but not the other:
 *   the app stays open past midnight, a cloud restore/merge brings back an old
 *   counter, a JSON import sets minutes without sessions, or "Reset today" clears
 *   the counter but keeps the log. The visible symptom is the reported bug —
 *   Home says you studied, Today's Focus shows nothing.
 *
 *   Every completed session is appended to `data.sessions` with an absolute
 *   timestamp, so the session log is the only record that cannot silently lie about
 *   *when* the work happened. This module derives daily minutes from that log and
 *   heals the legacy counter so both views can never disagree again.
 */

import { data, persist } from './data.ts';
import type { Session } from './data.ts';
import { localISODate, todayStr } from '../utils/date.ts';

/**
 * The local calendar day a session belongs to.
 * `time` (absolute epoch ms) is authoritative and handles midnight/timezone
 * boundaries safely; the legacy `date` string is only a fallback.
 */
export function sessionISODate(session: { date: string; time: number }): string {
  if (Number.isFinite(session.time)) {
    const dt = new Date(session.time);
    if (!Number.isNaN(dt.getTime())) return localISODate(dt);
  }
  const parsed = new Date(session.date);
  return Number.isNaN(parsed.getTime()) ? '' : localISODate(parsed);
}

/**
 * Sessions recorded on a given local date (newest first, duplicate completion
 * timestamps removed so a double-write can never inflate the day).
 * @param isoDate - Local calendar date as YYYY-MM-DD
 */
export function getFocusSessionsForDate(isoDate: string): Session[] {
  const all = Array.isArray(data.sessions) ? data.sessions : [];
  const daySessions = all
    .filter((session) => session && sessionISODate(session) === isoDate)
    .slice()
    .sort((a, b) => b.time - a.time);

  return daySessions.filter(
    (session, index, list) =>
      list.findIndex((candidate) => candidate.time === session.time) === index,
  );
}

/** Total focus minutes actually recorded on a given local date. */
export function getFocusMinutesForDate(isoDate: string): number {
  return getFocusSessionsForDate(isoDate).reduce((total, session) => {
    const minutes = Number(session.duration);
    return total + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
  }, 0);
}

/** Focus minutes recorded today — the number every "today" surface should show. */
export function getTodayFocusMinutes(): number {
  return getFocusMinutesForDate(localISODate());
}

/** Number of focus sessions completed today. */
export function getTodayFocusSessionCount(): number {
  return getFocusSessionsForDate(localISODate()).length;
}

/** Focus hours today, rounded down to one decimal (the app's display rule). */
export function getTodayFocusHours(): number {
  return Math.floor((getTodayFocusMinutes() / 60) * 10) / 10;
}

/**
 * Realigns the legacy day-counters with the session log and persists any change.
 *
 * This is the self-healing step: after a midnight rollover, a cloud restore, an
 * import, or any other path that could leave a stale counter behind, calling this
 * makes `focusMinutes` / `focusDate` / `flowState` describe exactly what the
 * session log says about today.
 *
 * @returns True when something was actually corrected.
 */
export function reconcileDailyFocus(): boolean {
  const today = todayStr();
  const minutes = getTodayFocusMinutes();
  const sessionCount = getTodayFocusSessionCount();
  let changed = false;

  if (data.focusMinutes !== minutes) {
    data.focusMinutes = minutes;
    persist('focusMinutes');
    changed = true;
  }

  if (data.focusDate !== today) {
    data.focusDate = today;
    persist('focusDate');
    changed = true;
  }

  const flow = data.flowState || { date: '', sessions: 0 };
  if (flow.date !== today || flow.sessions !== sessionCount) {
    data.flowState = { date: today, sessions: sessionCount };
    persist('flowState');
    changed = true;
  }

  return changed;
}

/** Removes every session recorded on a local date. Used by "Reset today". */
export function clearFocusSessionsForDate(isoDate: string): number {
  const all = Array.isArray(data.sessions) ? data.sessions : [];
  const kept = all.filter((session) => !session || sessionISODate(session) !== isoDate);
  const removed = all.length - kept.length;
  if (removed > 0) {
    data.sessions = kept;
    persist('sessions');
  }
  return removed;
}
