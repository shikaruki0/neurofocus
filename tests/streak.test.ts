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

    it('returns true if user claimed yesterday and has freezes but not claimed today (proactive)', () => {
      data.streakFreezes = 1;
      data.lastStreakDate = yStr;
      expect(canUseFreeze()).toBe(true);
    });

    it('returns true if user missed yesterday (claimed 2 days ago) and has freezes (retroactive)', () => {
      const dayBeforeYesterday = new Date();
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      data.streakFreezes = 1;
      data.lastStreakDate = dayBeforeYesterday.toDateString();
      expect(canUseFreeze()).toBe(true);
    });

    it('returns false if user missed 3 or more days', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      data.streakFreezes = 2;
      data.lastStreakDate = threeDaysAgo.toDateString();
      expect(canUseFreeze()).toBe(false);
    });
  });

  describe('useFreeze', () => {
    it('uses proactive freeze correctly, updates lastStreakDate to today and decrements freezes', () => {
      data.streakFreezes = 2;
      data.lastStreakDate = yStr;

      const used = useFreeze();
      expect(used).toBe(true);
      expect(data.streakFreezes).toBe(1);
      expect(data.lastStreakDate).toBe(today);
    });

    it('uses retroactive freeze correctly, updates lastStreakDate to yesterday and saves streak', () => {
      const dayBeforeYesterday = new Date();
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      data.streakFreezes = 2;
      data.lastStreakDate = dayBeforeYesterday.toDateString();
      data.consecutiveStreak = 10;

      const used = useFreeze();
      expect(used).toBe(true);
      expect(data.streakFreezes).toBe(1);
      expect(data.lastStreakDate).toBe(yStr);

      // Now claiming today should increment from 10 to 11
      const claimResult = claimStreak();
      expect(claimResult.success).toBe(true);
      expect(data.consecutiveStreak).toBe(11);
    });
  });

  describe('getStreakInfo', () => {
    it('returns active consecutive streak when claimed yesterday', () => {
      data.consecutiveStreak = 7;
      data.lastStreakDate = yStr;
      data.streakFreezes = 0;
      const info = getStreakInfo();
      expect(info.consecutive).toBe(7);
    });

    it('returns 0 consecutive streak when 3 or more days missed', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      data.consecutiveStreak = 7;
      data.lastStreakDate = threeDaysAgo.toDateString();
      data.streakFreezes = 1;
      const info = getStreakInfo();
      expect(info.consecutive).toBe(0);
    });

    it('returns 0 consecutive streak when yesterday missed and 0 freezes', () => {
      const dayBeforeYesterday = new Date();
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      data.consecutiveStreak = 7;
      data.lastStreakDate = dayBeforeYesterday.toDateString();
      data.streakFreezes = 0;
      const info = getStreakInfo();
      expect(info.consecutive).toBe(0);
    });

    it('returns at-risk consecutive streak when yesterday missed but has freezes to save it', () => {
      const dayBeforeYesterday = new Date();
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      data.consecutiveStreak = 7;
      data.lastStreakDate = dayBeforeYesterday.toDateString();
      data.streakFreezes = 1;
      const info = getStreakInfo();
      expect(info.consecutive).toBe(7);
    });
  });
});
