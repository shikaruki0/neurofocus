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
 * Uses a freeze token to protect today's streak (or repair yesterday's missed day).
 * @returns True if freeze was used
 */
export function useFreeze(): boolean {
  if (!canUseFreeze()) return false;

  const today = todayStr();
  const diff = data.lastStreakDate ? daysBetween(data.lastStreakDate, today) : 0;

  data.streakFreezes = Math.max(0, (data.streakFreezes || 0) - 1);
  if (diff === 2) {
    // Retroactive freeze: set lastStreakDate to yesterday so streak can continue today
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    data.lastStreakDate = yesterday.toDateString();
  } else {
    // Proactive freeze: protect today
    data.lastStreakDate = today;
  }

  persistMany(['streakFreezes', 'lastStreakDate']);
  return true;
}

/**
 * Checks if a freeze can be used today.
 * Supports both proactive freeze for today and retroactive freeze for yesterday.
 * @returns True if freeze can be used
 */
export function canUseFreeze(): boolean {
  const today = todayStr();
  if ((data.streakFreezes || 0) <= 0) return false;
  if (data.lastStreakDate === today) return false;
  if (!data.lastStreakDate) return false;

  const diff = daysBetween(data.lastStreakDate, today);
  // Can use if claimed yesterday (diff === 1, proactive freeze for today)
  // OR claimed 2 days ago (diff === 2, retroactive freeze to save yesterday).
  return diff === 1 || diff === 2;
}

/**
 * Gets current streak info.
 * Reflects whether the consecutive streak is currently active, at-risk, or lapsed.
 * @returns Streak info
 */
export function getStreakInfo(): StreakInfo {
  const today = todayStr();
  let currentConsecutive = data.consecutiveStreak || 0;

  if (data.lastStreakDate) {
    const diff = daysBetween(data.lastStreakDate, today);
    // If more than 1 day has passed without a streak claim or freeze:
    // - diff === 2: user missed yesterday; if they have a freeze token, the streak can still be saved
    // - diff > 2 or (diff === 2 && no freeze): streak is broken and lapsed to 0
    if (diff > 2 || (diff === 2 && (data.streakFreezes || 0) <= 0)) {
      currentConsecutive = 0;
    }
  } else {
    currentConsecutive = 0;
  }

  return {
    detox: data.detoxStreak || 0,
    consecutive: currentConsecutive,
    freezes: data.streakFreezes || 0,
  };
}
