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
  Physics?: number;
  Chemistry?: number;
  Math?: number;
  Biology?: number;
  History?: number;
  Geography?: number;
  Economics?: number;
  Hindi?: number;
  English?: number;
  IT?: number;
  Other?: number;
  [key: string]: number | undefined;
}

interface StudentProfile {
  name: string;
  country: string;
  classLevel: number;
  board: 'NCERT' | 'Other';
  medium: 'English' | 'Hindi' | 'Other';
  secondLanguage: 'hindi-a' | 'hindi-b' | 'sanskrit' | 'urdu' | 'other' | 'none';
  attendsCoaching: boolean;
  syllabusPackId: 'india-ncert-class-10' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface SoundSettings {
  enabled: boolean;
  volume: number;
  pack: 'pop' | 'bell' | 'chime' | 'zen';
  loop: boolean;
  notifications: boolean;
  vibration: boolean;
}

interface DailyClassCheck {
  date: string;
  status: 'complete' | 'skipped';
  totalHeld: number;
  attended: number;
  missed: number;
  assignedBacklog: number;
  handledAt: number;
}

interface WeeklyStat {
  date: string;
  focus: number;
  backlogs: number;
  habits: number;
  streak: number;
  score: number;
}

export interface Session {
  date: string;
  time: number;
  duration: number;
  /** XP this session awarded (recorded at completion; absent on legacy entries). */
  xp?: number;
  /** Timer label at completion (e.g. "Pomodoro", "Mission Block", "Custom"). */
  label?: string;
}

interface Backlog {
  id: number;
  name: string;
  total: number;
  done: number;
  subject: string;
  subjectLabel?: string;
  chapterId?: string;
  chapterName?: string;
  bookId?: string;
  bookName?: string;
  unitName?: string;
  source?: 'manual' | 'ncert-class10';
  createdFrom?: 'manual' | 'initial-setup' | 'daily-check';
  updatedAt?: number;
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
  studentProfile: get<StudentProfile | null>('studentProfile', null),
  initialBacklogSetupComplete: get<boolean>('initialBacklogSetupComplete', false),
  dailyClassCheck: get<DailyClassCheck | null>('dailyClassCheck', null),
  backlogs: get<Backlog[]>('backlogs', []),
  habits: get<Habit[]>('habits', []),
  battle: get<BattleTask[]>('battle', []),
  focusMinutes: get<number>('focusMinutes', 0),
  totalFocusMinutes: get<number>('totalFocusMinutes', 0),
  focusDate: get<string>('focusDate', TODAY),
  flowState: get<FlowState>('flowState', { date: TODAY, sessions: 0 }),
  badgesUnlocked: get<string[]>('badgesUnlocked', []),
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
    History: 0,
    Geography: 0,
    Economics: 0,
    Hindi: 0,
    English: 0,
    IT: 0,
    Other: 0,
  }),
  weeklyStats: get<WeeklyStat[]>('weeklyStats', []),
  streakFreezes: get<number>('streakFreezes', 0),
  buddyName: get<string>('buddyName', ''),
  hasOnboarded: get<boolean>('hasOnboarded', false),
  lastLoginAt: get<number | null>('lastLoginAt', null),
  backlogsToday: get<number>('backlogsToday', 0),
  habitsToday: get<number>('habitsToday', 0),
  sessions: get<Session[]>('sessions', []),
  autoTheme: get<boolean>('autoTheme', false),
  theme: get<string>('theme', 'midnight'),
  soundSettings: get<SoundSettings>('soundSettings', {
    enabled: true,
    volume: 0.8,
    pack: 'pop',
    loop: true,
    notifications: true,
    vibration: true,
  }),
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
