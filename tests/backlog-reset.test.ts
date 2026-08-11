/**
 * Backlog Reset Functions Tests
 * Tests for the resetBacklogProgress and resetAllBacklogProgress functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetBacklogProgress, resetAllBacklogProgress } from '../src/modules/backlogs.ts';
import { data } from '../src/modules/data.ts';
import { clearAll } from '../src/modules/storage.ts';

describe('Backlog Reset Functions', () => {
  beforeEach(() => {
    // Clear and set up fresh test data
    clearAll();
    // Reset backlogs to test state
    data.backlogs = [
      { id: 1, name: 'Lecture 1', total: 5, done: 3, subject: 'Physics', updatedAt: Date.now() },
      { id: 2, name: 'Lecture 2', total: 3, done: 2, subject: 'Math', updatedAt: Date.now() },
      { id: 3, name: 'Lecture 3', total: 4, done: 0, subject: 'Chemistry', updatedAt: Date.now() },
    ];
  });

  describe('resetBacklogProgress', () => {
    it('resets done count to 0 for a specific backlog', () => {
      expect(data.backlogs[0].done).toBe(3);
      resetBacklogProgress(1);
      expect(data.backlogs[0].done).toBe(0);
    });

    it('does not affect other backlogs', () => {
      resetBacklogProgress(1);
      expect(data.backlogs[0].done).toBe(0);
      expect(data.backlogs[1].done).toBe(2); // unchanged
      expect(data.backlogs[2].done).toBe(0); // unchanged
    });

    it('handles non-existent backlog ID gracefully', () => {
      const initialDone = data.backlogs[0].done;
      resetBacklogProgress(999); // non-existent ID
      expect(data.backlogs[0].done).toBe(initialDone);
    });

    it('updates the updatedAt timestamp', () => {
      const originalTime = data.backlogs[0].updatedAt;
      resetBacklogProgress(1);
      expect(data.backlogs[0].updatedAt).toBeGreaterThanOrEqual(originalTime);
    });
  });

  describe('resetAllBacklogProgress', () => {
    it('resets done count to 0 for all backlogs', () => {
      resetAllBacklogProgress();
      expect(data.backlogs[0].done).toBe(0);
      expect(data.backlogs[1].done).toBe(0);
      expect(data.backlogs[2].done).toBe(0);
    });

    it('preserves the total count', () => {
      const totals = data.backlogs.map(b => b.total);
      resetAllBacklogProgress();
      expect(data.backlogs[0].total).toBe(totals[0]);
      expect(data.backlogs[1].total).toBe(totals[1]);
      expect(data.backlogs[2].total).toBe(totals[2]);
    });

    it('updates all updatedAt timestamps', () => {
      const originalTimes = data.backlogs.map(b => b.updatedAt);
      resetAllBacklogProgress();
      data.backlogs.forEach((backlog, i) => {
        expect(backlog.updatedAt).toBeGreaterThanOrEqual(originalTimes[i]);
      });
    });
  });
});
