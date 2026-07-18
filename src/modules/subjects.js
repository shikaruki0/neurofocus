/**
 * Subject Mastery — Tracks XP per subject (Physics, Chemistry, etc.).
 * Each subject has its own level curve independent of main XP.
 */

import { data, persist } from './data.js';

export const SUBJECTS = [
  { name: 'Physics', key: 'Physics', color: 'var(--physics)' },
  { name: 'Chemistry', key: 'Chemistry', color: 'var(--chem)' },
  { name: 'Math', key: 'Math', color: 'var(--math)' },
  { name: 'Biology', key: 'Biology', color: 'var(--bio)' },
  { name: 'Hindi', key: 'Hindi', color: 'var(--hindi)' },
  { name: 'English', key: 'English', color: 'var(--english)' },
  { name: 'IT', key: 'IT', color: 'var(--it)' },
  { name: 'Other', key: 'Other', color: 'var(--other)' },
];

export const SUBJECT_MAP = {
  Physics: 'physics',
  Chemistry: 'chem',
  Math: 'math',
  Biology: 'bio',
  Hindi: 'hindi',
  English: 'english',
  IT: 'it',
  Other: 'other',
};

/**
 * Calculates subject level info from subject XP.
 * @param {number} xp
 * @returns {{level: number, current: number, need: number, pct: number}}
 */
export function subjectLevel(xp) {
  let level = 1;
  let need = 50;
  let remaining = xp;

  while (remaining >= need) {
    remaining -= need;
    level++;
    need = Math.floor(need * 1.3);
  }

  return { level, current: remaining, need, pct: (remaining / need) * 100 };
}

/**
 * Adds XP to a subject.
 * @param {string} subject - Subject key
 * @param {number} amount - XP amount
 */
export function addSubjectXP(subject, amount) {
  if (!subject || subject === 'Other') return;
  if (!data.subjects[subject]) data.subjects[subject] = 0;

  data.subjects[subject] += amount;
  persist('subjects');
}

/**
 * Gets all subjects with their level info.
 * @returns {object[]}
 */
export function getSubjectsWithInfo() {
  return SUBJECTS.map((s) => {
    const xp = data.subjects[s.key] || 0;
    const info = subjectLevel(xp);
    return { ...s, xp, ...info, cls: SUBJECT_MAP[s.key] || s.key.toLowerCase() };
  });
}
