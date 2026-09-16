import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setMode,
  startTimer,
  pauseTimer,
  stopTimer,
  getTimerState,
  onTick,
  onComplete,
} from '../src/modules/focus.ts';
import { data } from '../src/modules/data.ts';
import { get, set } from '../src/modules/storage.ts';
import { localISODate } from '../src/utils/date.ts';

function resetData() {
  data.focusMinutes = 0;
  data.totalFocusMinutes = 0;
  data.sessions = [];
  data.flowState = { date: '', sessions: 0 };
  data.dailyChecks = {};
  data.xp = 0;
  data.morningRitual = { date: '', completed: false, steps: [false, false, false, false, false] };
}

describe('Focus Timer — background & locked-phone reliability', () => {
  beforeEach(() => {
    localStorage.clear();
    resetData();
    setMode(0); // Pomodoro 25
    onTick(() => {});
    onComplete(() => {});
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopTimer();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('credits session at the REAL deadline, not at the moment the user reopens the app', () => {
    // User starts 25-min Pomodoro at 10:00, locks phone, never watches
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));
    const complete = vi.fn();
    onComplete(complete);

    startTimer();
    const stateAtStart = getTimerState();
    expect(stateAtStart.running).toBe(true);
    expect(stateAtStart.minutes).toBe(25);

    // Simulate OS suspending JS: NO ticks fire for the whole duration + extra 10 minutes.
    // We advance the system clock but do NOT let the throttled interval fire
    // by not advancing vitest timers that would trigger setInterval.
    // Instead we simulate the user reopening at 10:35 (10 min after deadline)
    // and the resume handler calling getTimerState -> syncRunningTimer.
    vi.setSystemTime(new Date('2026-07-24T10:35:00'));

    // First read after resume should detect completion and use endTimestamp (10:25)
    const stateAfterResume = getTimerState();
    expect(stateAfterResume.running).toBe(false);
    expect(stateAfterResume.minutes).toBe(25); // reset to full after completion

    expect(complete).toHaveBeenCalledTimes(1);
    expect(data.sessions).toHaveLength(1);
    const session = data.sessions[0];
    // Session time MUST be the true deadline 10:25, not 10:35 when we reopened
    const expectedEnd = new Date('2026-07-24T10:25:00').getTime();
    expect(session.time).toBe(expectedEnd);
    expect(new Date(session.time).toTimeString()).toContain('10:25');
    expect(session.duration).toBe(25);
    // History date also derived from endTimestamp
    expect(session.date).toBe(new Date(expectedEnd).toDateString());
  });

  it('when reopened BEFORE deadline, shows correct remaining time (not frozen at start)', () => {
    vi.setSystemTime(new Date('2026-07-24T14:00:00'));
    startTimer();

    // Suspend for 10 minutes — interval did not fire
    vi.setSystemTime(new Date('2026-07-24T14:10:00'));
    const state = getTimerState();
    // 10 minutes elapsed => 15 minutes remain
    expect(state.running).toBe(true);
    expect(state.minutes).toBe(15);
    expect(state.seconds).toBe(0);
  });

  it('pause preserves exact remaining even after background delay', () => {
    vi.setSystemTime(new Date('2026-07-24T09:00:00'));
    startTimer();
    // Advance 60 seconds with real ticks
    vi.advanceTimersByTime(60_000);
    // Now 24:00 remain
    expect(getTimerState().minutes).toBe(24);
    // Simulate user locking phone for 5 min before pausing (interval throttled)
    vi.setSystemTime(new Date('2026-07-24T09:06:00'));
    pauseTimer();
    const paused = getTimerState();
    // Should have 19 min remain (6 min elapsed total), not 24 min (frozen)
    expect(paused.minutes).toBe(19);
    expect(paused.running).toBe(false);
  });

  it('visibility resume handler syncs immediately — interval throttling cannot leave UI stale', async () => {
    vi.setSystemTime(new Date('2026-07-24T11:00:00'));
    startTimer();
    vi.advanceTimersByTime(2_000);
    expect(getTimerState().minutes).toBe(24);

    // Fast forward 5 minutes with NO interval ticks (suspend)
    vi.setSystemTime(new Date('2026-07-24T11:05:00'));
    // Simulate the document becoming visible again
    document.dispatchEvent(new Event('visibilitychange'));
    // Also trigger pageshow/focus as real OS does
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));

    const afterResume = getTimerState();
    expect(afterResume.minutes).toBe(20);
  });

  it('session appears under its REAL local date even when detection crosses midnight', () => {
    // Start at 23:50, 25-min timer ends at 00:15 next day
    vi.setSystemTime(new Date('2026-07-24T23:50:00'));
    const complete = vi.fn();
    onComplete(complete);
    setMode(0);
    startTimer();
    const endAt = new Date('2026-07-25T00:15:00').getTime();

    // User sleeps, phone locked, reopens at 00:20 next day
    vi.setSystemTime(new Date('2026-07-25T00:20:00'));
    // Trigger resume
    document.dispatchEvent(new Event('visibilitychange'));
    const state = getTimerState();
    expect(state.running).toBe(false);
    expect(data.sessions[0].time).toBe(endAt);
    expect(localISODate(new Date(data.sessions[0].time))).toBe('2026-07-25');
    expect(localISODate(new Date('2026-07-25T00:20:00'))).toBe('2026-07-25');
  });

  it('late detection does not inflate today counter for a yesterday session', async () => {
    // Start timer yesterday 23:55, ends 00:20 today? Let's do yesterday 22:00, ends 22:25 yesterday
    vi.setSystemTime(new Date('2026-07-24T22:00:00'));
    startTimer();
    const end = new Date('2026-07-24T22:25:00').getTime();
    // Reopen today 08:00 next day — heavily delayed detection
    vi.setSystemTime(new Date('2026-07-25T08:00:00'));
    getTimerState(); // triggers sync + completion
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].time).toBe(end);
    // Should NOT bump today's focusMinutes (which should stay 0, only history has yesterday)
    // getTodayFocusMinutes derives from sessions log, so today should be 0
    const { getTodayFocusMinutes } = await import('../src/modules/focusDaily.ts');
    expect(getTodayFocusMinutes()).toBe(0);
  });
});
