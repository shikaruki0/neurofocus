/**
 * Habit Forge — Stack tiny habits with streak tracking.
 * Each habit has a 7-day grid and a streak counter.
 */

import { data, persist } from './data.js';
import { addXP } from './xp.js';
import { currentDOW } from '../utils/date.js';
import { validateHabit } from '../utils/validation.js';

/**
 * Adds a new habit.
 * @param {{name: string, anchor: string}} input
 * @returns {{success: boolean, error?: string}}
 */
export function addHabit({ name, anchor }) {
  const validation = validateHabit({ name, anchor });
  if (!validation.valid) return { success: false, error: validation.error };

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
 * @param {number} id - Habit ID
 */
export function toggleHabit(id) {
  const habit = data.habits.find((h) => h.id === id);
  if (!habit) return;

  habit.today = !habit.today;
  const dow = currentDOW();

  if (habit.today) {
    habit.streak = (habit.streak || 0) + 1;
    data.habitsToday = (data.habitsToday || 0) + 1;
    addXP(15, 'Habit Done');
    // Auto-check daily check #7
    data.dailyChecks.dc7 = true;
  } else {
    habit.streak = Math.max(0, (habit.streak || 0) - 1);
    data.habitsToday = Math.max(0, (data.habitsToday || 0) - 1);
  }

  habit.days[dow] = habit.today ? 1 : 0;
  persistMany(['habits', 'habitsToday', 'dailyChecks']);
}

/**
 * Deletes a habit.
 * @param {number} id
 */
export function deleteHabit(id) {
  data.habits = data.habits.filter((h) => h.id !== id);
  persist('habits');
}

/**
 * Gets all habits.
 * @returns {object[]}
 */
export function getHabits() {
  return data.habits;
}

/**
 * Gets habits completed today count.
 * @returns {number}
 */
export function getTodayCount() {
  return data.habits.filter((h) => h.today).length;
}

function persistMany(keys) {
  keys.forEach((k) => persist(k));
}
