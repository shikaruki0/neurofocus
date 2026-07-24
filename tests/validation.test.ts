import { describe, it, expect } from 'vitest';
import {
  validateBacklog,
  validateHabit,
  validateBattleTask,
  validateProfileName,
  validateMission,
  validateBuddyName,
} from '../src/utils/validation.ts';

describe('Validation', () => {
  describe('validateBacklog', () => {
    it('validates correct input', () => {
      const result = validateBacklog({ name: 'Rotational Motion', count: 10 });
      expect(result.valid).toBe(true);
      expect(result.data!.name).toBe('Rotational Motion');
      expect(result.data!.count).toBe(10);
    });

    it('rejects empty name', () => {
      const result = validateBacklog({ name: '', count: 5 });
      expect(result.valid).toBe(false);
    });

    it('rejects zero count', () => {
      const result = validateBacklog({ name: 'Topic', count: 0 });
      expect(result.valid).toBe(false);
    });

    it('rejects negative count', () => {
      const result = validateBacklog({ name: 'Topic', count: -1 });
      expect(result.valid).toBe(false);
    });

    it('rejects count too high', () => {
      const result = validateBacklog({ name: 'Topic', count: 100000 });
      expect(result.valid).toBe(false);
    });

    it('rejects name too long', () => {
      const result = validateBacklog({ name: 'A'.repeat(101), count: 5 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateHabit', () => {
    it('validates correct input', () => {
      const result = validateHabit({ name: '10 Pushups', anchor: 'After brushing' });
      expect(result.valid).toBe(true);
    });

    it('rejects empty name', () => {
      const result = validateHabit({ name: '', anchor: 'test' });
      expect(result.valid).toBe(false);
    });

    it('provides default anchor', () => {
      const result = validateHabit({ name: 'Meditate', anchor: '' });
      expect(result.valid).toBe(true);
      expect(result.data!.anchor).toBe('waking up');
    });
  });

  describe('validateBattleTask', () => {
    it('validates correct input', () => {
      const result = validateBattleTask({
        task: 'Study chapter 5',
        priority: 'A',
        time: 'morning',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty task', () => {
      const result = validateBattleTask({ task: '', priority: 'A', time: 'morning' });
      expect(result.valid).toBe(false);
    });

    it('defaults invalid priority to B', () => {
      const result = validateBattleTask({ task: 'Task', priority: 'Z', time: 'morning' });
      expect(result.valid).toBe(true);
      expect(result.data!.priority).toBe('B');
    });

    it('defaults invalid time to morning', () => {
      const result = validateBattleTask({ task: 'Task', priority: 'A', time: 'night' });
      expect(result.valid).toBe(true);
      expect(result.data!.time).toBe('morning');
    });
  });

  describe('validateProfileName', () => {
    it('validates correct name', () => {
      const result = validateProfileName('Warrior');
      expect(result.valid).toBe(true);
      expect(result.data!).toBe('Warrior');
    });

    it('rejects empty name', () => {
      expect(validateProfileName('').valid).toBe(false);
    });

    it('rejects single character', () => {
      expect(validateProfileName('A').valid).toBe(false);
    });

    it('rejects name too long', () => {
      expect(validateProfileName('A'.repeat(31)).valid).toBe(false);
    });

    it('trims whitespace', () => {
      const result = validateProfileName('  Warrior  ');
      expect(result.data!).toBe('Warrior');
    });
  });

  describe('validateMission', () => {
    it('validates correct mission', () => {
      const result = validateMission('I will master physics');
      expect(result.valid).toBe(true);
    });

    it('rejects empty mission', () => {
      expect(validateMission('').valid).toBe(false);
    });

    it('rejects mission too long', () => {
      expect(validateMission('A'.repeat(301)).valid).toBe(false);
    });
  });

  describe('validateBuddyName', () => {
    it('validates correct name', () => {
      const result = validateBuddyName('John');
      expect(result.valid).toBe(true);
    });

    it('rejects empty name', () => {
      expect(validateBuddyName('').valid).toBe(false);
    });
  });
});
