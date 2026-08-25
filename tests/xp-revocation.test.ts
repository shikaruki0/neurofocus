/**
 * REGRESSION — XP revocation must mirror XP awards exactly.
 *
 * Guards three farming vectors closed in this pass:
 *  A) Backlog increment/decrement: increment credits 25 × the current boost
 *     (2x morning ritual / 1.5x flow), but decrement used to revoke a flat 25 —
 *     every boosted +1/-1 cycle kept the remainder (unlimited free XP).
 *  B) Battle task delete: completing a task then deleting it kept the
 *     (boosted) completion XP, so create → complete → delete → recreate
 *     minted unlimited XP (deleteHabit already revoked; deleteTask did not).
 *  C) Backlog create/update/delete: the +10 creation/update bonus and today's
 *     lecture increments survived deletion, so create → increment → delete →
 *     recreate minted unlimited XP. Same-day credits are now revoked exactly;
 *     honest work from previous days stays banked.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { data } from '../src/modules/data.ts';
import {
  addBacklog,
  incrementBacklog,
  decrementBacklog,
  deleteBacklog,
  resetBacklogProgress,
  getBacklogs,
} from '../src/modules/backlogs.ts';
import { addTask, toggleTask, deleteTask } from '../src/modules/battle.ts';
import { todayStr } from '../src/utils/date.ts';

function resetState(): void {
  data.xp = 0;
  data.habits = [];
  data.battle = [];
  data.backlogs = [];
  data.subjects = { Physics: 0, Hindi: 0, Other: 0 };
  data.habitsToday = 0;
  data.backlogsToday = 0;
  data.dailyChecks = {};
  data.sessions = [];
  data.morningRitual = { date: '', completed: false, steps: [false, false, false, false, false] };
  data.flowState = { date: '', sessions: 0 };
}

/** Activates the 2x morning-ritual boost for "today" at 09:00 local. */
function activateMorningBoost(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T09:00:00'));
  data.morningRitual = {
    date: todayStr(),
    completed: true,
    steps: [true, true, true, true, true],
  };
}

describe('XP revocation mirrors XP awards exactly', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetState();
  });
  afterEach(() => vi.useRealTimers());

  describe('A) backlog increment/decrement across boosts', () => {
    it('boosted increment + decrement nets exactly zero (no remainder farming)', () => {
      activateMorningBoost(); // 2x — increment credits 50, not 25
      addBacklog({ name: 'Optics', count: 5, subject: 'Physics' });
      const baseXP = data.xp; // 20 (2x creation bonus)
      const id = data.backlogs[0].id;

      incrementBacklog(id);
      expect(data.xp).toBe(baseXP + 50); // 25 × 2 boost
      expect(data.subjects.Physics).toBe(25);

      decrementBacklog(id);
      expect(data.xp).toBe(baseXP); // exact revoke — not baseXP + 25
      expect(data.subjects.Physics).toBe(0);
      expect(data.backlogsToday).toBe(0);
    });

    it('cycles of boosted +1/-1 hundred times mint nothing', () => {
      activateMorningBoost();
      addBacklog({ name: 'Mechanics', count: 999, subject: 'Physics' });
      const baseXP = data.xp;
      const id = data.backlogs[0].id;

      for (let i = 0; i < 100; i++) {
        incrementBacklog(id);
        decrementBacklog(id);
      }
      expect(data.xp).toBe(baseXP);
      expect(data.subjects.Physics).toBe(0);
      expect(data.backlogsToday).toBe(0);
      expect(data.backlogs[0].done).toBe(0);
    });

    it('revokes exactly what was credited even when the boost expires between inc and dec', () => {
      activateMorningBoost(); // morning: 2x
      addBacklog({ name: 'Waves', count: 3, subject: 'Physics' });
      const baseXP = data.xp;
      const id = data.backlogs[0].id;

      incrementBacklog(id); // +50 at 2x
      vi.setSystemTime(new Date('2026-08-20T14:00:00')); // afternoon: boost gone, 1x
      decrementBacklog(id); // must revoke 50 (the actual credit), not 25

      expect(data.xp).toBe(baseXP);
      expect(data.subjects.Physics).toBe(0);
    });

    it('multiple increments unwind LIFO with their own exact credits', () => {
      activateMorningBoost(); // 2x
      addBacklog({ name: 'Thermo', count: 4, subject: 'Physics' });
      const baseXP = data.xp;
      const id = data.backlogs[0].id;

      incrementBacklog(id); // +50 (2x)
      vi.setSystemTime(new Date('2026-08-20T14:00:00')); // 1x
      incrementBacklog(id); // +25 (1x)
      expect(data.xp).toBe(baseXP + 50 + 25);

      decrementBacklog(id); // pops the +25 credit
      expect(data.xp).toBe(baseXP + 50);
      decrementBacklog(id); // pops the +50 credit
      expect(data.xp).toBe(baseXP);
    });

    it('legacy rows without a ledger still revoke the flat 25 (old behavior preserved)', () => {
      addBacklog({ name: 'Legacy', count: 2, subject: 'Physics' });
      const baseXP = data.xp;
      const id = data.backlogs[0].id;
      // Simulate a row written before ledgers existed.
      incrementBacklog(id);
      delete (data.backlogs[0] as { xpLedger?: unknown }).xpLedger;

      decrementBacklog(id);
      expect(data.xp).toBe(baseXP); // 25 in, flat 25 out
      expect(data.subjects.Physics).toBe(0);
    });

    it('revokes subject XP via the canonical key (NCERT language courses → Hindi)', () => {
      addBacklog({ name: 'Hindi Ch 1', count: 2, subject: 'Hindi Course A' });
      const id = data.backlogs[0].id;

      incrementBacklog(id); // credits canonical Hindi +25
      expect(data.subjects.Hindi).toBe(25);
      decrementBacklog(id); // must revoke from Hindi, not the phantom 'Hindi Course A' key
      expect(data.subjects.Hindi).toBe(0);
    });

    it('resetting backlog progress clears the undo ledger', () => {
      addBacklog({ name: 'Chem', count: 3, subject: 'Physics' });
      const id = data.backlogs[0].id;
      incrementBacklog(id);
      resetBacklogProgress(id);

      const row = getBacklogs().find((b) => b.id === id)!;
      expect(row.done).toBe(0);
      expect(row.xpLedger).toEqual([]);
    });
  });

  describe('B) battle task create/complete/delete', () => {
    it('deleting a completed task revokes its credited XP', () => {
      addTask({ task: 'Revise physics', priority: 'A', time: 'morning' });
      const id = data.battle[0].id;

      toggleTask(id); // +10
      expect(data.xp).toBe(10);

      deleteTask(id);
      expect(data.xp).toBe(0);
      expect(data.battle).toHaveLength(0);
    });

    it('create → complete → delete → recreate cycles mint nothing', () => {
      for (let i = 0; i < 20; i++) {
        addTask({ task: `Task ${i}`, priority: 'B', time: 'afternoon' });
        const id = data.battle[data.battle.length - 1].id;
        toggleTask(id);
        deleteTask(id);
      }
      expect(data.xp).toBe(0);
    });

    it('boosted completion is revoked exactly on delete (no remainder)', () => {
      activateMorningBoost(); // 2x → completion credits 20
      addTask({ task: 'Sprint', priority: 'C', time: 'evening' });
      const id = data.battle[0].id;

      toggleTask(id);
      expect(data.xp).toBe(20);
      deleteTask(id);
      expect(data.xp).toBe(0);
    });
  });

  describe('C) backlog create/update/delete same-day rule', () => {
    it('deleting a row created today revokes the creation bonus', () => {
      addBacklog({ name: 'Day-old', count: 1, subject: 'Physics' });
      expect(data.xp).toBe(10);
      deleteBacklog(data.backlogs[0].id);
      expect(data.xp).toBe(0);
    });

    it('create → increment → delete → recreate cycles mint nothing', () => {
      for (let i = 0; i < 10; i++) {
        addBacklog({ name: `Loop ${i}`, count: 1, subject: 'Physics' });
        const id = data.backlogs[data.backlogs.length - 1].id;
        incrementBacklog(id);
        deleteBacklog(id);
      }
      expect(data.xp).toBe(0);
      expect(data.subjects.Physics).toBe(0);
    });

    it('same-chapter re-adds accumulate a revocable bonus, removed once on delete', () => {
      const input = {
        name: 'Ch 5',
        count: 1,
        subject: 'Physics',
        chapterId: 'phy-ch5',
        bookId: 'phy-book',
      };
      addBacklog(input);
      addBacklog(input); // merge path awards +10 again
      addBacklog(input);
      expect(data.xp).toBe(30);
      expect(data.backlogs).toHaveLength(1);

      deleteBacklog(data.backlogs[0].id);
      expect(data.xp).toBe(0);
    });

    it('deleting an OLD row keeps honestly banked history (no punishment)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T10:00:00')); // yesterday
      addBacklog({ name: 'Old chapter', count: 2, subject: 'Physics' });
      const id = data.backlogs[0].id;
      incrementBacklog(id); // real work yesterday
      const banked = data.xp; // 35 (creation 10 + increment 25)

      vi.setSystemTime(new Date('2026-08-20T10:00:00')); // today
      deleteBacklog(id);

      expect(data.xp).toBe(banked); // nothing revoked — credits were earned yesterday
      expect(data.subjects.Physics).toBe(25);
    });

    it('creation after midnight then delete next day keeps only prior-day credits', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T23:00:00'));
      addBacklog({ name: 'Boundary', count: 1, subject: 'Physics' }); // +10 yesterday
      const id = data.backlogs[0].id;

      vi.setSystemTime(new Date('2026-08-20T00:30:00')); // next day
      deleteBacklog(id);
      expect(data.xp).toBe(10); // yesterday's bonus stays banked
    });
  });
});
