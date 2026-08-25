/**
 * Battle Plan — Priority-based daily task planning.
 * Tasks are sorted by priority (A > B > C) and time of day.
 */

import { data, persist } from './data.ts';
import { addXP } from './xp.ts';
import { validateBattleTask } from '../utils/validation.ts';

type Priority = 'A' | 'B' | 'C';
type TimeOfDay = 'morning' | 'afternoon' | 'evening';

const PRIORITY_ORDER: Record<Priority, number> = { A: 1, B: 2, C: 3 };

export interface BattleTaskInput {
  task: string;
  priority: string;
  time: string;
}

export interface BattleTaskResult {
  success: boolean;
  error?: string;
}

export interface BattleTask {
  id: number;
  task: string;
  priority: Priority;
  time: TimeOfDay;
  done: boolean;
  /** XP credited when completed; revoked exactly on un-check. */
  xpAwarded?: number;
}

/**
 * Adds a new battle task.
 * @param input - Task input
 * @returns Result
 */
export function addTask(input: BattleTaskInput): BattleTaskResult {
  const validation = validateBattleTask(input);
  if (!validation.valid || !validation.data) return { success: false, error: validation.error };

  data.battle.push({
    id: Date.now(),
    task: validation.data.task,
    priority: validation.data.priority as Priority,
    time: validation.data.time as TimeOfDay,
    done: false,
  });

  persist('battle');
  return { success: true };
}

/**
 * Toggles a task's completion.
 * @param id - Task ID
 */
export function toggleTask(id: number): void {
  const task = data.battle.find((t) => t.id === id);
  if (!task) return;

  task.done = !task.done;

  if (task.done) {
    if (task.xpAwarded === undefined) {
      // Award (and remember) the boost-adjusted XP once per completion.
      task.xpAwarded = addXP(10, 'Task Done');
    }
  } else if (task.xpAwarded !== undefined) {
    // Undo revokes exactly what was credited — toggling can't farm XP.
    data.xp = Math.max(0, data.xp - task.xpAwarded);
    persist('xp');
    task.xpAwarded = undefined;
  }

  persist('battle');
}

/**
 * Deletes a task.
 * Revokes the completion credit when deleting a done task — otherwise
 * create → complete → delete → recreate mints the +10 (or boosted) XP every
 * cycle with zero work (the same farm deleteHabit already closes).
 * @param id - Task ID
 */
export function deleteTask(id: number): void {
  const task = data.battle.find((t) => t.id === id);
  if (task && task.xpAwarded !== undefined) {
    data.xp = Math.max(0, (data.xp || 0) - task.xpAwarded);
    task.xpAwarded = undefined;
    persist('xp');
  }
  data.battle = data.battle.filter((t) => t.id !== id);
  persist('battle');
}

/**
 * Gets all tasks sorted by priority.
 * @returns Sorted tasks
 */
export function getTasksSorted(): BattleTask[] {
  return [...data.battle].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/**
 * Gets tasks grouped by time of day.
 * @returns Grouped tasks
 */
export function getTasksByTime(): Record<TimeOfDay, BattleTask[]> {
  const groups: Record<TimeOfDay, BattleTask[]> = { morning: [], afternoon: [], evening: [] };
  for (const task of data.battle) {
    if (groups[task.time]) groups[task.time].push(task);
  }
  return groups;
}
