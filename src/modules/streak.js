/**
 * Streak System — Tracks consecutive day streaks with freeze tokens.
 * Freezes are earned every 7 days and can save a missed day.
 */

import { data, persist } from './data.js';
import { todayStr, daysBetween } from '../utils/date.js';

/**
 * Claims today's streak after all daily checks pass.
 * Updates consecutive streak and awards XP.
 * @returns {{success: boolean, streak: number, consecutive: number}}
 */
export function claimStreak() {
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
 */
function maybeAddFreeze() {
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
 * @returns {boolean} True if freeze was used
 */
export function useFreeze() {
  if (data.streakFreezes <= 0) return false;

  data.streakFreezes--;
  data.lastStreakDate = todayStr();
  persistMany(['streakFreezes', 'lastStreakDate']);
  return true;
}

/**
 * Checks if a freeze can be used today.
 * @returns {boolean}
 */
export function canUseFreeze() {
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
 * @returns {{detox: number, consecutive: number, freezes: number}}
 */
export function getStreakInfo() {
  return {
    detox: data.detoxStreak || 0,
    consecutive: data.consecutiveStreak || 0,
    freezes: data.streakFreezes || 0,
  };
}

function persistMany(keys) {
  keys.forEach((k) => persist(k));
}
