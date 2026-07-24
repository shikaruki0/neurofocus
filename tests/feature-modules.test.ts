import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { data } from '../src/modules/data.ts';
import { clearAll } from '../src/modules/storage.ts';
import {
  addBacklog,
  deleteBacklog,
  getBacklogs,
  getRemainingCount,
  getTotalDone,
  incrementBacklog,
} from '../src/modules/backlogs.ts';
import {
  addHabit,
  deleteHabit,
  getHabits,
  getTodayCount,
  toggleHabit,
} from '../src/modules/habits.ts';
import {
  addTask,
  deleteTask,
  getTasksByTime,
  getTasksSorted,
  toggleTask,
} from '../src/modules/battle.ts';
import { getQuests, checkQuests, generateDailyQuests } from '../src/modules/quests.ts';
import { getRitual, isBoostActive, toggleStep } from '../src/modules/ritual.ts';
import { addSubjectXP, getSubjectsWithInfo, subjectLevel } from '../src/modules/subjects.ts';
import { getWeekStats, getWeekTotals, recordDailyStat } from '../src/modules/weekly.ts';
import { getDailyQuote, QUOTES, refreshQuote } from '../src/modules/quotes.ts';
import {
  generateShareText,
  getBuddy,
  removeBuddy,
  setBuddy,
  shareProgress,
} from '../src/modules/buddy.ts';
import { getCurrentTheme, loadTheme, setAutoTheme, setTheme } from '../src/modules/theme.ts';
import {
  currentDOW,
  currentHour,
  daysBetween,
  formatDuration,
  last7Days,
  todayStr,
} from '../src/utils/date.ts';

function resetData(): void {
  clearAll();
  data.profileName = 'Warrior';
  data.mission = 'Mission';
  data.xp = 0;
  data.detoxStreak = 0;
  data.consecutiveStreak = 0;
  data.lastStreakDate = null;
  data.detoxLastDate = null;
  data.dailyChecks = {};
  data.dailyCheckDate = '';
  data.backlogs = [];
  data.habits = [];
  data.battle = [];
  data.focusMinutes = 0;
  data.totalFocusMinutes = 0;
  data.focusDate = todayStr();
  data.flowState = { date: todayStr(), sessions: 0 };
  data.badgesUnlocked = [];
  data.dailyQuests = null;
  data.morningRitual = {
    date: todayStr(),
    completed: false,
    steps: [false, false, false, false, false],
  };
  data.subjects = {
    Physics: 0,
    Chemistry: 0,
    Math: 0,
    Biology: 0,
    Hindi: 0,
    English: 0,
    IT: 0,
    Other: 0,
  };
  data.weeklyStats = [];
  data.streakFreezes = 0;
  data.buddyName = '';
  data.hasOnboarded = false;
  data.lastLoginAt = null;
  data.backlogsToday = 0;
  data.habitsToday = 0;
  data.sessions = [];
  data.autoTheme = false;
  data.theme = 'midnight';
  document.documentElement.removeAttribute('data-theme');
}

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetData();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Date utilities', () => {
  it('returns stable local date values and durations', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:30:00'));

    expect(todayStr()).toBe('Fri Jul 24 2026');
    expect(currentDOW()).toBe(5);
    expect(currentHour()).toBe(10);
    expect(last7Days()).toHaveLength(7);
    expect(last7Days()[6]).toBe('Fri Jul 24 2026');
    expect(daysBetween('Wed Jul 22 2026', 'Fri Jul 24 2026')).toBe(2);
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(95)).toBe('1h 35m');
  });
});

describe('Subject mastery', () => {
  it('calculates subject levels and applies subject XP safely', () => {
    expect(subjectLevel(0)).toMatchObject({ level: 1, current: 0, need: 50, pct: 0 });
    expect(subjectLevel(50).level).toBe(2);

    addSubjectXP('Physics', 25);
    addSubjectXP('Other', 100);
    addSubjectXP('', 100);

    expect(data.subjects.Physics).toBe(25);
    expect(data.subjects.Other).toBe(0);

    const physics = getSubjectsWithInfo().find((subject) => subject.name === 'Physics');
    expect(physics).toMatchObject({ xp: 25, cls: 'physics' });
  });
});

describe('Backlog module', () => {
  it('adds, increments, caps, totals, and deletes backlogs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(101);

    expect(addBacklog({ name: '', count: 2, subject: 'Physics' }).success).toBe(false);
    expect(addBacklog({ name: '  Kinematics  ', count: 2, subject: 'Physics' })).toEqual({
      success: true,
    });

    expect(getBacklogs()).toHaveLength(1);
    expect(getBacklogs()[0]).toMatchObject({ id: 101, name: 'Kinematics', total: 2, done: 0 });
    expect(data.xp).toBe(10);

    incrementBacklog(999);
    incrementBacklog(101);
    incrementBacklog(101);
    incrementBacklog(101);

    expect(getTotalDone()).toBe(2);
    expect(getRemainingCount()).toBe(0);
    expect(data.backlogsToday).toBe(2);
    expect(data.subjects.Physics).toBe(50);
    expect(data.xp).toBe(60);

    deleteBacklog(101);
    expect(getBacklogs()).toEqual([]);
  });
});

describe('Habit module', () => {
  it('adds, toggles, counts, and deletes habits', () => {
    vi.spyOn(Date, 'now').mockReturnValue(202);

    expect(addHabit({ name: '', anchor: '' }).success).toBe(false);
    expect(addHabit({ name: 'Read', anchor: '' })).toEqual({ success: true });
    expect(getHabits()[0]).toMatchObject({ id: 202, name: 'Read', anchor: 'waking up' });

    toggleHabit(202);
    expect(getTodayCount()).toBe(1);
    expect(data.habitsToday).toBe(1);
    expect(data.dailyChecks.dc7).toBe(true);
    expect(data.xp).toBe(15);

    toggleHabit(202);
    expect(getTodayCount()).toBe(0);
    expect(data.habitsToday).toBe(0);
    expect(getHabits()[0].streak).toBe(0);

    deleteHabit(202);
    expect(getHabits()).toEqual([]);
  });
});

describe('Battle plan module', () => {
  it('adds, sorts, groups, toggles, and deletes tasks', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(301)
      .mockReturnValueOnce(302)
      .mockReturnValueOnce(303);

    expect(addTask({ task: '', priority: 'A', time: 'morning' }).success).toBe(false);
    addTask({ task: 'Low priority', priority: 'C', time: 'evening' });
    addTask({ task: 'Top priority', priority: 'A', time: 'morning' });
    addTask({ task: 'Middle priority', priority: 'B', time: 'afternoon' });

    expect(getTasksSorted().map((task) => task.priority)).toEqual(['A', 'B', 'C']);
    expect(getTasksByTime().morning[0].task).toBe('Top priority');

    toggleTask(302);
    expect(data.battle.find((task) => task.id === 302)?.done).toBe(true);
    expect(data.xp).toBe(10);

    toggleTask(999);
    deleteTask(302);
    expect(data.battle.some((task) => task.id === 302)).toBe(false);
  });
});

describe('Daily quests', () => {
  it('generates, returns, and completes eligible quests once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    generateDailyQuests();

    const quests = getQuests();
    expect(quests).toHaveLength(3);
    expect(data.dailyQuests?.date).toBe(todayStr());

    data.dailyQuests = {
      date: todayStr(),
      quests: [
        { id: 'q_focus', label: 'Complete 1 focus session', reward: 20, completed: false },
        { id: 'q_habit', label: 'Complete 2 habits', reward: 20, completed: false },
        { id: 'q_ritual', label: 'Complete morning ritual', reward: 30, completed: false },
      ],
    };
    data.focusMinutes = 25;
    data.habits = [
      { id: 1, name: 'A', anchor: 'wake', streak: 1, today: true, days: [] },
      { id: 2, name: 'B', anchor: 'wake', streak: 1, today: true, days: [] },
    ];
    data.morningRitual = {
      date: todayStr(),
      completed: true,
      steps: [true, true, true, true, true],
    };

    const completed = checkQuests();
    expect(completed.map((quest) => quest.id)).toEqual(['q_focus', 'q_habit', 'q_ritual']);
    expect(data.xp).toBe(140);
    expect(checkQuests()).toEqual([]);
  });

  it('does not complete stale quest sets', () => {
    data.dailyQuests = {
      date: 'Thu Jul 23 2026',
      quests: [{ id: 'q_focus', label: 'Focus', reward: 20, completed: false }],
    };
    data.focusMinutes = 25;

    expect(checkQuests()).toEqual([]);
  });
});

describe('Morning ritual', () => {
  it('resets stale rituals, toggles steps, and activates the boost before noon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:00:00'));
    data.morningRitual = {
      date: 'Thu Jul 23 2026',
      completed: false,
      steps: [true, true, true, true, true],
    };

    expect(toggleStep(0)).toEqual({ completed: false, allDone: false });
    expect(getRitual().date).toBe('Fri Jul 24 2026');

    for (const idx of [1, 2, 3, 4]) toggleStep(idx);
    expect(toggleStep(0)).toEqual({ completed: true, allDone: true });
    expect(isBoostActive()).toBe(true);

    vi.setSystemTime(new Date('2026-07-24T13:00:00'));
    expect(isBoostActive()).toBe(false);
  });
});

describe('Weekly reporting', () => {
  it('records, updates, fills, trims, and totals weekly stats', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T09:00:00'));
    data.focusMinutes = 90;
    data.backlogsToday = 3;
    data.habitsToday = 2;
    data.detoxLastDate = todayStr();

    recordDailyStat();
    expect(data.weeklyStats).toHaveLength(1);
    expect(data.weeklyStats[0]).toMatchObject({ focus: 1.5, backlogs: 3, habits: 2, streak: 1 });

    data.focusMinutes = 120;
    recordDailyStat();
    expect(data.weeklyStats).toHaveLength(1);
    expect(data.weeklyStats[0].focus).toBe(2);

    data.weeklyStats = Array.from({ length: 7 }, (_, index) => ({
      date: `old-${index}`,
      focus: 1,
      backlogs: 1,
      habits: 1,
      streak: 0,
      score: 1,
    }));
    recordDailyStat();
    expect(data.weeklyStats).toHaveLength(7);
    expect(data.weeklyStats[6].date).toBe(todayStr());

    const weekStats = getWeekStats();
    expect(weekStats).toHaveLength(7);
    expect(weekStats[6].date).toBe(todayStr());

    const totals = getWeekTotals();
    expect(totals.focus).toBeGreaterThanOrEqual(2);
    expect(totals.score).toBeGreaterThan(0);
  });
});

describe('Quotes', () => {
  it('persists a daily quote and can refresh it', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);

    const first = getDailyQuote();
    const second = getDailyQuote();
    const refreshed = refreshQuote();

    expect(first).toBe(QUOTES[0]);
    expect(second).toBe(first);
    expect(refreshed).toBe(QUOTES[QUOTES.length - 1]);
  });
});

describe('Accountability buddy', () => {
  it('sets, removes, summarizes, and shares through clipboard fallback', async () => {
    expect(setBuddy('')).toMatchObject({ success: false });
    expect(setBuddy('  Alex  ')).toEqual({ success: true });
    expect(getBuddy()).toBe('Alex');

    data.xp = 250;
    data.consecutiveStreak = 4;
    data.totalFocusMinutes = 125;
    data.backlogs = [{ id: 1, name: 'Physics', total: 5, done: 2, subject: 'Physics' }];

    expect(generateShareText()).toContain('Accountability partner: Alex');
    expect(generateShareText()).toContain('Backlogs: 3 left');

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });

    await expect(shareProgress()).resolves.toEqual({ success: true, copied: true });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('NeuroFocus Progress'));

    removeBuddy();
    expect(getBuddy()).toBe('');
  });
});

describe('Theme system', () => {
  it('sets valid themes, ignores invalid themes, and loads saved themes', () => {
    setTheme('dusk');
    expect(getCurrentTheme()).toBe('dusk');

    setTheme('invalid' as never);
    expect(getCurrentTheme()).toBe('dusk');

    loadTheme();
    expect(getCurrentTheme()).toBe('dusk');
  });

  it('applies auto themes by time of day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    setAutoTheme(true);
    expect(getCurrentTheme()).toBe('light');

    vi.setSystemTime(new Date('2026-07-24T22:00:00'));
    setAutoTheme(true);
    expect(getCurrentTheme()).toBe('midnight');
  });
});
