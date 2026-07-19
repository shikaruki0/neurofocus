/**
 * Streak System — Tracks consecutive day streaks with freeze tokens.
 * Freezes are earned every 7 days and can save a missed day.
 */

import { data, persist, persistMany } from './data.ts';
import { todayStr, daysBetween } from '../utils/date.ts';

export interface StreakResult {
  success: boolean;
  streak: number;
  consecutive: number;
}

export interface StreakInfo {
  detox: number;
  consecutive: number;
  freezes: number;
}

/**
 * Claims today's streak after all daily checks pass.
 * Updates consecutive streak and awards XP.
 * @returns Streak result
 */
export function claimStreak(): StreakResult {
  const today = todayStr();

  if (data.detoxLastDate === today) {
    return { success: false, streak: data.detoxStreak, consecutive: data.consecutiveStreak };
  }

  data.detoxStreak = (data.detoxStreak || 0) + 1;
  data.detoxLastDate = today;

  // Update consecutive streak
  if (data.lastStreakDate) {
    const diff = daysBetween(data.lastStreakDate, today);
    if (diff === 1) {
      data.consecutiveStreak = (data.consecutiveStreak || 0) + 1;
    } else if (diff > 1) {
      data.consecutiveStreak = 1; // Reset — missed a day
    }
  } else {
    data.consecutiveStreak = 1;
  }

  data.lastStreakDate = today;

  persistMany(['detoxStreak', 'detoxLastDate', 'consecutiveStreak', 'lastStreakDate']);

  // Check for freeze token reward
  maybeAddFreeze();

  return { success: true, streak: data.detoxStreak, consecutive: data.consecutiveStreak };
}

/**
 * Awards a freeze token every 7 consecutive days.
 * @returns True if freeze was added
 */
function maybeAddFreeze(): boolean {
  if (data.consecutiveStreak > 0 && data.consecutiveStreak % 7 === 0) {
    const earned = Math.floor(data.consecutiveStreak / 7);
    const previous = Math.floor((data.consecutiveStreak - 1) / 7);
    if (earned > previous) {
      data.streakFreezes = (data.streakFreezes || 0) + 1;
      persist('streakFreezes');
      return true;
    }
  }
  return false;
}

/**
 * Uses a freeze token to protect today's streak.
 * @returns True if freeze was used
 */
export function useFreeze(): boolean {
  if (data.streakFreezes <= 0) return false;

  data.streakFreezes--;
  data.lastStreakDate = todayStr();
  persistMany(['streakFreezes', 'lastStreakDate']);
  return true;
}

/**
 * Checks if a freeze can be used today.
 * @returns True if freeze can be used
 */
export function canUseFreeze(): boolean {
  const today = todayStr();
  if (data.streakFreezes <= 0) return false;
  if (data.lastStreakDate === today) return false;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toDateString();

  // Can use if yesterday was claimed and today is not
  return data.lastStreakDate === yStr && data.lastStreakDate !== today;
}

/**
 * Gets current streak info.
 * @returns Streak info
 */
export function getStreakInfo(): StreakInfo {
  return {
    detox: data.detoxStreak || 0,
    consecutive: data.consecutiveStreak || 0,
    freezes: data.streakFreezes || 0,
  };
}
