import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setMode,
  getTimerState,
  getRecentSessions,
  isFlowActive,
  TIMER_MODES,
} from '../src/modules/focus.ts';
import { data } from '../src/modules/data.ts';

describe('Focus Timer', () => {
  beforeEach(() => {
    // Reset data values before each test
    data.focusMinutes = 0;
    data.totalFocusMinutes = 0;
    data.sessions = [];
    data.flowState = { date: '', sessions: 0 };
    setMode(0); // Reset to Pomodoro
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
});
