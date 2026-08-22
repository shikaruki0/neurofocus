/**
 * Habit Forge — Stack tiny habits with streak tracking.
 * Each habit has a 7-day grid and a streak counter.
 */

import { data, persist } from './data.ts';
import { addXP } from './xp.ts';
import { currentDOW } from '../utils/date.ts';
import { validateHabit } from '../utils/validation.ts';

export interface HabitInput {
  name: string;
  anchor: string;
}

export interface HabitResult {
  success: boolean;
  error?: string;
}

export interface Habit {
  id: number;
  name: string;
  anchor: string;
  streak: number;
  today: boolean;
  days: number[];
  /** XP credited when completed today; revoked exactly on un-check. */
  xpAwarded?: number;
}

/**
 * Adds a new habit.
 * @param input - Habit input
 * @returns Result
 */
export function addHabit(input: HabitInput): HabitResult {
  const validation = validateHabit(input);
  if (!validation.valid || !validation.data) return { success: false, error: validation.error };

  data.habits.push({
    id: Date.now(),
    name: validation.data.name,
    anchor: validation.data.anchor,
    streak: 0,
    today: false,
    days: [0, 0, 0, 0, 0, 0, 0],
  });

  persist('habits');
  return { success: true };
}

/**
 * Toggles a habit's completion for today.
 * @param id - Habit ID
 */
export function toggleHabit(id: number): void {
  const habit = data.habits.find((h) => h.id === id);
  if (!habit) return;

  habit.today = !habit.today;
  const dow = currentDOW();

  if (habit.today) {
    habit.streak = (habit.streak || 0) + 1;
    data.habitsToday = (data.habitsToday || 0) + 1;
    if (habit.xpAwarded === undefined) {
      // First completion today: award (and remember) the boost-adjusted XP.
      habit.xpAwarded = addXP(15, 'Habit Done');
    }
    // Auto-check daily check #7
    data.dailyChecks.dc7 = true;
  } else {
    habit.streak = Math.max(0, (habit.streak || 0) - 1);
    data.habitsToday = Math.max(0, (data.habitsToday || 0) - 1);
    // Undo revokes exactly what was credited, so toggling can't farm XP.
    if (habit.xpAwarded !== undefined) {
      data.xp = Math.max(0, data.xp - habit.xpAwarded);
      persist('xp');
      habit.xpAwarded = undefined;
    }
  }

  habit.days[dow] = habit.today ? 1 : 0;
  persist('habits');
  persist('habitsToday');
  persist('dailyChecks');
}

/**
 * Deletes a habit.
 * @param id - Habit ID
 */
export function deleteHabit(id: number): void {
  data.habits = data.habits.filter((h) => h.id !== id);
  persist('habits');
}

/**
 * Gets all habits.
 * @returns Habits
 */
export function getHabits(): Habit[] {
  return data.habits;
}

/**
 * Gets habits completed today count.
 * @returns Today count
 */
export function getTodayCount(): number {
  return data.habits.filter((h) => h.today).length;
}
