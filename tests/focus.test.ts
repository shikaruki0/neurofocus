import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setMode,
  getTimerState,
  getRecentSessions,
  isFlowActive,
  TIMER_MODES,
  startTimer,
  pauseTimer,
  stopTimer,
  onTick,
  onComplete,
} from '../src/modules/focus.ts';
import { data } from '../src/modules/data.ts';

describe('Focus Timer', () => {
  beforeEach(() => {
    // Reset data values before each test
    data.focusMinutes = 0;
    data.totalFocusMinutes = 0;
    data.sessions = [];
    data.flowState = { date: '', sessions: 0 };
    data.dailyChecks = {};
    data.xp = 0;
    data.morningRitual = {
      date: '',
      completed: false,
      steps: [false, false, false, false, false],
    };
    setMode(0); // Reset to Pomodoro
    onTick(() => {});
    onComplete(() => {});
    vi.useRealTimers();
  });

  afterEach(() => {
    stopTimer();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes with default Pomodoro mode', () => {
    const state = getTimerState();
    expect(state.mode).toBe(0);
    expect(state.modeLabel).toBe('Pomodoro');
    expect(state.minutes).toBe(25);
    expect(state.seconds).toBe(0);
    expect(state.running).toBe(false);
  });

  it('changes mode successfully', () => {
    setMode(1); // Deep Work
    let state = getTimerState();
    expect(state.mode).toBe(1);
    expect(state.modeLabel).toBe('Deep Work');
    expect(state.minutes).toBe(52);

    setMode(2); // Flow State
    state = getTimerState();
    expect(state.mode).toBe(2);
    expect(state.modeLabel).toBe('Flow State');
    expect(state.minutes).toBe(90);
  });

  it('determines if flow state is active correctly', () => {
    const today = new Date().toDateString();
    data.flowState = { date: today, sessions: 2 };
    expect(isFlowActive()).toBe(false);

    data.flowState.sessions = 3;
    expect(isFlowActive()).toBe(true);

    data.flowState.sessions = 4;
    expect(isFlowActive()).toBe(true);
  });

  it('ignores invalid mode changes', () => {
    setMode(1);
    setMode(-1);
    setMode(TIMER_MODES.length);

    expect(getTimerState().mode).toBe(1);
  });

  it('pauses and resumes without losing elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:00:00'));

    const tick = vi.fn();
    onTick(tick);

    startTimer();
    vi.advanceTimersByTime(1000);
    pauseTimer();

    const pausedState = getTimerState();
    expect(pausedState.running).toBe(false);
    expect(pausedState.minutes).toBe(24);
    expect(pausedState.seconds).toBe(59);

    vi.advanceTimersByTime(5000);
    expect(getTimerState()).toMatchObject({ minutes: 24, seconds: 59, running: false });

    startTimer();
    vi.advanceTimersByTime(1000);
    expect(getTimerState()).toMatchObject({ minutes: 24, seconds: 58, running: true });
    expect(tick).toHaveBeenCalled();
  });

  it('completes a session, records progress, awards XP, and resets the timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:00:00'));

    const complete = vi.fn();
    onComplete(complete);

    startTimer();
    vi.advanceTimersByTime(TIMER_MODES[0].minutes * 60 * 1000);

    expect(complete).toHaveBeenCalledWith(TIMER_MODES[0]);
    expect(data.focusMinutes).toBe(25);
    expect(data.totalFocusMinutes).toBe(25);
    expect(data.sessions).toHaveLength(1);
    expect(data.flowState.sessions).toBe(1);
    expect(data.dailyChecks.dc6).toBe(true);
    expect(data.xp).toBe(40);
    expect(getTimerState()).toMatchObject({ minutes: 25, seconds: 0, running: false });
    expect(getRecentSessions(1)).toHaveLength(1);
  });
});
