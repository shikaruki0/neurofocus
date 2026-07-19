import { describe, it, expect, beforeEach } from 'vitest';
import { claimStreak, canUseFreeze, useFreeze, getStreakInfo } from '../src/modules/streak.ts';
import { data } from '../src/modules/data.ts';

describe('Streak System', () => {
  const today = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toDateString();

  beforeEach(() => {
    // Reset streak data
    data.detoxStreak = 0;
    data.consecutiveStreak = 0;
    data.lastStreakDate = null;
    data.detoxLastDate = null;
    data.streakFreezes = 0;
  });

  describe('claimStreak', () => {
    it('initiates consecutive streak to 1 on first claim', () => {
      const result = claimStreak();
      expect(result.success).toBe(true);
      expect(data.consecutiveStreak).toBe(1);
      expect(data.lastStreakDate).toBe(today);
    });

    it('increments consecutive streak on consecutive days', () => {
      data.lastStreakDate = yStr;
      data.consecutiveStreak = 5;

      const result = claimStreak();
      expect(result.success).toBe(true);
      expect(data.consecutiveStreak).toBe(6);
    });

    it('resets consecutive streak to 1 if day missed', () => {
      const dayBeforeYesterday = new Date();
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      data.lastStreakDate = dayBeforeYesterday.toDateString();
      data.consecutiveStreak = 5;

      const result = claimStreak();
      expect(result.success).toBe(true);
      expect(data.consecutiveStreak).toBe(1);
    });
  });

  describe('canUseFreeze', () => {
    it('returns false if user has no freezes', () => {
      data.streakFreezes = 0;
      data.lastStreakDate = yStr;
      expect(canUseFreeze()).toBe(false);
    });

    it('returns false if user already claimed today', () => {
      data.streakFreezes = 1;
      data.lastStreakDate = today;
      expect(canUseFreeze()).toBe(false);
    });

    it('returns true if user claimed yesterday and has freezes but not claimed today', () => {
      data.streakFreezes = 1;
      data.lastStreakDate = yStr;
      expect(canUseFreeze()).toBe(true);
    });
  });

  describe('useFreeze', () => {
    it('uses freeze correctly, updates lastStreakDate to today and decrements freezes', () => {
      data.streakFreezes = 2;
      data.lastStreakDate = yStr;

      const used = useFreeze();
      expect(used).toBe(true);
      expect(data.streakFreezes).toBe(1);
      expect(data.lastStreakDate).toBe(today);
    });
  });
});
