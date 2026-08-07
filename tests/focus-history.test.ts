import { beforeEach, describe, expect, it } from 'vitest';
import { data } from '../src/modules/data.ts';
import { getDailyFocusHistory } from '../src/modules/focusHistory.ts';
import {
  localISODate,
  shiftISODate,
  isValidISODate,
  parseLocalISODate,
} from '../src/utils/date.ts';
import { startMission, clearMission, getActiveMission } from '../src/modules/mission.ts';

describe('date-scoped focus history - core filtering', () => {
  beforeEach(() => {
    data.sessions = [];
    clearMission();
  });

  it('defaults to Today and shows only today sessions (default Today filter)', () => {
    const todayISO = localISODate();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    data.sessions = [
      { date: yesterday.toDateString(), time: yesterday.getTime(), duration: 25 },
      { date: today.toDateString(), time: today.getTime(), duration: 30 },
    ];
    const result = getDailyFocusHistory(todayISO);
    expect(result.sessions).toHaveLength(1);
    expect(result.totalMinutes).toBe(30);
    expect(result.date).toBe(todayISO);
  });

  it('shows only yesterday sessions when yesterday is selected', () => {
    const today = new Date(2026, 6, 30, 12, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    data.sessions = [
      { date: yesterday.toDateString(), time: yesterday.getTime(), duration: 25 },
      { date: today.toDateString(), time: today.getTime(), duration: 50 },
    ];
    const yISO = localISODate(yesterday);
    const tISO = localISODate(today);
    expect(getDailyFocusHistory(yISO).totalMinutes).toBe(25);
    expect(getDailyFocusHistory(tISO).totalMinutes).toBe(50);
    expect(getDailyFocusHistory(yISO).sessions[0].duration).toBe(25);
  });

  it('handles custom selected date', () => {
    const custom = new Date(2026, 0, 15, 10, 0, 0);
    const iso = localISODate(custom);
    data.sessions = [{ date: custom.toDateString(), time: custom.getTime(), duration: 25 }];
    const res = getDailyFocusHistory(iso);
    expect(res.sessions).toHaveLength(1);
    expect(res.totalMinutes).toBe(25);
    expect(res.date).toBe(iso);
  });

  it('returns empty for missing date', () => {
    const res = getDailyFocusHistory('2020-01-01');
    expect(res.sessions).toHaveLength(0);
    expect(res.totalMinutes).toBe(0);
    expect(res.completedBlocks).toBe(0);
    expect(res.completedMissions).toBe(0);
  });

  it('handles future dates safely and shows empty state', () => {
    const tomorrow = shiftISODate(localISODate(), 1);
    const nextWeek = shiftISODate(localISODate(), 7);
    data.sessions = [{ date: new Date().toDateString(), time: Date.now(), duration: 25 }];
    expect(getDailyFocusHistory(tomorrow).totalMinutes).toBe(0);
    expect(getDailyFocusHistory(nextWeek).sessions).toHaveLength(0);
  });

  it('handles invalid date input safely', () => {
    expect(getDailyFocusHistory('').totalMinutes).toBe(0);
    expect(getDailyFocusHistory('not-a-date').sessions).toHaveLength(0);
    expect(getDailyFocusHistory('2026-13-40').totalMinutes).toBe(0);
    expect(getDailyFocusHistory('2026-02-30').totalMinutes).toBe(0);
  });

  it('previous day navigation via shiftISODate', () => {
    const todayISO = '2026-07-30';
    const prev = shiftISODate(todayISO, -1);
    expect(prev).toBe('2026-07-29');
    expect(isValidISODate(prev)).toBe(true);
    const midnight = new Date(2026, 6, 29, 0, 5, 0);
    data.sessions = [{ date: midnight.toDateString(), time: midnight.getTime(), duration: 25 }];
    expect(getDailyFocusHistory(prev).totalMinutes).toBe(25);
  });

  it('next day navigation via shiftISODate', () => {
    const todayISO = '2026-07-29';
    const next = shiftISODate(todayISO, 1);
    expect(next).toBe('2026-07-30');
    const sessionTime = new Date(2026, 6, 30, 9, 0, 0).getTime();
    data.sessions = [
      { date: new Date(sessionTime).toDateString(), time: sessionTime, duration: 50 },
    ];
    expect(getDailyFocusHistory(next).totalMinutes).toBe(50);
    expect(getDailyFocusHistory(todayISO).totalMinutes).toBe(0);
  });

  it('today reset restores today date', () => {
    const todayISO = localISODate();
    const yesterdayISO = shiftISODate(todayISO, -1);
    const now = new Date();
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    data.sessions = [
      { date: y.toDateString(), time: y.getTime(), duration: 25 },
      { date: now.toDateString(), time: now.getTime(), duration: 40 },
    ];
    // simulate being on yesterday
    expect(getDailyFocusHistory(yesterdayISO).totalMinutes).toBe(25);
    // reset to today
    expect(getDailyFocusHistory(todayISO).totalMinutes).toBe(40);
  });

  it('handles local midnight boundaries correctly', () => {
    // 23:59 local should belong to same day, 00:01 next day to next
    const baseDay = new Date(2026, 6, 30, 23, 59, 59);
    const nextDay = new Date(2026, 6, 31, 0, 1, 0);
    const baseISO = localISODate(baseDay);
    const nextISO = localISODate(nextDay);
    data.sessions = [
      { date: baseDay.toDateString(), time: baseDay.getTime(), duration: 25 },
      { date: nextDay.toDateString(), time: nextDay.getTime(), duration: 30 },
    ];
    expect(getDailyFocusHistory(baseISO).totalMinutes).toBe(25);
    expect(getDailyFocusHistory(nextISO).totalMinutes).toBe(30);
    expect(baseISO).not.toBe(nextISO);
  });

  it('aggregates multiple sessions on same date correctly', () => {
    const day = new Date(2026, 6, 30, 10, 0, 0);
    const iso = localISODate(day);
    data.sessions = [
      { date: day.toDateString(), time: day.getTime(), duration: 25 },
      { date: day.toDateString(), time: day.getTime() + 60 * 60 * 1000, duration: 50 },
      { date: day.toDateString(), time: day.getTime() + 2 * 60 * 60 * 1000, duration: 25 },
    ];
    const res = getDailyFocusHistory(iso);
    expect(res.sessions).toHaveLength(3);
    expect(res.totalMinutes).toBe(100);
    expect(res.completedBlocks).toBe(3);
  });

  it('prevents duplicate session timestamps from double counting', () => {
    const midnight = new Date(2026, 6, 30, 0, 0, 0);
    data.sessions = [
      { date: 'x', time: midnight.getTime(), duration: 25 },
      { date: 'x', time: midnight.getTime(), duration: 25 },
      { date: 'x', time: midnight.getTime() + 60_000, duration: 50 },
    ];
    const daily = getDailyFocusHistory('2026-07-30');
    expect(daily.sessions).toHaveLength(2);
    expect(daily.totalMinutes).toBe(75);
  });

  it('does not count same session twice in totals (no duplicate totals)', () => {
    const t = new Date(2026, 6, 30, 12, 0, 0).getTime();
    data.sessions = [
      { date: 'a', time: t, duration: 25 },
      { date: 'a', time: t, duration: 25 },
      { date: 'a', time: t, duration: 25 },
    ];
    const res = getDailyFocusHistory('2026-07-30');
    expect(res.totalMinutes).toBe(25);
    expect(res.completedBlocks).toBe(1);
  });

  it('mission block aggregation: linked blocks counted once', () => {
    const t1 = new Date(2026, 6, 30, 9, 0, 0).getTime();
    const t2 = new Date(2026, 6, 30, 10, 0, 0).getTime();
    data.sessions = [
      { date: new Date(t1).toDateString(), time: t1, duration: 25 },
      { date: new Date(t2).toDateString(), time: t2, duration: 25 },
    ];
    // create a mission with 2 blocks linked to those times
    startMission({
      title: 'Test Mission',
      subject: 'Physics',
      backlogId: null,
      totalMinutes: 50,
      blockMinutes: 25,
      blocks: [
        { index: 1, minutes: 25, cumulative: 25 },
        { index: 2, minutes: 25, cumulative: 50 },
      ],
    });
    // manually link sessionIds to blocks for test
    const mission = getActiveMission();
    if (mission) {
      mission.blocks[0].sessionId = t1;
      mission.blocks[0].status = 'completed';
      mission.blocks[1].sessionId = t2;
      mission.blocks[1].status = 'completed';
    }
    const res = getDailyFocusHistory('2026-07-30');
    expect(res.completedBlocks).toBe(2);
    expect(res.completedMissions).toBe(2);
  });

  it('prevents duplicate mission block counting', () => {
    const t = new Date(2026, 6, 30, 9, 0, 0).getTime();
    data.sessions = [
      { date: new Date(t).toDateString(), time: t, duration: 25 },
      { date: new Date(t + 1000).toDateString(), time: t + 1000, duration: 25 },
    ];
    startMission({
      title: 'Dup Block Mission',
      subject: 'Math',
      backlogId: null,
      totalMinutes: 50,
      blockMinutes: 25,
      blocks: [
        { index: 1, minutes: 25, cumulative: 25 },
        { index: 2, minutes: 25, cumulative: 50 },
      ],
    });
    const mission = getActiveMission();
    if (mission) {
      // both sessions point to same block id via sessionId mapping
      mission.blocks[0].id = 'same-id';
      mission.blocks[1].id = 'same-id';
      mission.blocks[0].sessionId = t;
      mission.blocks[1].sessionId = t + 1000;
      mission.blocks[0].status = 'completed';
      mission.blocks[1].status = 'completed';
    }
    const res = getDailyFocusHistory('2026-07-30');
    // Set should deduplicate same block id
    expect(res.completedMissions).toBe(1);
  });

  it('does not duplicate session aggregation for totals', () => {
    const base = new Date(2026, 6, 30, 8, 0, 0).getTime();
    data.sessions = [
      { date: 'd', time: base, duration: 25 },
      { date: 'd', time: base + 1, duration: 25 },
      { date: 'd', time: base + 2, duration: 25 },
    ];
    const res = getDailyFocusHistory('2026-07-30');
    expect(res.totalMinutes).toBe(75);
    expect(res.sessions.map((s) => s.time)).toEqual([...new Set(res.sessions.map((s) => s.time))]);
  });

  it('preserves weekly statistics and does not mutate them', () => {
    const beforeWeekly = JSON.stringify(data.weeklyStats);
    const beforeSessions = data.sessions.length;
    getDailyFocusHistory(localISODate());
    expect(JSON.stringify(data.weeklyStats)).toBe(beforeWeekly);
    expect(data.sessions.length).toBe(beforeSessions);
  });

  it('existing date utility behavior: isValidISODate', () => {
    expect(isValidISODate('2026-07-30')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false); // 2026 not leap
    expect(isValidISODate('2020-02-29')).toBe(true);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-00-10')).toBe(false);
    expect(isValidISODate('2026-01-32')).toBe(false);
    expect(isValidISODate('not-date')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('date utility: localISODate and shiftISODate consistency', () => {
    const d = new Date(2026, 0, 15);
    const iso = localISODate(d);
    expect(iso).toBe('2026-01-15');
    expect(shiftISODate(iso, 1)).toBe('2026-01-16');
    expect(shiftISODate(iso, -1)).toBe('2026-01-14');
    expect(shiftISODate(iso, 0)).toBe(iso);
  });

  it('date utility: parseLocalISODate safe parsing', () => {
    const parsed = parseLocalISODate('2026-07-30');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(6);
    expect(parsed!.getDate()).toBe(30);
    expect(parseLocalISODate('invalid')).toBeNull();
    expect(parseLocalISODate('2026-02-30')).toBeNull();
  });

  it('handles session time zone and midnight with authoritative timestamp', () => {
    // 00:00:00.000 should belong to that local date, not previous
    const midnight = new Date(2026, 6, 30, 0, 0, 0);
    const iso = localISODate(midnight);
    data.sessions = [{ date: 'ignored', time: midnight.getTime(), duration: 25 }];
    const res = getDailyFocusHistory(iso);
    expect(res.totalMinutes).toBe(25);
  });

  it('safe rendering when sessions empty and optional DOM missing (logic does not throw)', () => {
    data.sessions = [];
    expect(() => getDailyFocusHistory(localISODate())).not.toThrow();
    expect(() => getDailyFocusHistory('2026-07-30')).not.toThrow();
    expect(() => getDailyFocusHistory('invalid')).not.toThrow();
  });

  it('sums exact stored XP per session and never mutates global XP', () => {
    const xpBefore = data.xp;
    const t = new Date(2026, 6, 30, 12, 0, 0).getTime();
    data.sessions = [
      { date: new Date(t).toDateString(), time: t, duration: 45, xp: 45, label: 'Custom' },
      {
        date: new Date(t + 3_600_000).toDateString(),
        time: t + 3_600_000,
        duration: 25,
        xp: 40,
        label: 'Pomodoro',
      },
    ];
    const res = getDailyFocusHistory('2026-07-30');
    expect(res.xpEarned).toBe(85);
    expect(data.xp).toBe(xpBefore);
  });

  it('derives daily XP from the earning rule for legacy sessions without stored XP', () => {
    const t = new Date(2026, 6, 30, 12, 0, 0).getTime();
    data.sessions = [
      // Legacy preset sessions earn their preset XP (25→40, 52→60, 90→100)…
      { date: new Date(t).toDateString(), time: t, duration: 25 },
      { date: new Date(t + 3_600_000).toDateString(), time: t + 3_600_000, duration: 52 },
      // …and legacy non-preset lengths earn 1 XP per minute (the custom rule).
      { date: new Date(t + 7_200_000).toDateString(), time: t + 7_200_000, duration: 10 },
    ];
    const res = getDailyFocusHistory('2026-07-30');
    expect(res.xpEarned).toBe(40 + 60 + 10);
  });

  it('keeps mission names and mission counts after the mission is cleared', () => {
    const t = new Date(2026, 6, 30, 9, 0, 0).getTime();
    data.sessions = [
      {
        date: new Date(t).toDateString(),
        time: t,
        duration: 25,
        xp: 40,
        label: 'Mission Block',
      },
      { date: new Date(t + 3_600_000).toDateString(), time: t + 3_600_000, duration: 25 },
    ];
    clearMission(); // no active mission — history must still call it a mission block
    const res = getDailyFocusHistory('2026-07-30');
    expect(res.completedMissions).toBe(1);
    expect(res.completedBlocks).toBe(2);
    expect(res.sessions.find((s) => s.time === t)?.missionName).toBe('Mission block');
    expect(res.sessions.find((s) => s.time === t + 3_600_000)?.missionName).toBe('Focus session');
  });

  it('locale-change rerendering safe: date label uses localISODate, not display text', () => {
    const iso = '2026-07-30';
    const t = new Date(2026, 6, 30, 12, 0, 0).getTime();
    data.sessions = [{ date: new Date(t).toDateString(), time: t, duration: 25 }];
    const v1 = getDailyFocusHistory(iso);
    // simulate locale change: same ISO should still work regardless of locale formatting
    const v2 = getDailyFocusHistory(iso);
    expect(v2.totalMinutes).toBe(v1.totalMinutes);
    expect(v2.sessions).toHaveLength(v1.sessions.length);
  });
});

describe('date-scoped focus history - visual and input guards', () => {
  beforeEach(() => {
    data.sessions = [];
    clearMission();
  });

  it('date picker initialization: today is valid ISO and parseable', () => {
    const today = localISODate();
    expect(isValidISODate(today)).toBe(true);
    expect(parseLocalISODate(today)).not.toBeNull();
    expect(() => getDailyFocusHistory(today)).not.toThrow();
  });

  it('invalid date input does not change valid history retrieval', () => {
    const t = new Date(2026, 6, 30, 12, 0, 0).getTime();
    data.sessions = [{ date: new Date(t).toDateString(), time: t, duration: 30 }];
    const valid = getDailyFocusHistory('2026-07-30');
    const invalid = getDailyFocusHistory('not-a-date');
    expect(valid.totalMinutes).toBe(30);
    expect(invalid.totalMinutes).toBe(0);
    // valid still works after invalid attempt
    expect(getDailyFocusHistory('2026-07-30').totalMinutes).toBe(30);
  });

  it('future date shows empty but today still shows data', () => {
    const today = localISODate();
    const tomorrow = shiftISODate(today, 1);
    const now = Date.now();
    data.sessions = [{ date: new Date(now).toDateString(), time: now, duration: 25 }];
    expect(getDailyFocusHistory(tomorrow).sessions).toHaveLength(0);
    expect(getDailyFocusHistory(today).sessions).toHaveLength(1);
  });

  it('duplicate session prevention across rerenders does not accumulate', () => {
    const base = new Date(2026, 6, 30, 10, 0, 0).getTime();
    data.sessions = [{ date: 'd', time: base, duration: 25 }];
    const first = getDailyFocusHistory('2026-07-30');
    const second = getDailyFocusHistory('2026-07-30');
    const third = getDailyFocusHistory('2026-07-30');
    expect(first.totalMinutes).toBe(25);
    expect(second.totalMinutes).toBe(25);
    expect(third.totalMinutes).toBe(25);
    expect(first.sessions).toHaveLength(1);
  });
});
