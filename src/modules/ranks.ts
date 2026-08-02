/**
 * Rank Tiers — Defines the 20 rank tiers from Initiate to The Enlightened.
 * Each rank unlocks at a specific level and has a rarity tier.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultra';

export interface RankTier {
  level: number;
  name: string;
  icon: string;
  rarity: Rarity;
  color: string;
}

export const RANK_TIERS: RankTier[] = [
  { level: 0, name: 'Initiate', icon: '🌱', rarity: 'common', color: '#94a3b8' },
  { level: 5, name: 'Apprentice', icon: '📖', rarity: 'common', color: '#94a3b8' },
  { level: 10, name: 'Disciple', icon: '✏️', rarity: 'common', color: '#94a3b8' },
  { level: 15, name: 'Student', icon: '🎓', rarity: 'rare', color: '#34d399' },
  { level: 20, name: 'Scholar', icon: '🔬', rarity: 'rare', color: '#34d399' },
  { level: 25, name: 'Analyst', icon: '📊', rarity: 'rare', color: '#34d399' },
  { level: 30, name: 'Strategist', icon: '♟️', rarity: 'rare', color: '#34d399' },
  { level: 35, name: 'Specialist', icon: '🎯', rarity: 'epic', color: '#a78bfa' },
  { level: 40, name: 'Expert', icon: '💡', rarity: 'epic', color: '#a78bfa' },
  { level: 45, name: 'Maven', icon: '🏛️', rarity: 'epic', color: '#a78bfa' },
  { level: 50, name: 'Sage', icon: '🦉', rarity: 'epic', color: '#a78bfa' },
  { level: 55, name: 'Master', icon: '⚔️', rarity: 'legendary', color: '#fbbf24' },
  { level: 60, name: 'Grandmaster', icon: '🏆', rarity: 'legendary', color: '#fbbf24' },
  { level: 65, name: 'Archon', icon: '🛡️', rarity: 'legendary', color: '#fbbf24' },
  { level: 70, name: 'Paragon', icon: '💎', rarity: 'legendary', color: '#fbbf24' },
  { level: 75, name: 'Virtuoso', icon: '🎼', rarity: 'mythic', color: '#f87171' },
  { level: 80, name: 'Luminary', icon: '⭐', rarity: 'mythic', color: '#f87171' },
  { level: 85, name: 'Titan', icon: '🏔️', rarity: 'mythic', color: '#f87171' },
  { level: 90, name: 'Deity', icon: '👑', rarity: 'mythic', color: '#f87171' },
  { level: 95, name: 'Celestial', icon: '🌌', rarity: 'ultra', color: '#38bdf8' },
  { level: 100, name: 'The Enlightened', icon: '☀️', rarity: 'ultra', color: '#38bdf8' },
];

/**
 * Gets the current rank based on level.
 * @param level
 * @returns Rank tier object
 */
export function getCurrentRank(level: number): RankTier {
  let rank = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (level >= tier.level) rank = tier;
  }
  return rank;
}

/**
 * Gets the next rank tier, or null if at max.
 * @param level
 * @returns Next rank tier or null
 */
export function getNextRank(level: number): RankTier | null {
  for (const tier of RANK_TIERS) {
    if (level < tier.level) return tier;
  }
  return null;
}

/**
 * Finds a rank by its level value.
 * @param level
 * @returns Rank tier or undefined
 */
export function getRankByLevel(level: number): RankTier | undefined {
  return RANK_TIERS.find((t) => t.level === level);
}
