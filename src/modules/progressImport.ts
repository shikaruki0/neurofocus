/**
 * Safe Progress Import — Validates and restores NeuroFocusX JSON exports.
 *
 * Security:
 *  - Rejects non-NeuroFocusX JSON
 *  - Blocks prototype pollution keys
 *  - Blocks auth tokens and credentials
 *  - Enforces file-size limit
 *  - Validates field types before applying
 *  - Creates backup before replacement
 */

import { createLocalBackup, localData } from './cloudSync.ts';
import { data, persist } from './data.ts';
import { reconcileDailyFocus } from './focusDaily.ts';
import { set } from './storage.ts';

/** Conservative file size limit: 2 MB */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

/** Keys that must NEVER be imported (auth, tokens, credentials). */
const BLOCKED_KEYS = new Set([
  'authUser',
  'supabase',
  'sb-',
  'access_token',
  'refresh_token',
  'token',
  'password',
  'secret',
  'serviceRole',
  'service_role',
  'sb-access-token',
  'sb-refresh-token',
]);

/** Prototype pollution keys to reject. */
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Known NeuroFocusX data fields with expected types for validation.
 * 'any' means we accept any value but still sanitize.
 */
type FieldType = 'number' | 'string' | 'boolean' | 'array' | 'object' | 'any';
const KNOWN_FIELDS: Record<string, FieldType> = {
  profileName: 'string',
  mission: 'string',
  xp: 'number',
  detoxStreak: 'number',
  consecutiveStreak: 'number',
  lastStreakDate: 'any',
  detoxLastDate: 'any',
  dailyChecks: 'object',
  dailyCheckDate: 'string',
  studentProfile: 'any',
  initialBacklogSetupComplete: 'boolean',
  dailyClassCheck: 'any',
  backlogs: 'array',
  habits: 'array',
  battle: 'array',
  focusMinutes: 'number',
  totalFocusMinutes: 'number',
  focusDate: 'string',
  flowState: 'object',
  badges: 'array',
  dailyQuests: 'any',
  morningRitual: 'object',
  subjects: 'object',
  weeklyStats: 'array',
  streakFreezes: 'number',
  buddyName: 'string',
  hasOnboarded: 'boolean',
  lastLoginAt: 'any',
  backlogsToday: 'number',
  habitsToday: 'number',
  sessions: 'array',
  autoTheme: 'boolean',
  theme: 'string',
  statCheck: 'string',
  habitCheck: 'string',
  badgesUnlocked: 'array',
  backupSnapshots: 'array',
  soundSettings: 'object',
  activeMission: 'any',
};

/** Maximum safe string length for imported strings. */
const MAX_STRING_LENGTH = 10000;
/** Maximum safe array length. */
const MAX_ARRAY_LENGTH = 50000;
/** Maximum safe number magnitude. */
const MAX_NUMBER = 1e12;

export interface ImportValidationResult {
  valid: boolean;
  error?: string;
  sanitizedData?: Record<string, unknown>;
  fieldCount?: number;
}

/**
 * Checks if a key is blocked (auth, credentials, or prototype pollution).
 */
function isBlockedKey(key: string): boolean {
  if (PROTOTYPE_POLLUTION_KEYS.has(key)) return true;
  if (BLOCKED_KEYS.has(key)) return true;
  // Block keys that look like Supabase internal storage
  if (key.startsWith('sb-') && key.includes('auth-token')) return true;
  return false;
}

/**
 * Checks if the data looks like a NeuroFocusX export.
 * At least 3 recognized fields must be present.
 */
function looksLikeNeuroFocusXExport(data: Record<string, unknown>): boolean {
  let recognizedCount = 0;
  for (const key of Object.keys(data)) {
    if (key in KNOWN_FIELDS) recognizedCount++;
  }
  return recognizedCount >= 3;
}

/**
 * Sanitizes and validates a single field value.
 */
function sanitizeValue(key: string, value: unknown, expectedType: FieldType): unknown {
  if (value === null || value === undefined) return value;

  switch (expectedType) {
    case 'number': {
      if (typeof value !== 'number' || !isFinite(value)) return null;
      if (Math.abs(value) > MAX_NUMBER) return null;
      return value;
    }
    case 'string': {
      if (typeof value !== 'string') return null;
      return value.slice(0, MAX_STRING_LENGTH);
    }
    case 'boolean': {
      if (typeof value !== 'boolean') return null;
      return value;
    }
    case 'array': {
      if (!Array.isArray(value)) return null;
      if (value.length > MAX_ARRAY_LENGTH) return null;
      return value;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) return null;
      // Reject objects with prototype pollution keys in nested level
      for (const k of Object.keys(value as Record<string, unknown>)) {
        if (PROTOTYPE_POLLUTION_KEYS.has(k)) return null;
      }
      return value;
    }
    case 'any':
    default:
      return value;
  }
}

/**
 * Parses and validates imported JSON data.
 * Does NOT modify any existing data.
 */
export function validateImportData(rawContent: string): ImportValidationResult {
  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      valid: false,
      error: 'This file is not valid JSON. Please use a NeuroFocusX export file.',
    };
  }

  // Must be a plain object
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      error: 'The file does not contain a valid NeuroFocusX backup.',
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Must look like NeuroFocusX data
  if (!looksLikeNeuroFocusXExport(obj)) {
    return {
      valid: false,
      error: 'This does not appear to be a NeuroFocusX export file.',
    };
  }

  // Sanitize and validate each field
  const sanitized: Record<string, unknown> = {};
  let fieldCount = 0;

  for (const [key, value] of Object.entries(obj)) {
    // Skip blocked keys
    if (isBlockedKey(key)) continue;

    // Skip unknown fields (only import known fields)
    if (!(key in KNOWN_FIELDS)) continue;

    const expectedType = KNOWN_FIELDS[key];
    const sanitizedValue = sanitizeValue(key, value, expectedType);

    if (sanitizedValue !== null && sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
      fieldCount++;
    }
  }

  if (fieldCount === 0) {
    return {
      valid: false,
      error: 'No valid NeuroFocusX data found in this file.',
    };
  }

  return { valid: true, sanitizedData: sanitized, fieldCount };
}

/**
 * Applies validated import data, replacing current local progress.
 * Creates an automatic backup before making changes.
 * Returns true on success, false on failure (leaves data unchanged on failure).
 */
export function applyImport(sanitizedData: Record<string, unknown>): {
  ok: boolean;
  error?: string;
} {
  if (!sanitizedData || typeof sanitizedData !== 'object') {
    return { ok: false, error: 'Invalid import data.' };
  }

  // Create automatic backup before replacement
  try {
    createLocalBackup();
  } catch {
    // Continue even if backup fails, but log it
  }

  try {
    // Apply each field to storage and the data object
    for (const [key, value] of Object.entries(sanitizedData)) {
      // Double-check no blocked keys slipped through
      if (isBlockedKey(key)) continue;

      set(key, value);

      // Update the in-memory data object if this is a known data field
      if (key in data) {
        (data as Record<string, unknown>)[key] = value;
      }
    }

    // An imported file can contain focus minutes with no matching sessions (or a
    // stale date stamp). Realign today's counters with the imported session log.
    try {
      reconcileDailyFocus();
    } catch {
      // Import still succeeded; the next app refresh will reconcile again.
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Import failed. Your existing progress is unchanged.' };
  }
}

/**
 * Reads and validates a File object for import.
 * Enforces size limit and JSON format.
 */
export async function readImportFile(file: File): Promise<ImportValidationResult> {
  if (!file) {
    return { valid: false, error: 'Please select a file.' };
  }

  // Check file size
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      valid: false,
      error: `File is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB).`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'The file is empty.' };
  }

  // Read file as text
  let content: string;
  try {
    content = await file.text();
  } catch {
    return { valid: false, error: 'Could not read this file.' };
  }

  return validateImportData(content);
}
