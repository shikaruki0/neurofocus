/**
 * Backlog Blaster — Track remaining lectures by subject/chapter.
 *
 * Backwards compatible with the original simple topic backlog, now extended for
 * India Class 10 NCERT chapter metadata.
 */

import { data, persist } from './data.ts';
import { addXP } from './xp.ts';
import { addSubjectXP } from './subjects.ts';
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
    persist('backlogs');
    addXP(10, 'Backlog Updated');
    return { success: true };
  }

  const id = Date.now();
  data.backlogs.push({
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
  backlog.updatedAt = Date.now();
  data.backlogsToday = (data.backlogsToday || 0) + 1;

  persist('backlogs');
  persist('backlogsToday');
  addSubjectXP(backlog.subject, 25);
  addXP(25, 'Backlog Crushed');
}

/**
 * Decrements a backlog's completed count by 1.
 * Use this to undo accidental marks.
 * @param id - Backlog ID
 */
export function decrementBacklog(id: number): void {
  const backlog = data.backlogs.find((b) => b.id === id);
  if (!backlog) return;
  if ((backlog.done || 0) <= 0) return;

  backlog.done = (backlog.done || 0) - 1;
  backlog.updatedAt = Date.now();
  // Keep today's counter honest so the daily quest can't be gamed by
  // incrementing then undoing (the daily counter only moves forward otherwise).
  if ((data.backlogsToday || 0) > 0) {
    data.backlogsToday -= 1;
    persist('backlogsToday');
  }
  persist('backlogs');
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
  return data.backlogs.reduce((sum, b) => sum + ((b.total || 0) - (b.done || 0)), 0);
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
    b.updatedAt = Date.now();
  });
  persist('backlogs');
}
