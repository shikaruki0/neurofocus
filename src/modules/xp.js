/**
 * XP & Level System — Core progression mechanics.
 *
 * Level curve: each level requires 35% more XP than the previous.
 * Level 1→2 = 100 XP, Level 2→3 = 135 XP, Level 3→4 = 182 XP, etc.
 *
 * Multipliers:
 *   - Morning Ritual (before noon): 2x
 *   - Flow State (3+ sessions/day): 1.5x
 *   - They do NOT stack — highest applies.
 */

import { data, persist } from './data.js';
import { todayStr, currentHour } from '../utils/date.js';

const BASE_XP = 100;
const XP_MULTIPLIER = 1.35;

/**
 * Calculates level info from total XP.
 * @param {number} xp - Total accumulated XP
 * @returns {{level: number, current: number, need: number, pct: number}}
 */
export function xpLevel(xp) {
  let level = 1;
  let need = BASE_XP;
  let remaining = xp;

  while (remaining >= need) {
    remaining -= need;
    level++;
    need = Math.floor(need * XP_MULTIPLIER);
  }

  return {
    level,
    current: remaining,
    need,
    pct: (remaining / need) * 100,
  };
}

/**
 * Calculates total XP required to reach a target level.
 * @param {number} targetLevel
 * @returns {number}
 */
export function xpForLevel(targetLevel) {
  let total = 0;
  let need = BASE_XP;
  for (let i = 1; i < targetLevel; i++) {
    total += need;
    need = Math.floor(need * XP_MULTIPLIER);
  }
  return total;
}

/**
 * Returns the current XP multiplier based on active boosts.
 * @returns {number} 1, 1.5, or 2
 */
export function getMultiplier() {
  const today = todayStr();
  const hour = currentHour();

  // Morning ritual: 2x until noon
  if (data.morningRitual.completed && data.morningRitual.date === today && hour < 12) {
    return 2;
  }

  // Flow state: 1.5x after 3+ sessions
  if (data.flowState.date === today && data.flowState.sessions >= 3) {
    return 1.5;
  }

  return 1;
}

/**
 * Adds XP to the user's total with multiplier applied.
 * @param {number} amount - Base XP amount
 * @param {string} reason - Description for the celebration
 * @returns {number} Actual XP gained (after multiplier)
 */
export function addXP(amount, _reason) {
  const mult = getMultiplier();
  const total = Math.floor(amount * mult);

  data.xp += total;
  persist('xp');

  return total;
}

/**
 * Gets the current level info for the user.
 * @returns {{level: number, current: number, need: number, pct: number}}
 */
export function getLevelInfo() {
  return xpLevel(data.xp);
}
