/**
 * Backlog Blaster — Track remaining lectures by subject/chapter.
 *
 * Backwards compatible with the original simple topic backlog, now extended for
 * India Class 10 NCERT chapter metadata.
 */

import { data, persist } from './data.ts';
import { addXP } from './xp.ts';
import { addSubjectXP, canonicalSubjectKey } from './subjects.ts';
import { todayStr } from '../utils/date.ts';
import { validateBacklog } from '../utils/validation.ts';

export type BacklogSource = 'manual' | 'ncert-class10';
export type BacklogCreatedFrom = 'manual' | 'initial-setup' | 'daily-check';

export interface BacklogInput {
  name: string;
  count: number;
  subject: string;
  subjectLabel?: string;
  chapterId?: string;
  chapterName?: string;
  bookId?: string;
  bookName?: string;
  unitName?: string;
  source?: BacklogSource;
  createdFrom?: BacklogCreatedFrom;
}

export interface BacklogResult {
  success: boolean;
  error?: string;
  id?: number;
  updatedExisting?: boolean;
}

export interface Backlog {
  id: number;
  name: string;
  total: number;
  done: number;
  subject: string;
  subjectLabel?: string;
  chapterId?: string;
  chapterName?: string;
  bookId?: string;
  bookName?: string;
  unitName?: string;
  source?: BacklogSource;
  createdFrom?: BacklogCreatedFrom;
  updatedAt?: number;
  /** Exact per-increment XP credits (LIFO, dated) so undo/delete revokes precisely. */
  xpLedger?: { xp: number; sx: number; date: string }[];
  /** Creation/update bonus still revocable today + the day it was credited. */
  createdXP?: number;
  createdXPDate?: string;
}

export interface BacklogGroup {
  subject: string;
  subjectLabel: string;
  total: number;
  done: number;
  remaining: number;
  books: {
    bookId: string;
    bookName: string;
    total: number;
    done: number;
    remaining: number;
    items: Backlog[];
  }[];
}

function remaining(backlog: Backlog): number {
  return Math.max(0, (backlog.total || 0) - (backlog.done || 0));
}

/**
 * The subject XP one lecture increment credits. Mirrors addSubjectXP's own
 * gate (no award for unmapped/'Other' subjects) so ledgers stay truthful.
 */
function subjectXpForIncrement(subject: string): number {
  if (!subject) return 0;
  return canonicalSubjectKey(subject) === 'Other' ? 0 : 25;
}

/**
 * Records a creation/update bonus as revocable today. A bonus credited on a
 * previous day stays banked — deleting an old row must not punish real history.
 */
function trackCreationXP(backlog: Backlog, credited: number): void {
  const today = todayStr();
  backlog.createdXP =
    backlog.createdXPDate === today
      ? (Number.isFinite(backlog.createdXP) ? backlog.createdXP || 0 : 0) + credited
      : credited;
  backlog.createdXPDate = today;
}

/**
 * Revokes an exact XP/subject-XP credit. Shared by decrement (LIFO pop) and
 * delete (same-day sweep). Clamped so corrupted data can never drive XP negative.
 */
function revokeCredit(xp: number, sx: number, subject: string): void {
  if (Number.isFinite(xp) && xp > 0) {
    data.xp = Math.max(0, (data.xp || 0) - xp);
    persist('xp');
  }
  if (Number.isFinite(sx) && sx > 0 && subject) {
    const key = canonicalSubjectKey(subject);
    const current = data.subjects[key];
    if (typeof current === 'number') {
      data.subjects[key] = Math.max(0, current - sx);
      persist('subjects');
    }
  }
}

function isSameChapterBacklog(a: Backlog, input: BacklogInput): boolean {
  if (!input.chapterId) return false;
  return (
    a.chapterId === input.chapterId &&
    a.subject === input.subject &&
    (a.bookId || '') === (input.bookId || '')
  );
}

/**
 * Finds an existing backlog row for an exact subject/book/chapter.
 * Used to link missions to existing rows instead of creating duplicates.
 */
export function findBacklogForChapter(input: {
  subject: string;
  chapterId: string;
  bookId?: string;
}): Backlog | undefined {
  return data.backlogs.find(
    (b) =>
      b.chapterId === input.chapterId &&
      b.subject === input.subject &&
      (b.bookId || '') === (input.bookId || ''),
  ) as Backlog | undefined;
}

/**
 * Adds a new backlog entry. For NCERT chapter entries, repeated additions to the
 * same subject/book/chapter update the existing remaining count instead of
 * creating duplicate rows.
 * @param input - Backlog input
 * @returns Result
 */
export function addBacklog(input: BacklogInput): BacklogResult {
  const validation = validateBacklog({ name: input.name, count: input.count });
  if (!validation.valid || !validation.data) return { success: false, error: validation.error };

  const normalizedSubject = input.subject || 'Physics';
  const existing = data.backlogs.find((b) => isSameChapterBacklog(b as Backlog, input)) as
    Backlog | undefined;

  if (existing) {
    existing.total = (existing.total || 0) + validation.data.count;
    existing.subjectLabel = input.subjectLabel || existing.subjectLabel;
    existing.chapterName = input.chapterName || existing.chapterName;
    existing.bookName = input.bookName || existing.bookName;
    existing.unitName = input.unitName || existing.unitName;
    existing.source = input.source || existing.source;
    existing.createdFrom = input.createdFrom || existing.createdFrom;
    existing.updatedAt = Date.now();
    trackCreationXP(existing as Backlog, addXP(10, 'Backlog Updated'));
    persist('backlogs');
    return { success: true };
  }

  const id = Date.now();
  const row: Backlog = {
    id,
    name: validation.data.name,
    total: validation.data.count,
    done: 0,
    subject: normalizedSubject,
    subjectLabel: input.subjectLabel || normalizedSubject,
    chapterId: input.chapterId,
    chapterName: input.chapterName,
    bookId: input.bookId,
    bookName: input.bookName,
    unitName: input.unitName,
    source: input.source || 'manual',
    createdFrom: input.createdFrom || 'manual',
    updatedAt: Date.now(),
    xpLedger: [],
  };
  trackCreationXP(row, addXP(10, 'Backlog Added'));
  data.backlogs.push(row);

  persist('backlogs');
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

  const row = backlog as Backlog;
  row.done = (row.done || 0) + 1;
  row.updatedAt = Date.now();
  data.backlogsToday = (data.backlogsToday || 0) + 1;

  // Ledger the exact credits BEFORE awarding so undo always knows the truth:
  // addXP applies the 2x/1.5x boost, so a flat "-25" revoke used to leave a
  // positive remainder every boosted increment-decrement cycle (free XP).
  const credited = addXP(25, 'Backlog Crushed');
  const sx = subjectXpForIncrement(row.subject);
  addSubjectXP(row.subject, 25);
  if (!Array.isArray(row.xpLedger)) row.xpLedger = [];
  row.xpLedger.push({ xp: credited, sx, date: todayStr() });

  persist('backlogs');
  persist('backlogsToday');
}

/**
 * Decrements a backlog's completed count by 1.
 * Use this to undo accidental marks.
 * Revokes exactly what the matching increment credited (via the dated LIFO
 * ledger), so boosted increments can't be farmed by cycling +1/-1. Rows
 * created before the ledger existed fall back to the old flat 25/25 revoke.
 * @param id - Backlog ID
 */
export function decrementBacklog(id: number): void {
  const backlog = data.backlogs.find((b) => b.id === id);
  if (!backlog) return;
  if ((backlog.done || 0) <= 0) return;

  const row = backlog as Backlog;
  row.done = (row.done || 0) - 1;
  row.updatedAt = Date.now();

  const ledger = Array.isArray(row.xpLedger) ? row.xpLedger : [];
  row.xpLedger = ledger;
  const entry = ledger.length > 0 ? ledger.pop()! : null;

  if (entry) {
    // Keep today's counter honest so the daily quest can't be gamed by
    // incrementing then undoing. Only today's increments move today's counter.
    if (entry.date === todayStr() && (data.backlogsToday || 0) > 0) {
      data.backlogsToday -= 1;
      persist('backlogsToday');
    }
    revokeCredit(entry.xp, entry.sx, row.subject);
  } else {
    // Legacy row (no ledger): exact credit is unknown — keep the previous
    // flat behavior so old data still can't farm net-positive cycles here.
    if ((data.backlogsToday || 0) > 0) {
      data.backlogsToday -= 1;
      persist('backlogsToday');
    }
    revokeCredit(25, subjectXpForIncrement(row.subject), row.subject);
  }

  persist('backlogs');
}

/**
 * Deletes a backlog entry.
 *
 * Anti-farm rule: credits made TODAY (creation bonus + today's lecture
 * increments) are revoked exactly, so create → farm → delete → recreate
 * loops net zero. Credits from previous days stay banked — deleting an old,
 * honestly worked row must never punish real history (mirrors the
 * habit/task delete rules).
 * @param id - Backlog ID
 */
export function deleteBacklog(id: number): void {
  const today = todayStr();
  const backlog = data.backlogs.find((b) => b.id === id);

  if (backlog) {
    const row = backlog as Backlog;
    const ledger = Array.isArray(row.xpLedger) ? row.xpLedger : [];
    for (const entry of ledger) {
      if (entry && entry.date === today) {
        revokeCredit(entry.xp, entry.sx, row.subject);
      }
    }
    if (row.createdXPDate === today && Number.isFinite(row.createdXP) && (row.createdXP || 0) > 0) {
      revokeCredit(row.createdXP || 0, 0, row.subject);
    }
  }

  data.backlogs = data.backlogs.filter((b) => b.id !== id);
  persist('backlogs');
}

/**
 * Gets all backlogs.
 * @returns Backlogs
 */
export function getBacklogs(): Backlog[] {
  return data.backlogs as Backlog[];
}

/**
 * Gets grouped backlogs for the NCERT chapter dashboard.
 */
export function getBacklogsGroupedBySubject(): BacklogGroup[] {
  const groups = new Map<string, BacklogGroup>();

  getBacklogs().forEach((backlog) => {
    const subject = backlog.subject || 'Other';
    const subjectLabel = backlog.subjectLabel || subject;
    const bookId = backlog.bookId || `manual-${subject}`;
    const bookName = backlog.bookName || 'Manual backlog';
    const left = remaining(backlog);

    if (!groups.has(subject)) {
      groups.set(subject, {
        subject,
        subjectLabel,
        total: 0,
        done: 0,
        remaining: 0,
        books: [],
      });
    }
    const group = groups.get(subject)!;
    group.total += backlog.total || 0;
    group.done += backlog.done || 0;
    group.remaining += left;

    let book = group.books.find((item) => item.bookId === bookId);
    if (!book) {
      book = { bookId, bookName, total: 0, done: 0, remaining: 0, items: [] };
      group.books.push(book);
    }
    book.total += backlog.total || 0;
    book.done += backlog.done || 0;
    book.remaining += left;
    book.items.push(backlog);
  });

  return [...groups.values()].sort(
    (a, b) => b.remaining - a.remaining || a.subjectLabel.localeCompare(b.subjectLabel),
  );
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
  return data.backlogs.reduce((sum, b) => sum + Math.max(0, (b.total || 0) - (b.done || 0)), 0);
}

/** Gets how many backlog rows still have remaining lectures. */
export function getPendingChapterCount(): number {
  return data.backlogs.filter((b) => remaining(b as Backlog) > 0).length;
}

/**
 * Resets a specific backlog's done count to 0.
 * Useful for fixing accidental clicks or data corruption.
 * @param id - Backlog ID
 */
export function resetBacklogProgress(id: number): void {
  const backlog = data.backlogs.find((b) => b.id === id);
  if (!backlog) return;
  backlog.done = 0;
  // done=0 makes per-increment credits unreachable; clear the undo ledger so
  // it can't resurface as phantom credit after a fresh increment cycle.
  (backlog as Backlog).xpLedger = [];
  backlog.updatedAt = Date.now();
  persist('backlogs');
}

/**
 * Resets ALL backlog progress (done count) to 0.
 * Use with caution - this affects all lectures.
 */
export function resetAllBacklogProgress(): void {
  data.backlogs.forEach((b) => {
    b.done = 0;
    (b as Backlog).xpLedger = [];
    b.updatedAt = Date.now();
  });
  persist('backlogs');
}
