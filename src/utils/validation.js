/**
 * Input Validation — Guards against invalid/malicious user input.
 * All form inputs should pass through these before processing.
 */

/**
 * Validates a backlog entry.
 * @param {{name: string, count: number}} input
 * @returns {{valid: boolean, error?: string, data?: object}}
 */
export function validateBacklog({ name, count }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return { valid: false, error: 'Enter a topic name' };
  if (cleanName.length > 100) return { valid: false, error: 'Topic name too long (max 100 chars)' };
  const num = parseInt(count, 10);
  if (isNaN(num) || num < 1) return { valid: false, error: 'Enter at least 1 lecture' };
  if (num > 9999) return { valid: false, error: 'Lecture count too high' };
  return { valid: true, data: { name: cleanName, count: num } };
}

/**
 * Validates a habit entry.
 * @param {{name: string, anchor: string}} input
 * @returns {{valid: boolean, error?: string, data?: object}}
 */
export function validateHabit({ name, anchor }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return { valid: false, error: 'Enter a habit name' };
  if (cleanName.length > 80) return { valid: false, error: 'Habit name too long' };
  const cleanAnchor = String(anchor || '').trim().slice(0, 80) || 'waking up';
  return { valid: true, data: { name: cleanName, anchor: cleanAnchor } };
}

/**
 * Validates a battle task entry.
 * @param {{task: string, priority: string, time: string}} input
 * @returns {{valid: boolean, error?: string, data?: object}}
 */
export function validateBattleTask({ task, priority, time }) {
  const cleanTask = String(task || '').trim();
  if (!cleanTask) return { valid: false, error: 'Enter a task' };
  if (cleanTask.length > 200) return { valid: false, error: 'Task too long' };
  const validPriorities = ['A', 'B', 'C'];
  const validTimes = ['morning', 'afternoon', 'evening'];
  return {
    valid: true,
    data: {
      task: cleanTask,
      priority: validPriorities.includes(priority) ? priority : 'B',
      time: validTimes.includes(time) ? time : 'morning',
    },
  };
}

/**
 * Validates a profile name.
 * @param {string} name
 * @returns {{valid: boolean, error?: string, data?: string}}
 */
export function validateProfileName(name) {
  const clean = String(name || '').trim();
  if (!clean) return { valid: false, error: 'Name cannot be empty' };
  if (clean.length < 2) return { valid: false, error: 'Name too short' };
  if (clean.length > 30) return { valid: false, error: 'Name too long (max 30 chars)' };
  return { valid: true, data: clean };
}

/**
 * Validates a mission statement.
 * @param {string} mission
 * @returns {{valid: boolean, error?: string, data?: string}}
 */
export function validateMission(mission) {
  const clean = String(mission || '').trim();
  if (!clean) return { valid: false, error: 'Mission cannot be empty' };
  if (clean.length > 300) return { valid: false, error: 'Mission too long (max 300 chars)' };
  return { valid: true, data: clean };
}

/**
 * Validates a buddy name.
 * @param {string} name
 * @returns {{valid: boolean, error?: string, data?: string}}
 */
export function validateBuddyName(name) {
  const clean = String(name || '').trim();
  if (!clean) return { valid: false, error: 'Enter partner name' };
  if (clean.length > 50) return { valid: false, error: 'Name too long' };
  return { valid: true, data: clean };
}

/**
 * Validates a Firebase config JSON string.
 * @param {string} jsonStr
 * @returns {{valid: boolean, error?: string, data?: object}}
 */
export function validateFirebaseConfig(jsonStr) {
  const clean = String(jsonStr || '').trim();
  if (!clean) return { valid: false, error: 'Paste your Firebase config JSON first' };
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return { valid: false, error: 'Invalid JSON. Paste the exact config object.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, error: 'Config must be a JSON object' };
  }
  const required = ['apiKey', 'projectId'];
  const missing = required.filter((k) => !parsed[k]);
  if (missing.length) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  return { valid: true, data: parsed };
}

/**
 * Validates email format (basic).
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * Validates password strength.
 * @param {string} password
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}
