import { describe, it, expect } from 'vitest';
import { getCurrentRank, getNextRank, getRankByLevel, RANK_TIERS } from '../src/modules/ranks.ts';

describe('Ranks', () => {
  describe('RANK_TIERS', () => {
    it('has 21 tiers (levels 0-100)', () => {
      expect(RANK_TIERS.length).toBe(21);
    });

    it('starts at level 0', () => {
      expect(RANK_TIERS[0].level).toBe(0);
    });

    it('ends at level 100', () => {
      expect(RANK_TIERS[RANK_TIERS.length - 1].level).toBe(100);
    });

    it('has increasing level requirements', () => {
      for (let i = 1; i < RANK_TIERS.length; i++) {
        expect(RANK_TIERS[i].level).toBeGreaterThan(RANK_TIERS[i - 1].level);
      }
    });
  });

  describe('getCurrentRank', () => {
    it('returns Initiate for level 1', () => {
      const rank = getCurrentRank(1);
      expect(rank.name).toBe('Initiate');
    });

    it('returns Apprentice for level 5', () => {
      const rank = getCurrentRank(5);
      expect(rank.name).toBe('Apprentice');
    });

    it('returns correct rank for level 50', () => {
      const rank = getCurrentRank(50);
      expect(rank.name).toBe('Sage');
    });

    it('returns The Enlightened for level 100', () => {
      const rank = getCurrentRank(100);
      expect(rank.name).toBe('The Enlightened');
    });

    it('returns highest unlocked rank', () => {
      const rank = getCurrentRank(23);
      expect(rank.name).toBe('Scholar'); // Level 20
    });
  });

  describe('getNextRank', () => {
    it('returns Apprentice for level 1', () => {
      const next = getNextRank(1);
      expect(next.name).toBe('Apprentice');
      expect(next.level).toBe(5);
    });

    it('returns null for max level', () => {
      const next = getNextRank(100);
      expect(next).toBeNull();
    });

    it('returns null for above max level', () => {
      const next = getNextRank(150);
      expect(next).toBeNull();
    });
  });

  describe('getRankByLevel', () => {
    it('finds rank by exact level', () => {
      const rank = getRankByLevel(25);
      expect(rank.name).toBe('Analyst');
    });

    it('returns undefined for non-existent level', () => {
      const rank = getRankByLevel(999);
      expect(rank).toBeUndefined();
    });
  });
});
