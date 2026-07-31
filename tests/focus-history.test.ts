import { beforeEach, describe, expect, it } from 'vitest';
import { data } from '../src/modules/data.ts';
import { getDailyFocusHistory } from '../src/modules/focusHistory.ts';
import { localISODate, shiftISODate } from '../src/utils/date.ts';

describe('date-scoped focus history', () => {
  beforeEach(() => {
    data.sessions = [];
  });

  it('uses local ISO dates and separates yesterday from today', () => {
    const today = new Date(2026, 6, 30, 12, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    data.sessions = [
      { date: yesterday.toDateString(), time: yesterday.getTime(), duration: 25 },
      { date: today.toDateString(), time: today.getTime(), duration: 50 },
    ];

    expect(getDailyFocusHistory(localISODate(today)).totalMinutes).toBe(50);
    expect(getDailyFocusHistory(localISODate(yesterday)).totalMinutes).toBe(25);
  });

  it('handles midnight and multiple sessions without double counting duplicate records', () => {
    const midnight = new Date(2026, 6, 30, 0, 0, 0);
    data.sessions = [
      { date: 'not-used-for-comparison', time: midnight.getTime(), duration: 25 },
      { date: 'not-used-for-comparison', time: midnight.getTime(), duration: 25 },
      { date: 'not-used-for-comparison', time: midnight.getTime() + 60_000, duration: 50 },
    ];

    const daily = getDailyFocusHistory('2026-07-30');
    expect(daily.sessions).toHaveLength(2);
    expect(daily.totalMinutes).toBe(75);
    expect(daily.completedBlocks).toBe(2);
  });

  it('returns a clean empty result for missing and future dates', () => {
    const tomorrow = shiftISODate(localISODate(), 1);
    expect(getDailyFocusHistory('2020-01-01')).toMatchObject({
      totalMinutes: 0,
      completedBlocks: 0,
    });
    expect(getDailyFocusHistory(tomorrow)).toMatchObject({ totalMinutes: 0, completedBlocks: 0 });
  });
});
