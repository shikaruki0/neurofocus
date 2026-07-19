/**
 * Input Validation — Guards against invalid/malicious user input.
 * All form inputs should pass through these before processing.
 */

interface ValidationResult<T> {
  valid: boolean;
  error?: string;
  data?: T;
}

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

interface FirebaseConfigInput {
  apiKey: string;
  projectId: string;
  [key: string]: unknown;
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

/**
 * Validates a Firebase config JSON string.
 * @param jsonStr - JSON string
 * @returns Validation result
 */
export function validateFirebaseConfig(jsonStr: string): ValidationResult<FirebaseConfigInput> {
  const clean = String(jsonStr || '').trim();
  if (!clean) return { valid: false, error: 'Paste your Firebase config JSON first' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return { valid: false, error: 'Invalid JSON. Paste the exact config object.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, error: 'Config must be a JSON object' };
  }
  const required = ['apiKey', 'projectId'];
  const missing = required.filter((k) => !(parsed as Record<string, unknown>)[k]);
  if (missing.length) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  return { valid: true, data: parsed as FirebaseConfigInput };
}

/**
 * Validates email format (basic).
 * @param email - Email string
 * @returns True if valid
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * Validates password strength.
 * @param password - Password string
 * @returns Validation result
 */
export function validatePassword(password: string): ValidationResult<void> {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}
