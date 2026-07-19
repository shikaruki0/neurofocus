/**
 * Backlog Blaster — Track lectures by subject.
 * Each increment awards subject XP + main XP.
 */

import { data, persist } from './data.ts';
import { addXP } from './xp.ts';
import { addSubjectXP } from './subjects.ts';
import { validateBacklog } from '../utils/validation.ts';

export interface BacklogInput {
  name: string;
  count: number;
  subject: string;
}

export interface BacklogResult {
  success: boolean;
  error?: string;
}

export interface Backlog {
  id: number;
  name: string;
  total: number;
  done: number;
  subject: string;
}

/**
 * Adds a new backlog entry.
 * @param input - Backlog input
 * @returns Result
 */
export function addBacklog(input: BacklogInput): BacklogResult {
  const validation = validateBacklog({ name: input.name, count: input.count });
  if (!validation.valid || !validation.data) return { success: false, error: validation.error };

  data.backlogs.push({
    id: Date.now(),
    name: validation.data.name,
    total: validation.data.count,
    done: 0,
    subject: input.subject || 'Physics',
  });

  persist('backlogs');
  addXP(10, 'Backlog Added');
  return { success: true };
}

/**
 * Increments a backlog's completed count.
 * @param id - Backlog ID
 */
export function incrementBacklog(id: number): void {
  const backlog = data.backlogs.find((b) => b.id === id);
  if (!backlog) return;
  if ((backlog.done || 0) >= (backlog.total || 0)) return;

  backlog.done = (backlog.done || 0) + 1;
  data.backlogsToday = (data.backlogsToday || 0) + 1;

  persist('backlogs');
  persist('backlogsToday');
  addSubjectXP(backlog.subject, 25);
  addXP(25, 'Backlog Crushed');
}

/**
 * Deletes a backlog entry.
 * @param id - Backlog ID
 */
export function deleteBacklog(id: number): void {
  data.backlogs = data.backlogs.filter((b) => b.id !== id);
  persist('backlogs');
}

/**
 * Gets all backlogs.
 * @returns Backlogs
 */
export function getBacklogs(): Backlog[] {
  return data.backlogs;
}

/**
 * Gets total completed lectures across all backlogs.
 * @returns Total completed
 */
export function getTotalDone(): number {
  return data.backlogs.reduce((sum, b) => sum + (b.done || 0), 0);
}

/**
 * Gets remaining lectures count.
 * @returns Remaining count
 */
export function getRemainingCount(): number {
  return data.backlogs.reduce((sum, b) => sum + ((b.total || 0) - (b.done || 0)), 0);
}
