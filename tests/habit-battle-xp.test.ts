import { describe, it, expect, beforeEach } from 'vitest';
import { data } from '../src/modules/data.ts';
import { addHabit, toggleHabit } from '../src/modules/habits.ts';
import { addTask, toggleTask } from '../src/modules/battle.ts';

describe('XP cannot be farmed by toggling completions', () => {
  beforeEach(() => {
    data.xp = 0;
    data.habits = [];
    data.battle = [];
    data.habitsToday = 0;
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
