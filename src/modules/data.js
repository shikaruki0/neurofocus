/**
 * Data Store — Centralized application state.
 * Single source of truth for all app data.
 * Reads from storage on init, writes through storage on change.
 */

import { get, set } from './storage.js';
import { todayStr } from '../utils/date.js';

const TODAY = todayStr();

/**
 * The complete application data object.
 * All fields have safe defaults so the app works on first launch.
 */
export const data = {
  profileName: get('profileName', 'Warrior'),
  mission: get('mission', 'I am building discipline to score 100% and master my skills.'),
  xp: get('xp', 0),
  detoxStreak: get('detoxStreak', 0),
  consecutiveStreak: get('consecutiveStreak', 0),
  lastStreakDate: get('lastStreakDate', null),
  detoxLastDate: get('detoxLastDate', null),
  dailyChecks: get('dailyChecks', {}),
  dailyCheckDate: get('dailyCheckDate', ''),
  backlogs: get('backlogs', []),
  habits: get('habits', []),
  battle: get('battle', []),
  focusMinutes: get('focusMinutes', 0),
  totalFocusMinutes: get('totalFocusMinutes', 0),
  focusDate: get('focusDate', TODAY),
  flowState: get('flowState', { date: TODAY, sessions: 0 }),
  badgesUnlocked: get('badges', []),
  dailyQuests: get('dailyQuests', null),
  morningRitual: get('morningRitual', {
    date: '',
    completed: false,
    steps: [false, false, false, false, false],
  }),
  subjects: get('subjects', {
    Physics: 0,
    Chemistry: 0,
    Math: 0,
    Biology: 0,
    Hindi: 0,
    English: 0,
    IT: 0,
    Other: 0,
  }),
  weeklyStats: get('weeklyStats', []),
  streakFreezes: get('streakFreezes', 0),
  buddyName: get('buddyName', ''),
  backlogsToday: get('backlogsToday', 0),
  habitsToday: get('habitsToday', 0),
  sessions: get('sessions', []),
  autoTheme: get('autoTheme', false),
  theme: get('theme', 'midnight'),
};

// --- Daily resets ---

/** Resets per-day counters if the day has changed. */
function applyDailyResets() {
  if (data.focusDate !== TODAY) {
    data.focusMinutes = 0;
    data.focusDate = TODAY;
    set('focusDate', TODAY);
    set('focusMinutes', 0);
  }

  if (data.flowState.date !== TODAY) {
    data.flowState = { date: TODAY, sessions: 0 };
    set('flowState', data.flowState);
  }

  if (data.dailyCheckDate !== TODAY) {
    data.dailyChecks = {};
    data.dailyCheckDate = TODAY;
    set('dailyChecks', {});
    set('dailyCheckDate', TODAY);
  }

  if (data.morningRitual.date !== TODAY) {
    data.morningRitual = {
      date: TODAY,
      completed: false,
      steps: [false, false, false, false, false],
    };
    set('morningRitual', data.morningRitual);
  }

  const statCheck = get('statCheck', '');
  if (statCheck !== TODAY) {
    data.backlogsToday = 0;
    data.habitsToday = 0;
    set('backlogsToday', 0);
    set('habitsToday', 0);
    set('statCheck', TODAY);
  }
}

// --- Persistence helper ---

/**
 * Persists a data field to storage.
 * @param {string} key - Field name (matches storage key)
 */
export function persist(key) {
  set(key, data[key]);
}

/**
 * Persists multiple fields at once.
 * @param {string[]} keys
 */
export function persistMany(keys) {
  keys.forEach((k) => set(k, data[k]));
}

// --- Habit daily reset ---

/**
 * Resets habit "today" flags if it's a new day.
 */
export function resetHabitsForNewDay() {
  const lastCheck = get('habitCheck', '');
  if (lastCheck !== TODAY) {
    data.habits.forEach((h) => {
      h.today = false;
    });
    set('habits', data.habits);
    set('habitCheck', TODAY);
  }
}

// Initialize daily resets on module load
applyDailyResets();
