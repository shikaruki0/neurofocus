/**
 * Regression suite for the "app says I studied when I didn't" bug.
 *
 * The Home tab used to read a plain running counter (`focusMinutes`) while the
 * "Today's Focus" panel read the recorded session log (`sessions`). Anything that
 * touched one but not the other made Home claim study time that had no session
 * behind it. These tests lock the two views to the SAME source of truth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { data } from '../src/modules/data.ts';
import { clearAll } from '../src/modules/storage.ts';
import {
  clearFocusSessionsForDate,
  getFocusMinutesForDate,
  getFocusSessionsForDate,
  getTodayFocusHours,
  getTodayFocusMinutes,
  getTodayFocusSessionCount,
  reconcileDailyFocus,
} from '../src/modules/focusDaily.ts';
import { getDailyFocusHistory } from '../src/modules/focusHistory.ts';
import { recordDailyStat } from '../src/modules/weekly.ts';
import { checkQuests } from '../src/modules/quests.ts';
import { localISODate, todayStr } from '../src/utils/date.ts';

function resetState(): void {
  clearAll();
  data.sessions = [];
  data.focusMinutes = 0;
  data.totalFocusMinutes = 0;
  data.focusDate = todayStr();
  data.flowState = { date: todayStr(), sessions: 0 };
  data.weeklyStats = [];
  data.dailyQuests = null;
  data.backlogsToday = 0;
  data.habitsToday = 0;
  data.detoxLastDate = null;
  data.xp = 0;
}

function session(time: number, duration: number) {
  return { date: new Date(time).toDateString(), time, duration };
}

describe('Phantom focus — Home vs Today\u2019s Focus must agree', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports zero minutes today when no session was recorded, even if the counter says otherwise', () => {
    // The exact reported state: a leftover counter with an empty session log.
    data.focusMinutes = 120;
    data.focusDate = todayStr();

    expect(getTodayFocusMinutes()).toBe(0);
    expect(getTodayFocusHours()).toBe(0);
    expect(getDailyFocusHistory(localISODate()).totalMinutes).toBe(0);
  });

  it('matches the Today\u2019s Focus panel exactly once sessions exist', () => {
    const now = Date.now();
    data.sessions = [session(now, 25), session(now + 3_600_000, 50)];

    const panel = getDailyFocusHistory(localISODate());
    expect(getTodayFocusMinutes()).toBe(panel.totalMinutes);
    expect(getTodayFocusMinutes()).toBe(75);
    expect(getTodayFocusSessionCount()).toBe(panel.completedBlocks);
  });

  it('never counts yesterday\u2019s sessions as today', () => {
    const yesterday = new Date('2026-07-23T21:00:00').getTime();
    data.sessions = [session(yesterday, 90)];

    expect(getTodayFocusMinutes()).toBe(0);
    expect(getFocusMinutesForDate('2026-07-23')).toBe(90);
  });

  it('ignores duplicate completion timestamps so a day cannot be inflated', () => {
    const now = Date.now();
    data.sessions = [session(now, 25), session(now, 25), session(now + 60_000, 25)];

    expect(getTodayFocusSessionCount()).toBe(2);
    expect(getTodayFocusMinutes()).toBe(50);
  });

  it('ignores malformed durations instead of trusting them', () => {
    const now = Date.now();
    data.sessions = [
      session(now, 25),
      { date: 'x', time: now + 1000, duration: Number.NaN },
      { date: 'x', time: now + 2000, duration: -30 },
    ];

    expect(getTodayFocusMinutes()).toBe(25);
  });
});

describe('Phantom focus — self-healing reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears a stale counter that has no sessions behind it', () => {
    data.focusMinutes = 120;
    data.flowState = { date: todayStr(), sessions: 4 };

    expect(reconcileDailyFocus()).toBe(true);
    expect(data.focusMinutes).toBe(0);
    expect(data.flowState).toEqual({ date: todayStr(), sessions: 0 });
  });

  it('drops yesterday\u2019s minutes when the app is left open past midnight', () => {
    const yesterday = new Date('2026-07-23T20:00:00').getTime();
    data.sessions = [session(yesterday, 90)];
    data.focusMinutes = 90;
    data.focusDate = 'Thu Jul 23 2026';
    data.flowState = { date: 'Thu Jul 23 2026', sessions: 1 };

    expect(reconcileDailyFocus()).toBe(true);
    expect(data.focusMinutes).toBe(0);
    expect(data.focusDate).toBe(todayStr());
    expect(data.flowState).toEqual({ date: todayStr(), sessions: 0 });
    // Yesterday's record itself is preserved — history must never be destroyed.
    expect(getFocusMinutesForDate('2026-07-23')).toBe(90);
  });

  it('restores a counter that was wrongly zeroed while sessions exist', () => {
    const now = Date.now();
    data.sessions = [session(now, 52)];
    data.focusMinutes = 0;

    expect(reconcileDailyFocus()).toBe(true);
    expect(data.focusMinutes).toBe(52);
    expect(data.flowState.sessions).toBe(1);
  });

  it('is a no-op (and reports so) when everything already agrees', () => {
    const now = Date.now();
    data.sessions = [session(now, 25)];
    reconcileDailyFocus();

    expect(reconcileDailyFocus()).toBe(false);
    expect(data.focusMinutes).toBe(25);
  });

  it('persists the corrected values so a reload stays truthful', async () => {
    data.focusMinutes = 200;
    data.focusDate = 'Thu Jul 23 2026';
    reconcileDailyFocus();

    const { get } = await import('../src/modules/storage.ts');
    expect(get<number>('focusMinutes', -1)).toBe(0);
    expect(get<string>('focusDate', '')).toBe(todayStr());
  });
});

describe('Phantom focus — downstream surfaces', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a phantom counter out of the weekly chart', () => {
    data.focusMinutes = 180;
    recordDailyStat();

    expect(data.weeklyStats[0].focus).toBe(0);
  });

  it('records real session time in the weekly chart', () => {
    data.sessions = [session(Date.now(), 90)];
    recordDailyStat();

    expect(data.weeklyStats[0].focus).toBe(1.5);
  });

  it('does not hand out focus-quest XP without a recorded session', () => {
    data.dailyQuests = {
      date: todayStr(),
      quests: [{ id: 'q_focus', label: 'Complete 1 focus session', reward: 20, completed: false }],
    };
    data.focusMinutes = 60;

    expect(checkQuests()).toEqual([]);
    expect(data.xp).toBe(0);
  });

  it('completes the focus quest once a real session is recorded', () => {
    data.dailyQuests = {
      date: todayStr(),
      quests: [{ id: 'q_focus', label: 'Complete 1 focus session', reward: 20, completed: false }],
    };
    data.sessions = [session(Date.now(), 25)];

    expect(checkQuests().map((q) => q.id)).toEqual(['q_focus']);
  });
});

describe('Phantom focus — reset today', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes only today\u2019s sessions and leaves history intact', () => {
    const now = Date.now();
    const yesterday = new Date('2026-07-23T20:00:00').getTime();
    data.sessions = [session(yesterday, 90), session(now, 25), session(now + 1000, 52)];

    expect(clearFocusSessionsForDate(localISODate())).toBe(2);
    expect(getTodayFocusMinutes()).toBe(0);
    expect(getFocusMinutesForDate('2026-07-23')).toBe(90);
    expect(getDailyFocusHistory(localISODate()).sessions).toHaveLength(0);
  });

  it('leaves the log untouched when the day has no sessions', () => {
    data.sessions = [session(new Date('2026-07-23T20:00:00').getTime(), 90)];

    expect(clearFocusSessionsForDate(localISODate())).toBe(0);
    expect(data.sessions).toHaveLength(1);
  });
});

describe('Phantom focus — restores and imports', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('an import of minutes without sessions cannot fake study time', async () => {
    const { applyImport } = await import('../src/modules/progressImport.ts');

    const result = applyImport({ focusMinutes: 300, sessions: [] });

    expect(result.ok).toBe(true);
    expect(data.focusMinutes).toBe(0);
    expect(getTodayFocusMinutes()).toBe(0);
  });

  it('an import carrying real sessions keeps the matching minutes', async () => {
    const { applyImport } = await import('../src/modules/progressImport.ts');
    const now = Date.now();

    const result = applyImport({ focusMinutes: 0, sessions: [session(now, 52)] });

    expect(result.ok).toBe(true);
    expect(data.focusMinutes).toBe(52);
    expect(getFocusSessionsForDate(localISODate())).toHaveLength(1);
  });
});
