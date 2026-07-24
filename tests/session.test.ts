import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '../src/modules/data.ts';
import { clearAll } from '../src/modules/storage.ts';
import { endLocalSession, isSessionStarted, startLocalSession } from '../src/modules/session.ts';

beforeEach(() => {
  clearAll();
  data.profileName = 'Warrior';
  data.mission = 'Default mission';
  data.hasOnboarded = false;
  data.lastLoginAt = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-24T09:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Simple local session', () => {
  it('starts a frictionless local profile session', () => {
    const result = startLocalSession({
      name: '  Aarav  ',
      mission: 'Master deep work',
    });

    expect(result).toEqual({ success: true });
    expect(isSessionStarted()).toBe(true);
    expect(data.profileName).toBe('Aarav');
    expect(data.mission).toBe('Master deep work');
    expect(data.lastLoginAt).toBe(new Date('2026-07-24T09:00:00').getTime());
  });

  it('rejects invalid login details without changing the session', () => {
    expect(startLocalSession({ name: 'A' })).toMatchObject({ success: false });
    expect(isSessionStarted()).toBe(false);
    expect(data.profileName).toBe('Warrior');
  });

  it('keeps the existing mission when mission is left blank', () => {
    expect(startLocalSession({ name: 'Student', mission: '' })).toEqual({ success: true });
    expect(data.mission).toBe('Default mission');
  });

  it('ends the local session without deleting progress', () => {
    startLocalSession({ name: 'Student' });
    data.xp = 500;

    endLocalSession();

    expect(isSessionStarted()).toBe(false);
    expect(data.profileName).toBe('Student');
    expect(data.xp).toBe(500);
  });
});
