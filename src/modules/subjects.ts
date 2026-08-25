/**
 * Subject Mastery — Tracks XP per subject (Physics, Chemistry, etc.).
 * Each subject has its own level curve independent of main XP.
 */

import { data, persist } from './data.ts';

export interface SubjectConfig {
  name: string;
  key: string;
  color: string;
}

export const SUBJECTS: SubjectConfig[] = [
  { name: 'Physics', key: 'Physics', color: 'var(--physics)' },
  { name: 'Chemistry', key: 'Chemistry', color: 'var(--chem)' },
  { name: 'Math', key: 'Math', color: 'var(--math)' },
  { name: 'Biology', key: 'Biology', color: 'var(--bio)' },
  { name: 'History', key: 'History', color: 'var(--english)' },
  { name: 'Geography', key: 'Geography', color: 'var(--it)' },
  { name: 'Political Science', key: 'Political Science', color: 'var(--other)' },
  { name: 'Economics', key: 'Economics', color: 'var(--gold)' },
  { name: 'Hindi', key: 'Hindi', color: 'var(--hindi)' },
  { name: 'English', key: 'English', color: 'var(--english)' },
  { name: 'IT', key: 'IT', color: 'var(--it)' },
  { name: 'Other', key: 'Other', color: 'var(--other)' },
];

export const SUBJECT_MAP: Record<string, string> = {
  Physics: 'physics',
  Chemistry: 'chem',
  Math: 'math',
  Biology: 'bio',
  History: 'english',
  Geography: 'it',
  'Political Science': 'other',
  Economics: 'math',
  'Hindi Course A': 'hindi',
  'Hindi Course B': 'hindi',
  Sanskrit: 'hindi',
  Urdu: 'hindi',
  Hindi: 'hindi',
  English: 'english',
  IT: 'it',
  Other: 'other',
};

export interface SubjectLevelInfo {
  level: number;
  current: number;
  need: number;
  pct: number;
}

/**
 * Calculates subject level info from subject XP.
 * @param xp - Subject XP
 * @returns Subject level info
 */
export function subjectLevel(xp: number): SubjectLevelInfo {
  const safeXP = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let level = 1;
  let need = 50;
  let remaining = safeXP;

  while (remaining >= need) {
    remaining -= need;
    level++;
    need = Math.floor(need * 1.3);
  }

  return { level, current: remaining, need, pct: (remaining / need) * 100 };
}

/**
 * Maps sub-subjects (like NCERT second languages) to their canonical subject key.
 */
export function canonicalSubjectKey(subject: string): string {
  if (!subject) return 'Other';
  if (SUBJECTS.some((s) => s.key === subject)) return subject;
  if (subject.startsWith('Hindi') || subject === 'Sanskrit' || subject === 'Urdu') {
    return 'Hindi';
  }
  return 'Other';
}

/**
 * Adds XP to a subject.
 * @param subject - Subject key
 * @param amount - XP amount
 */
export function addSubjectXP(subject: string, amount: number): void {
  if (!subject || subject === 'Other' || !Number.isFinite(amount) || amount <= 0) return;
  const canonical = canonicalSubjectKey(subject);
  if (canonical === 'Other') return;

  if (typeof data.subjects[canonical] !== 'number') data.subjects[canonical] = 0;

  data.subjects[canonical] =
    Math.max(0, Number.isFinite(data.subjects[canonical]) ? data.subjects[canonical] : 0) +
    Math.floor(amount);
  persist('subjects');
}

export interface SubjectWithInfo extends SubjectConfig, SubjectLevelInfo {
  xp: number;
  cls: string;
}

/**
 * Gets all subjects with their level info.
 * Aggregates any legacy second-language keys into Hindi.
 * @returns Subjects with level info
 */
export function getSubjectsWithInfo(): SubjectWithInfo[] {
  return SUBJECTS.map((s) => {
    let xp = Number(data.subjects[s.key]) || 0;
    if (s.key === 'Hindi') {
      const extra =
        (Number(data.subjects['Hindi Course A']) || 0) +
        (Number(data.subjects['Hindi Course B']) || 0) +
        (Number(data.subjects['Sanskrit']) || 0) +
        (Number(data.subjects['Urdu']) || 0);
      xp += extra;
    }
    const info = subjectLevel(xp);
    return { ...s, xp, ...info, cls: SUBJECT_MAP[s.key] || s.key.toLowerCase() };
  });
}
