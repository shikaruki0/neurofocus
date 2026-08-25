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

import { data, persist } from './data.ts';
import { todayStr, currentHour } from '../utils/date.ts';

const BASE_XP = 100;
const XP_MULTIPLIER = 1.35;

export interface LevelInfo {
  level: number;
  current: number;
  need: number;
  pct: number;
}

/**
 * Calculates level info from total XP.
 * @param xp - Total accumulated XP
 * @returns Level info
 */
export function xpLevel(xp: number): LevelInfo {
  const safeXP = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let level = 1;
  let need = BASE_XP;
  let remaining = safeXP;

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
 * @param targetLevel
 * @returns Total XP needed
 */
export function xpForLevel(targetLevel: number): number {
  if (!Number.isFinite(targetLevel) || targetLevel <= 1) return 0;
  const target = Math.floor(targetLevel);
  let total = 0;
  let need = BASE_XP;
  for (let i = 1; i < target; i++) {
    total += need;
    need = Math.floor(need * XP_MULTIPLIER);
  }
  return total;
}

/**
 * Returns the current XP multiplier based on active boosts.
 * @returns 1, 1.5, or 2
 */
export function getMultiplier(): number {
  const today = todayStr();
  const hour = currentHour();

  // Morning ritual: 2x before noon (noon is 12:00, so the boost ends at 12:00 sharp).
  if (data.morningRitual.completed && data.morningRitual.date === today && hour < 12) {
    return 2;
  }

  // Flow state: 1.5x after 3+ sessions
  if (data.flowState.date === today && data.flowState.sessions >= 3) {
    return 1.5;
  }

  return 1;
}

export interface LevelUpEvent {
  /** The level before this award. */
  from: number;
  /** The level after this award. */
  to: number;
}

type LevelUpListener = (event: LevelUpEvent) => void;

const levelUpListeners = new Set<LevelUpListener>();

/**
 * Registers a callback fired whenever XP gains move the user up a level.
 * Returns an unsubscribe function. Registered listeners are the only way the UI
 * learns about a level-up (the celebration is never fired from inside addXP,
 * so the logic module stays free of DOM/coupling).
 */
export function onLevelUp(listener: LevelUpListener): () => void {
  levelUpListeners.add(listener);
  return () => {
    levelUpListeners.delete(listener);
  };
}

/**
 * Adds XP to the user's total with multiplier applied.
 * @param amount - Base XP amount
 * @param _reason - Description for the celebration (unused)
 * @returns Actual XP gained (after multiplier)
 */
export function addXP(amount: number, _reason: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const mult = getMultiplier();
  const total = Math.floor(amount * mult);
  if (!Number.isFinite(total) || total <= 0) return 0;

  const before = xpLevel(data.xp).level;
  data.xp = Math.max(0, Number.isFinite(data.xp) ? data.xp : 0) + total;
  persist('xp');
  const after = xpLevel(data.xp).level;

  if (after > before) {
    for (const listener of levelUpListeners) {
      try {
        listener({ from: before, to: after });
      } catch {
        // A broken listener must never break XP awarding.
      }
    }
  }

  return total;
}

/**
 * Gets the current level info for the user.
 * @returns Level info
 */
export function getLevelInfo(): LevelInfo {
  return xpLevel(data.xp);
}
