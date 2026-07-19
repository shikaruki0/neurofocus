import { describe, it, expect } from 'vitest';
import { xpLevel, xpForLevel, getMultiplier } from '../src/modules/xp.ts';

describe('XP System', () => {
  describe('xpLevel', () => {
    it('returns level 1 for 0 XP', () => {
      const result = xpLevel(0);
      expect(result.level).toBe(1);
      expect(result.current).toBe(0);
      expect(result.need).toBe(100);
    });

    it('returns level 1 for 99 XP', () => {
      const result = xpLevel(99);
      expect(result.level).toBe(1);
      expect(result.current).toBe(99);
    });

    it('returns level 2 at 100 XP', () => {
      const result = xpLevel(100);
      expect(result.level).toBe(2);
      expect(result.current).toBe(0);
    });

    it('returns correct level for large XP values', () => {
      const result = xpLevel(10000);
      expect(result.level).toBeGreaterThan(10);
      expect(result.pct).toBeGreaterThanOrEqual(0);
      expect(result.pct).toBeLessThanOrEqual(100);
    });

    it('calculates percentage correctly', () => {
      const result = xpLevel(50);
      expect(result.pct).toBe(50);
    });
  });

  describe('xpForLevel', () => {
    it('returns 0 for level 1', () => {
      expect(xpForLevel(1)).toBe(0);
    });

    it('returns 100 for level 2', () => {
      expect(xpForLevel(2)).toBe(100);
    });

    it('returns increasing values for higher levels', () => {
      const lvl3 = xpForLevel(3);
      const lvl4 = xpForLevel(4);
      expect(lvl4).toBeGreaterThan(lvl3);
    });
  });
});
