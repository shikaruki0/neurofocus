/**
 * Weekly Report — Aggregates daily stats into a 7-day view.
 * Tracks focus hours, backlogs, habits, streaks, and a composite score.
 */

import { data, persist } from './data.ts';
import { getTodayFocusHours } from './focusDaily.ts';
import { todayStr, last7Days } from '../utils/date.ts';

export interface DailyStat {
  date: string;
  focus: number;
  backlogs: number;
  habits: number;
  streak: number;
  score: number;
}

export interface WeeklyTotals {
  focus: number;
  backlogs: number;
  habits: number;
  streaks: number;
  score: number;
}

/**
 * Records today's stats into the weekly stats array.
 */
export function recordDailyStat(): void {
  const today = todayStr();
  const stats = data.weeklyStats || [];

  const backlogsToday = data.backlogsToday || 0;
  const habitsToday = data.habitsToday || 0;
  const streakToday = data.detoxLastDate === today ? 1 : 0;
  // Derived from the recorded session log, never from a counter that can go stale
  // (a stale counter used to bake a phantom study day into the weekly chart).
  const focusHrs = getTodayFocusHours();
  const score = Math.floor(focusHrs * 10) + backlogsToday + habitsToday * 2 + streakToday * 5;

  const existing = stats.find((s) => s.date === today);
  if (existing) {
    existing.focus = focusHrs;
    existing.backlogs = backlogsToday;
    existing.habits = habitsToday;
    existing.streak = streakToday;
    existing.score = score;
  } else {
    stats.push({
      date: today,
      focus: focusHrs,
      backlogs: backlogsToday,
      habits: habitsToday,
      streak: streakToday,
      score,
    });
    // Keep only last 7 days
    if (stats.length > 7) stats.shift();
  }

  data.weeklyStats = stats;
  persist('weeklyStats');
}

/**
 * Gets the 7-day stats array (filling missing days with zeros).
 * @returns Weekly stats
 */
export function getWeekStats(): DailyStat[] {
  const days = last7Days();
  return days.map((day) => {
    const existing = (data.weeklyStats || []).find((s) => s.date === day);
    return existing || { date: day, focus: 0, backlogs: 0, habits: 0, streak: 0, score: 0 };
  });
}

/**
 * Gets weekly totals.
 * @returns Weekly totals
 */
export function getWeekTotals(): WeeklyTotals {
  const stats = getWeekStats();
  return {
    focus: stats.reduce((s, d) => s + (d.focus || 0), 0),
    backlogs: stats.reduce((s, d) => s + (d.backlogs || 0), 0),
    habits: stats.reduce((s, d) => s + (d.habits || 0), 0),
    streaks: stats.reduce((s, d) => s + (d.streak || 0), 0),
    score: stats.reduce((s, d) => s + (d.score || 0), 0),
  };
}
