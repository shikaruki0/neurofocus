/**
 * Input Validation — Guards against invalid/malicious user input.
 * All form inputs should pass through these before processing.
 */

type ValidationResult<T = void> =
  | (T extends void ? { valid: true; data?: undefined } : { valid: true; data: T })
  | { valid: false; error: string; data?: never };

interface BacklogInput {
  name: string;
  count: number;
}

interface HabitInput {
  name: string;
  anchor: string;
}

interface BattleTaskInput {
  task: string;
  priority: string;
  time: string;
}

/**
 * Validates a backlog entry.
 * @param input - Backlog input
 * @returns Validation result
 */
export function validateBacklog(input: BacklogInput): ValidationResult<BacklogInput> {
  const cleanName = String(input.name || '').trim();
  if (!cleanName) return { valid: false, error: 'Enter a topic name' };
  if (cleanName.length > 100) return { valid: false, error: 'Topic name too long (max 100 chars)' };
  const num = parseInt(String(input.count), 10);
  if (isNaN(num) || num < 1) return { valid: false, error: 'Enter at least 1 lecture' };
  if (num > 9999) return { valid: false, error: 'Lecture count too high' };
  return { valid: true, data: { name: cleanName, count: num } };
}

/**
 * Validates a habit entry.
 * @param input - Habit input
 * @returns Validation result
 */
export function validateHabit(input: HabitInput): ValidationResult<HabitInput> {
  const cleanName = String(input.name || '').trim();
  if (!cleanName) return { valid: false, error: 'Enter a habit name' };
  if (cleanName.length > 80) return { valid: false, error: 'Habit name too long' };
  const cleanAnchor =
    String(input.anchor || '')
      .trim()
      .slice(0, 80) || 'waking up';
  return { valid: true, data: { name: cleanName, anchor: cleanAnchor } };
}

/**
 * Validates a battle task entry.
 * @param input - Battle task input
 * @returns Validation result
 */
export function validateBattleTask(input: BattleTaskInput): ValidationResult<BattleTaskInput> {
  const cleanTask = String(input.task || '').trim();
  if (!cleanTask) return { valid: false, error: 'Enter a task' };
  if (cleanTask.length > 200) return { valid: false, error: 'Task too long' };
  const validPriorities = ['A', 'B', 'C'] as const;
  const validTimes = ['morning', 'afternoon', 'evening'] as const;
  return {
    valid: true,
    data: {
      task: cleanTask,
      priority: validPriorities.includes(input.priority as (typeof validPriorities)[number])
        ? input.priority
        : 'B',
      time: validTimes.includes(input.time as (typeof validTimes)[number]) ? input.time : 'morning',
    },
  };
}

/**
 * Validates a profile name.
 * @param name - Profile name
 * @returns Validation result
 */
export function validateProfileName(name: string): ValidationResult<string> {
  const clean = String(name || '').trim();
  if (!clean) return { valid: false, error: 'Name cannot be empty' };
  if (clean.length < 2) return { valid: false, error: 'Name too short' };
  if (clean.length > 30) return { valid: false, error: 'Name too long (max 30 chars)' };
  return { valid: true, data: clean };
}

/**
 * Validates a mission statement.
 * @param mission - Mission statement
 * @returns Validation result
 */
export function validateMission(mission: string): ValidationResult<string> {
  const clean = String(mission || '').trim();
  if (!clean) return { valid: false, error: 'Mission cannot be empty' };
  if (clean.length > 300) return { valid: false, error: 'Mission too long (max 300 chars)' };
  return { valid: true, data: clean };
}

/**
 * Validates a mission planner setup (title, subject, durations).
 * Pure planning — does NOT touch timer, XP, or backlog state.
 */
export function validateMissionSetup(input: {
  title: string;
  totalMinutes: unknown;
  blockMinutes: unknown;
}): ValidationResult<{
  title: string;
  subject: string;
  totalMinutes: number;
  blockMinutes: number;
}> {
  const cleanTitle = String(input.title || '').trim();
  if (!cleanTitle) return { valid: false, error: 'Enter a mission title' };
  if (cleanTitle.length > 100)
    return { valid: false, error: 'Mission title too long (max 100 chars)' };

  const total = Number(input.totalMinutes);
  if (!Number.isFinite(total)) return { valid: false, error: 'Enter a valid total duration' };
  if (!Number.isInteger(total))
    return { valid: false, error: 'Use whole minutes for total duration' };
  if (total <= 0) return { valid: false, error: 'Total duration must be greater than 0' };
  if (total > 720)
    return { valid: false, error: 'Total duration too high (max 720 minutes)' };

  const block = Number(input.blockMinutes);
  if (!Number.isFinite(block)) return { valid: false, error: 'Enter a valid block duration' };
  if (!Number.isInteger(block))
    return { valid: false, error: 'Use whole minutes for block duration' };
  if (block <= 0) return { valid: false, error: 'Block duration must be greater than 0' };
  if (block > 180) return { valid: false, error: 'Block duration too high (max 180 minutes)' };

  return {
    valid: true,
    data: {
      title: cleanTitle,
      subject: 'Other',
      totalMinutes: total,
      blockMinutes: block,
    },
  };
}

/**
 * Validates a buddy name.
 * @param name - Buddy name
 * @returns Validation result
 */
export function validateBuddyName(name: string): ValidationResult<string> {
  const clean = String(name || '').trim();
  if (!clean) return { valid: false, error: 'Enter partner name' };
  if (clean.length > 50) return { valid: false, error: 'Name too long' };
  return { valid: true, data: clean };
}
