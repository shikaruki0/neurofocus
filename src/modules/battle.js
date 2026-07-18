/**
 * Battle Plan — Priority-based daily task planning.
 * Tasks are sorted by priority (A > B > C) and time of day.
 */

import { data, persist } from './data.js';
import { addXP } from './xp.js';
import { validateBattleTask } from '../utils/validation.js';

const PRIORITY_ORDER = { A: 1, B: 2, C: 3 };

/**
 * Adds a new battle task.
 * @param {{task: string, priority: string, time: string}} input
 * @returns {{success: boolean, error?: string}}
 */
export function addTask({ task, priority, time }) {
  const validation = validateBattleTask({ task, priority, time });
  if (!validation.valid) return { success: false, error: validation.error };

  data.battle.push({
    id: Date.now(),
    task: validation.data.task,
    priority: validation.data.priority,
    time: validation.data.time,
    done: false,
  });

  persist('battle');
  return { success: true };
}

/**
 * Toggles a task's completion.
 * @param {number} id
 */
export function toggleTask(id) {
  const task = data.battle.find((t) => t.id === id);
  if (!task) return;

  task.done = !task.done;
  persist('battle');

  if (task.done) {
    addXP(10, 'Task Done');
  }
}

/**
 * Deletes a task.
 * @param {number} id
 */
export function deleteTask(id) {
  data.battle = data.battle.filter((t) => t.id !== id);
  persist('battle');
}

/**
 * Gets all tasks sorted by priority.
 * @returns {object[]}
 */
export function getTasksSorted() {
  return [...data.battle].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/**
 * Gets tasks grouped by time of day.
 * @returns {{morning: object[], afternoon: object[], evening: object[]}}
 */
export function getTasksByTime() {
  const groups = { morning: [], afternoon: [], evening: [] };
  for (const task of data.battle) {
    if (groups[task.time]) groups[task.time].push(task);
  }
  return groups;
}
