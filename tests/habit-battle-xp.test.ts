import { describe, it, expect, beforeEach } from 'vitest';
import { data } from '../src/modules/data.ts';
import { addHabit, toggleHabit, deleteHabit } from '../src/modules/habits.ts';
import { addTask, toggleTask } from '../src/modules/battle.ts';
import { addBacklog, incrementBacklog, decrementBacklog } from '../src/modules/backlogs.ts';

describe('XP cannot be farmed by toggling completions', () => {
  beforeEach(() => {
    data.xp = 0;
    data.habits = [];
    data.battle = [];
    data.backlogs = [];
    data.subjects = { Physics: 0 };
    data.habitsToday = 0;
    data.backlogsToday = 0;
    data.dailyChecks = {};
    data.morningRitual = { date: '', completed: false, steps: [false, false, false, false, false] };
    data.flowState = { date: '', sessions: 0 };
  });

  describe('habits', () => {
    it('awards XP once when completed and revokes it exactly when un-completed', () => {
      const habit = addHabit({ name: 'Meditate', anchor: 'after waking' });
      expect(habit.success).toBe(true);
      const id = data.habits[0].id;

      toggleHabit(id); // complete → +15
      expect(data.xp).toBe(15);

      toggleHabit(id); // un-complete → -15
      expect(data.xp).toBe(0);

      toggleHabit(id); // re-complete → +15 again (legitimate redo)
      expect(data.xp).toBe(15);
    });

    it('does not accumulate XP when toggled on and off repeatedly', () => {
      const existing = addHabit({ name: 'Read', anchor: 'before bed' });
      expect(existing.success).toBe(true);

      const habitId = data.habits[0].id;
      for (let i = 0; i < 6; i++) toggleHabit(habitId);
      // Six toggles (even) leaves the habit "off": net XP = 0, not +90.
      expect(data.xp).toBe(0);
    });

    it('cleans up habitsToday and revokes xpAwarded when a completed habit is deleted', () => {
      addHabit({ name: 'Walk', anchor: 'morning' });
      const id = data.habits[0].id;
      toggleHabit(id);
      expect(data.xp).toBe(15);
      expect(data.habitsToday).toBe(1);

      deleteHabit(id);
      expect(data.xp).toBe(0);
      expect(data.habitsToday).toBe(0);
    });
  });

  describe('backlog lectures', () => {
    it('revokes XP and subject XP when decrementing an accidentally completed lecture', () => {
      addBacklog({ name: 'Optics Lecture 1', count: 3, subject: 'Physics' });
      const initialXP = data.xp; // 10 from adding backlog
      const id = data.backlogs[0].id;

      incrementBacklog(id); // +25 XP, +25 Physics XP
      expect(data.xp).toBe(initialXP + 25);
      expect(data.subjects.Physics).toBe(25);
      expect(data.backlogsToday).toBe(1);

      decrementBacklog(id); // undo → revokes 25 XP and 25 Physics XP
      expect(data.xp).toBe(initialXP);
      expect(data.subjects.Physics).toBe(0);
      expect(data.backlogsToday).toBe(0);
    });

    it('does not accumulate XP when incremented and decremented repeatedly', () => {
      addBacklog({ name: 'Mechanics', count: 5, subject: 'Physics' });
      const baseXP = data.xp;
      const id = data.backlogs[0].id;

      for (let i = 0; i < 5; i++) {
        incrementBacklog(id);
        decrementBacklog(id);
      }

      expect(data.xp).toBe(baseXP);
      expect(data.subjects.Physics).toBe(0);
      expect(data.backlogsToday).toBe(0);
    });
  });

  describe('battle tasks', () => {
    it('awards XP once when completed and revokes it exactly when un-completed', () => {
      const task = addTask({ task: 'Revise physics', priority: 'A', time: 'morning' });
      expect(task.success).toBe(true);
      const id = data.battle[0].id;

      toggleTask(id); // complete → +10
      expect(data.xp).toBe(10);

      toggleTask(id); // un-complete → -10
      expect(data.xp).toBe(0);

      toggleTask(id); // re-complete → +10 again
      expect(data.xp).toBe(10);
    });

    it('does not accumulate XP when toggled on and off repeatedly', () => {
      addTask({ task: 'Solve 10 sums', priority: 'B', time: 'evening' });
      const id = data.battle[0].id;

      for (let i = 0; i < 10; i++) toggleTask(id);
      // Even number of toggles leaves the task "off": net XP = 0, not +50.
      expect(data.xp).toBe(0);
    });
  });
});
