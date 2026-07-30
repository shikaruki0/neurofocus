/**
 * Badge System — Defines special achievements and checks unlock conditions.
 * Badges have rarity tiers matching rank tiers.
 */

import { data, persist } from './data.ts';
import { xpLevel } from './xp.ts';
import { RANK_TIERS } from './ranks.ts';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultra';

export interface SpecialBadge {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: BadgeRarity;
  check: () => boolean;
}

export interface RankBadge {
  id: string;
  isRank: true;
  level: number;
}

export type Badge = SpecialBadge | RankBadge;

/**
 * Total count of all unlockable badges (ranks + specials).
 */
export const TOTAL_BADGES = 21 + 14; // 21 rank badges + 14 special badges

/**
 * Calculates total backlogs completed across all subjects.
 * @returns Total completed
 */
function totalBacklogsDone(): number {
  return data.backlogs.reduce((sum, b) => sum + (b.done || 0), 0);
}

/**
 * Special achievement definitions.
 * Each has a `check()` function that returns true when unlocked.
 */
export const SPECIAL_BADGES: SpecialBadge[] = [
  {
    id: 'first_focus',
    name: 'First Dive',
    desc: 'Complete 1 focus session',
    icon: 'neuro-mark',
    rarity: 'common',
    check: () => data.totalFocusMinutes >= 25,
  },
  {
    id: 'focus_10',
    name: 'Flow State',
    desc: '10 focus sessions',
    icon: '⏱️',
    rarity: 'rare',
    check: () => data.totalFocusMinutes >= 250,
  },
  {
    id: 'focus_50',
    name: 'Machine',
    desc: '50 focus sessions',
    icon: '⚙️',
    rarity: 'epic',
    check: () => data.totalFocusMinutes >= 1250,
  },
  {
    id: 'focus_100',
    name: 'Deep Worker',
    desc: '100 focus sessions',
    icon: '🌊',
    rarity: 'legendary',
    check: () => data.totalFocusMinutes >= 2500,
  },
  {
    id: 'detox_3',
    name: 'Detox Warrior',
    desc: '3 day streak',
    icon: '🔥',
    rarity: 'rare',
    check: () => data.consecutiveStreak >= 3,
  },
  {
    id: 'detox_7',
    name: 'Detox Legend',
    desc: '7 day streak',
    icon: '🧘',
    rarity: 'epic',
    check: () => data.consecutiveStreak >= 7,
  },
  {
    id: 'detox_30',
    name: 'Unstoppable',
    desc: '30 day streak',
    icon: '💎',
    rarity: 'legendary',
    check: () => data.consecutiveStreak >= 30,
  },
  {
    id: 'detox_90',
    name: 'Iron Will',
    desc: '90 day streak',
    icon: '⚡',
    rarity: 'mythic',
    check: () => data.consecutiveStreak >= 90,
  },
  {
    id: 'backlog_5',
    name: 'Blaster',
    desc: 'Finish 5 lectures',
    icon: '📚',
    rarity: 'common',
    check: () => totalBacklogsDone() >= 5,
  },
  {
    id: 'backlog_25',
    name: 'Destroyer',
    desc: 'Finish 25 lectures',
    icon: '🚀',
    rarity: 'rare',
    check: () => totalBacklogsDone() >= 25,
  },
  {
    id: 'backlog_100',
    name: 'Obliterator',
    desc: 'Finish 100 lectures',
    icon: '☄️',
    rarity: 'epic',
    check: () => totalBacklogsDone() >= 100,
  },
  {
    id: 'habit_7',
    name: 'Stack Builder',
    desc: '7 day habit streak',
    icon: '🔨',
    rarity: 'rare',
    check: () => data.habits.some((h) => (h.streak || 0) >= 7),
  },
  {
    id: 'habit_30',
    name: 'Habit Engine',
    desc: '30 day habit streak',
    icon: '⚙️',
    rarity: 'epic',
    check: () => data.habits.some((h) => (h.streak || 0) >= 30),
  },
  {
    id: 'habit_100',
    name: 'Autopilot',
    desc: '100 day habit streak',
    icon: '🤖',
    rarity: 'legendary',
    check: () => data.habits.some((h) => (h.streak || 0) >= 100),
  },
];

/**
 * Checks all badges and unlocks any newly earned ones.
 * @returns Array of newly unlocked badges
 */
export function checkBadges(): Badge[] {
  const unlocked = data.badgesUnlocked || [];
  const newBadges: Badge[] = [];

  // Check special badges
  for (const badge of SPECIAL_BADGES) {
    if (!unlocked.includes(badge.id) && badge.check()) {
      unlocked.push(badge.id);
      newBadges.push(badge);
    }
  }

  // Check rank badges
  const { level } = xpLevel(data.xp);
  for (const tier of RANK_TIERS) {
    if (level >= tier.level) {
      const rankId = `rank_${tier.level}`;
      if (!unlocked.includes(rankId)) {
        unlocked.push(rankId);
        newBadges.push({ id: rankId, isRank: true, level: tier.level });
      }
    }
  }

  if (newBadges.length > 0) {
    data.badgesUnlocked = [...new Set(unlocked)]; // dedupe
    persist('badgesUnlocked');
  }

  return newBadges;
}

/**
 * Returns the count of unlocked badges.
 * @returns Unlocked badge count
 */
export function getUnlockedCount(): number {
  return (data.badgesUnlocked || []).length;
}
