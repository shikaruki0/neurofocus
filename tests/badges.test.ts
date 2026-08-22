import { describe, it, expect, beforeEach } from 'vitest';
import { checkBadges, TOTAL_BADGES, SPECIAL_BADGES } from '../src/modules/badges.ts';
import { data } from '../src/modules/data.ts';

describe('Badge System', () => {
  beforeEach(() => {
    // Reset data values before each test
    data.xp = 0;
    data.badgesUnlocked = [];
    data.totalFocusMinutes = 0;
    data.consecutiveStreak = 0;
    data.backlogs = [];
    data.habits = [];
    data.sessions = [];
  });

  it('has correct TOTAL_BADGES constant', () => {
    expect(TOTAL_BADGES).toBe(35);
  });

  it('unlocks Initiate rank badge at level 1 (XP = 0)', () => {
    const unlocked = checkBadges();
    // Reaching level 1 should unlock level 0 (Initiate) rank badge
    expect(data.badgesUnlocked).toContain('rank_0');
    expect(unlocked.some((b) => b.id === 'rank_0')).toBe(true);
  });

  it('unlocks all lower rank badges when jumping levels', () => {
    // If we gain enough XP to reach level 12 (e.g. XP = 5000)
    data.xp = 5000; // Level is around 11+
    checkBadges();

    // Should contain rank_0 (Initiate), rank_5 (Apprentice), rank_10 (Disciple)
    expect(data.badgesUnlocked).toContain('rank_0');
    expect(data.badgesUnlocked).toContain('rank_5');
    expect(data.badgesUnlocked).toContain('rank_10');
  });

  it('unlocks special achievement badges under correct conditions', () => {
    data.sessions = [{ date: 'Wed Jul 22 2026', time: 1, duration: 25 }]; // Completes 1 focus session
    let unlocked = checkBadges();
    expect(data.badgesUnlocked).toContain('first_focus');
    expect(unlocked.some((b) => b.id === 'first_focus')).toBe(true);

    data.consecutiveStreak = 3; // Completes 3 day streak
    unlocked = checkBadges();
    expect(data.badgesUnlocked).toContain('detox_3');
  });

  it('counts focus sessions (not minutes) for the focus badges', () => {
    // 3 long sessions = 270 minutes. The old minute-based check (>= 250 min)
    // wrongly unlocked the "10 focus sessions" badge after just 3 sessions.
    data.sessions = Array.from({ length: 3 }, (_, i) => ({
      date: 'Wed Jul 22 2026',
      time: i,
      duration: 90,
    }));
    let unlocked = checkBadges();
    expect(unlocked.some((b) => b.id === 'focus_10')).toBe(false);

    // 10 sessions (even short ones) is what the description promises.
    data.sessions = Array.from({ length: 10 }, (_, i) => ({
      date: 'Wed Jul 22 2026',
      time: 100 + i,
      duration: 25,
    }));
    unlocked = checkBadges();
    expect(unlocked.some((b) => b.id === 'focus_10')).toBe(true);
  });
});
