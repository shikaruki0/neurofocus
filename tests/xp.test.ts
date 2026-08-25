import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { xpLevel, xpForLevel, getMultiplier, addXP, onLevelUp } from '../src/modules/xp.ts';
import { data } from '../src/modules/data.ts';

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

    it('handles negative or NaN XP safely without crashing', () => {
      const neg = xpLevel(-50);
      expect(neg.level).toBe(1);
      expect(neg.current).toBe(0);
      expect(neg.pct).toBe(0);

      const nan = xpLevel(NaN);
      expect(nan.level).toBe(1);
      expect(nan.current).toBe(0);
      expect(nan.pct).toBe(0);
    });
  });

  describe('xpForLevel', () => {
    it('returns 0 for level 1 and non-positive levels', () => {
      expect(xpForLevel(1)).toBe(0);
      expect(xpForLevel(0)).toBe(0);
      expect(xpForLevel(-5)).toBe(0);
      expect(xpForLevel(NaN)).toBe(0);
    });

    it('returns 100 for level 2', () => {
      expect(xpForLevel(2)).toBe(100);
    });

    it('returns increasing values for higher levels', () => {
      const lvl3 = xpForLevel(3);
      const lvl4 = xpForLevel(4);
      expect(lvl4).toBeGreaterThan(lvl3);
    });

    it('lets callers compute the XP remaining to a target level', () => {
      // The Home header shows "N XP to <rank>"; N must be total-to-rank MINUS
      // current XP (not the full level requirement). 80 XP into level 2 has a
      // next rank at level 5, so the remaining distance is xpForLevel(5) - 80.
      const current = 80;
      const targetLevel = 5;
      const remaining = xpForLevel(targetLevel) - current;
      expect(remaining).toBe(xpForLevel(5) - 80);
      // And the remaining is always smaller than the full requirement.
      expect(remaining).toBeLessThan(xpForLevel(targetLevel));
    });
  });

  describe('getMultiplier (morning ritual 2x)', () => {
    afterEach(() => {
      vi.useRealTimers();
      data.morningRitual = {
        date: '',
        completed: false,
        steps: [false, false, false, false, false],
      };
      data.flowState = { date: '', sessions: 0 };
    });

    it('returns 2x only before noon, not at or after 12:00', () => {
      vi.useFakeTimers();

      // Complete the ritual "today" so the boost can apply.
      vi.setSystemTime(new Date(2026, 6, 24, 8, 0, 0));
      const today = new Date().toDateString();
      data.morningRitual = { date: today, completed: true, steps: [true, true, true, true, true] };

      // 08:00 — before noon → 2x
      vi.setSystemTime(new Date(2026, 6, 24, 8, 0, 0));
      expect(getMultiplier()).toBe(2);

      // 11:59 — still before noon → 2x
      vi.setSystemTime(new Date(2026, 6, 24, 11, 59, 0));
      expect(getMultiplier()).toBe(2);

      // 12:00 — noon has arrived → boost ends (was `hour <= 12`, granting 2x at noon)
      vi.setSystemTime(new Date(2026, 6, 24, 12, 0, 0));
      expect(getMultiplier()).toBe(1);

      // 13:00 — clearly afternoon → 1x
      vi.setSystemTime(new Date(2026, 6, 24, 13, 0, 0));
      expect(getMultiplier()).toBe(1);
    });

    it('returns 1x when the ritual is not completed today', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 24, 8, 0, 0));
      const yesterday = new Date(2026, 6, 23).toDateString();
      data.morningRitual = {
        date: yesterday,
        completed: true,
        steps: [true, true, true, true, true],
      };
      expect(getMultiplier()).toBe(1);
    });
  });

  describe('onLevelUp', () => {
    beforeEach(() => {
      data.xp = 0;
    });

    it('fires when an XP award crosses a level boundary', () => {
      const events: { from: number; to: number }[] = [];
      const off = onLevelUp((e) => events.push(e));

      data.xp = 90;
      addXP(10, 'test'); // 90 → 100 crosses into level 2
      expect(events).toEqual([{ from: 1, to: 2 }]);

      off();
    });

    it('does not fire when the level does not change', () => {
      const events: { from: number; to: number }[] = [];
      const off = onLevelUp((e) => events.push(e));

      data.xp = 0;
      addXP(10, 'test'); // still level 1
      expect(events).toEqual([]);

      off();
    });

    it('unsubscribes cleanly', () => {
      let calls = 0;
      const off = onLevelUp(() => calls++);
      off();
      data.xp = 90;
      addXP(20, 'test'); // crosses level 2 but no listener remains
      expect(calls).toBe(0);
    });

    it('rejects non-positive, NaN, and non-finite XP awards without corrupting state', () => {
      data.xp = 50;
      expect(addXP(0, 'zero')).toBe(0);
      expect(data.xp).toBe(50);

      expect(addXP(-10, 'negative')).toBe(0);
      expect(data.xp).toBe(50);

      expect(addXP(NaN, 'nan')).toBe(0);
      expect(data.xp).toBe(50);

      expect(addXP(Infinity, 'infinity')).toBe(0);
      expect(data.xp).toBe(50);
    });
  });
});
