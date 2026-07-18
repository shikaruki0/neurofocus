/**
 * Backlog Blaster — Track lectures by subject.
 * Each increment awards subject XP + main XP.
 */

import { data, persist } from './data.js';
import { addXP } from './xp.js';
import { addSubjectXP } from './subjects.js';
import { validateBacklog } from '../utils/validation.js';

/**
 * Adds a new backlog entry.
 * @param {{name: string, count: number, subject: string}} input
 * @returns {{success: boolean, error?: string}}
 */
export function addBacklog({ name, count, subject }) {
  const validation = validateBacklog({ name, count });
  if (!validation.valid) return { success: false, error: validation.error };

  data.backlogs.push({
    id: Date.now(),
    name: validation.data.name,
    total: validation.data.count,
    done: 0,
    subject: subject || 'Physics',
  });

  persist('backlogs');
  addXP(10, 'Backlog Added');
  return { success: true };
}

/**
 * Increments a backlog's completed count.
 * @param {number} id - Backlog ID
 */
export function incrementBacklog(id) {
  const backlog = data.backlogs.find((b) => b.id === id);
  if (!backlog) return;
  if ((backlog.done || 0) >= (backlog.total || 0)) return;

  backlog.done = (backlog.done || 0) + 1;
  data.backlogsToday = (data.backlogsToday || 0) + 1;

  persistMany(['backlogs', 'backlogsToday']);
  addSubjectXP(backlog.subject, 25);
  addXP(25, 'Backlog Crushed');
}

/**
 * Deletes a backlog entry.
 * @param {number} id
 */
export function deleteBacklog(id) {
  data.backlogs = data.backlogs.filter((b) => b.id !== id);
  persist('backlogs');
}

/**
 * Gets all backlogs.
 * @returns {object[]}
 */
export function getBacklogs() {
  return data.backlogs;
}

/**
 * Gets total completed lectures across all backlogs.
 * @returns {number}
 */
export function getTotalDone() {
  return data.backlogs.reduce((sum, b) => sum + (b.done || 0), 0);
}

/**
 * Gets remaining lectures count.
 * @returns {number}
 */
export function getRemainingCount() {
  return data.backlogs.reduce((sum, b) => sum + ((b.total || 0) - (b.done || 0)), 0);
}

function persistMany(keys) {
  keys.forEach((k) => persist(k));
}
