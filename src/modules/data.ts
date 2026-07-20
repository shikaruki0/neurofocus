/**
 * Data Store — Centralized application state.
 * Single source of truth for all app data.
 * Reads from storage on init, writes through storage on change.
 */

import { get, set } from './storage.ts';
import { todayStr } from '../utils/date.ts';

function getToday(): string {
  return todayStr();
}
const TODAY = getToday();

interface MorningRitual {
  date: string;
  completed: boolean;
  steps: boolean[];
}

interface FlowState {
  date: string;
  sessions: number;
}

interface SubjectXP {
  Physics: number;
  Chemistry: number;
  Math: number;
  Biology: number;
  Hindi: number;
  English: number;
  IT: number;
  Other: number;
  [key: string]: number;
}

interface WeeklyStat {
  date: string;
  focus: number;
  backlogs: number;
  habits: number;
  streak: number;
  score: number;
}

interface Session {
  date: string;
  time: number;
  duration: number;
}

interface Backlog {
  id: number;
  name: string;
  total: number;
  done: number;
  subject: string;
}

interface Habit {
  id: number;
  name: string;
  anchor: string;
  streak: number;
  today: boolean;
  days: number[];
}

interface BattleTask {
  id: number;
  task: string;
  priority: 'A' | 'B' | 'C';
  time: 'morning' | 'afternoon' | 'evening';
  done: boolean;
}

interface DailyQuest {
  id: string;
  label: string;
  reward: number;
  completed: boolean;
}

interface DailyQuests {
  date: string;
  quests: DailyQuest[];
}

/**
 * The complete application data object.
 * All fields have safe defaults so the app works on first launch.
 */
export const data = {
  profileName: get<string>('profileName', 'Warrior'),
  mission: get<string>('mission', 'I am building discipline to score 100% and master my skills.'),
  xp: get<number>('xp', 0),
  detoxStreak: get<number>('detoxStreak', 0),
  consecutiveStreak: get<number>('consecutiveStreak', 0),
  lastStreakDate: get<string | null>('lastStreakDate', null),
  detoxLastDate: get<string | null>('detoxLastDate', null),
  dailyChecks: get<Record<string, boolean>>('dailyChecks', {}),
  dailyCheckDate: get<string>('dailyCheckDate', ''),
  backlogs: get<Backlog[]>('backlogs', []),
  habits: get<Habit[]>('habits', []),
  battle: get<BattleTask[]>('battle', []),
  focusMinutes: get<number>('focusMinutes', 0),
  totalFocusMinutes: get<number>('totalFocusMinutes', 0),
  focusDate: get<string>('focusDate', TODAY),
  flowState: get<FlowState>('flowState', { date: TODAY, sessions: 0 }),
  badgesUnlocked: get<string[]>('badges', []),
  dailyQuests: get<DailyQuests | null>('dailyQuests', null),
  morningRitual: get<MorningRitual>('morningRitual', {
    date: '',
    completed: false,
    steps: [false, false, false, false, false],
  }),
  subjects: get<SubjectXP>('subjects', {
    Physics: 0,
    Chemistry: 0,
    Math: 0,
    Biology: 0,
    Hindi: 0,
    English: 0,
    IT: 0,
    Other: 0,
  }),
  weeklyStats: get<WeeklyStat[]>('weeklyStats', []),
  streakFreezes: get<number>('streakFreezes', 0),
  buddyName: get<string>('buddyName', ''),
  backlogsToday: get<number>('backlogsToday', 0),
  habitsToday: get<number>('habitsToday', 0),
  sessions: get<Session[]>('sessions', []),
  autoTheme: get<boolean>('autoTheme', false),
  theme: get<string>('theme', 'midnight'),
};

// --- Daily resets ---

/** Resets per-day counters if the day has changed. Uses dynamic today for correctness. */
function applyDailyResets(): void {
  const today = getToday();
  if (data.focusDate !== today) {
    data.focusMinutes = 0;
    data.focusDate = today;
    set('focusDate', today);
    set('focusMinutes', 0);
  }

  if (data.flowState.date !== today) {
    data.flowState = { date: today, sessions: 0 };
    set('flowState', data.flowState);
  }

  if (data.dailyCheckDate !== today) {
    data.dailyChecks = {};
    data.dailyCheckDate = today;
    set('dailyChecks', {});
    set('dailyCheckDate', today);
  }

  if (data.morningRitual.date !== today) {
    data.morningRitual = {
      date: today,
      completed: false,
      steps: [false, false, false, false, false],
    };
    set('morningRitual', data.morningRitual);
  }

  const statCheck = get<string>('statCheck', '');
  if (statCheck !== today) {
    data.backlogsToday = 0;
    data.habitsToday = 0;
    set('backlogsToday', 0);
    set('habitsToday', 0);
    set('statCheck', today);
  }
}

// --- Persistence helper ---

/**
 * Persists a data field to storage.
 * @param key - Field name (matches storage key)
 */
export function persist(key: keyof typeof data): void {
  set(key, data[key]);
}

/**
 * Persists multiple fields at once.
 * @param keys
 */
export function persistMany(keys: (keyof typeof data)[]): void {
  keys.forEach((k) => set(k, data[k]));
}

// --- Habit daily reset ---

/**
 * Resets habit "today" flags if it's a new day.
 */
export function resetHabitsForNewDay(): void {
  const today = getToday();
  const lastCheck = get<string>('habitCheck', '');
  if (lastCheck !== today) {
    data.habits.forEach((h) => {
      h.today = false;
    });
    set('habits', data.habits);
    set('habitCheck', today);
  }
}

// Initialize daily resets on module load
applyDailyResets();
