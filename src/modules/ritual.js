/**
 * Morning Ritual — 5-step priming routine.
 * Completing before noon grants 2x XP boost for the day.
 */

import { data, persist } from './data.js';
import { todayStr, currentHour } from '../utils/date.js';

export const RITUAL_STEPS = ['Hydrate', 'Sanctuary', 'Organize', 'Goal', 'Mindfulness'];
export const RITUAL_ICONS = ['💧', '📵', '🧹', '🎯', '🧘'];

/**
 * Toggles a ritual step. If all become complete, marks ritual done.
 * @param {number} idx - Step index (0-4)
 * @returns {{completed: boolean, allDone: boolean}}
 */
export function toggleStep(idx) {
  const today = todayStr();

  // Reset if new day
  if (data.morningRitual.date !== today) {
    data.morningRitual = {
      date: today,
      completed: false,
      steps: [false, false, false, false, false],
    };
  }

  // Can't toggle if already completed
  if (data.morningRitual.completed) {
    return { completed: true, allDone: true };
  }

  data.morningRitual.steps[idx] = !data.morningRitual.steps[idx];
  const allDone = data.morningRitual.steps.every(Boolean);

  if (allDone) {
    data.morningRitual.completed = true;
  }

  persist('morningRitual');
  return { completed: data.morningRitual.completed, allDone };
}

/**
 * Checks if the 2x XP boost is currently active.
 * Active when ritual is completed AND it's before noon.
 * @returns {boolean}
 */
export function isBoostActive() {
  return (
    data.morningRitual.completed &&
    data.morningRitual.date === todayStr() &&
    currentHour() < 12
  );
}

/**
 * Gets the current ritual state.
 * @returns {{date: string, completed: boolean, steps: boolean[]}}
 */
export function getRitual() {
  return data.morningRitual;
}
