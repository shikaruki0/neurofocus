/**
 * Rank Tiers — Defines the 20 rank tiers from Initiate to The Enlightened.
 * Each rank unlocks at a specific level and has a rarity tier.
 */

export const RANK_TIERS = [
  { level: 0, name: 'Initiate', icon: '🌱', rarity: 'common', color: '#94a3b8' },
  { level: 5, name: 'Apprentice', icon: '📖', rarity: 'common', color: '#94a3b8' },
  { level: 10, name: 'Disciple', icon: '✏️', rarity: 'common', color: '#94a3b8' },
  { level: 15, name: 'Student', icon: '🎓', rarity: 'rare', color: '#00e676' },
  { level: 20, name: 'Scholar', icon: '🔬', rarity: 'rare', color: '#00e676' },
  { level: 25, name: 'Analyst', icon: '📊', rarity: 'rare', color: '#00e676' },
  { level: 30, name: 'Strategist', icon: '♟️', rarity: 'rare', color: '#00e676' },
  { level: 35, name: 'Specialist', icon: '🎯', rarity: 'epic', color: '#a855f7' },
  { level: 40, name: 'Expert', icon: '💡', rarity: 'epic', color: '#a855f7' },
  { level: 45, name: 'Maven', icon: '🏛️', rarity: 'epic', color: '#a855f7' },
  { level: 50, name: 'Sage', icon: '🦉', rarity: 'epic', color: '#a855f7' },
  { level: 55, name: 'Master', icon: '⚔️', rarity: 'legendary', color: '#ffd740' },
  { level: 60, name: 'Grandmaster', icon: '🏆', rarity: 'legendary', color: '#ffd740' },
  { level: 65, name: 'Archon', icon: '🛡️', rarity: 'legendary', color: '#ffd740' },
  { level: 70, name: 'Paragon', icon: '💎', rarity: 'legendary', color: '#ffd740' },
  { level: 75, name: 'Virtuoso', icon: '🎼', rarity: 'mythic', color: '#ff5252' },
  { level: 80, name: 'Luminary', icon: '⭐', rarity: 'mythic', color: '#ff5252' },
  { level: 85, name: 'Titan', icon: '🏔️', rarity: 'mythic', color: '#ff5252' },
  { level: 90, name: 'Deity', icon: '👑', rarity: 'mythic', color: '#ff5252' },
  { level: 95, name: 'Celestial', icon: '🌌', rarity: 'ultra', color: '#00d9ff' },
  { level: 100, name: 'The Enlightened', icon: '☀️', rarity: 'ultra', color: '#00d9ff' },
];

/**
 * Gets the current rank based on level.
 * @param {number} level
 * @returns {object} Rank tier object
 */
export function getCurrentRank(level) {
  let rank = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (level >= tier.level) rank = tier;
  }
  return rank;
}

/**
 * Gets the next rank tier, or null if at max.
 * @param {number} level
 * @returns {object|null}
 */
export function getNextRank(level) {
  for (const tier of RANK_TIERS) {
    if (level < tier.level) return tier;
  }
  return null;
}

/**
 * Finds a rank by its level value.
 * @param {number} level
 * @returns {object|undefined}
 */
export function getRankByLevel(level) {
  return RANK_TIERS.find((t) => t.level === level);
}
