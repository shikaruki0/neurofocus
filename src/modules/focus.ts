/**
 * Focus Timer — Pomodoro (25min), Deep Work (52min), Flow State (90min).
 * Tracks sessions, awards XP, and triggers flow state after 3 sessions.
 */

import { data, persist } from './data.ts';
import { todayStr } from '../utils/date.ts';
import { addXP } from './xp.ts';

export interface TimerMode {
  minutes: number;
  label: string;
  xp: number;
}

export const TIMER_MODES: TimerMode[] = [
  { minutes: 25, label: 'Pomodoro', xp: 40 },
  { minutes: 52, label: 'Deep Work', xp: 60 },
  { minutes: 90, label: 'Flow State', xp: 100 },
];

export interface TimerState {
  minutes: number;
  seconds: number;
  total: number;
  running: boolean;
  mode: number;
  modeLabel: string;
}

let currentMode = 0;
let remainingSeconds = TIMER_MODES[0].minutes * 60;
let totalSeconds = remainingSeconds;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

let startTimestamp = 0; // tracks when timer started for background accuracy

/**
 * Sets the timer mode.
 * @param modeIndex - Index into TIMER_MODES
 */
export function setMode(modeIndex: number): void {
  if (modeIndex < 0 || modeIndex >= TIMER_MODES.length) return;
  stopTimer();
  currentMode = modeIndex;
  const mins = TIMER_MODES[modeIndex].minutes;
  remainingSeconds = mins * 60;
  totalSeconds = remainingSeconds;
}

/**
 * Starts or resumes the timer. Fixed: correctly resumes from paused state.
 */
export function startTimer(): void {
  if (isRunning) return;
  isRunning = true;
  // For accurate background timing, track start timestamp based on remaining time
  // remainingSeconds holds time left; totalSeconds is the full mode duration for progress calc
  // On resume, we set startTimestamp so that elapsed calculation yields correct remaining
  const elapsedBefore = totalSeconds - remainingSeconds;
  startTimestamp = Date.now() - elapsedBefore * 1000;

  intervalId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
    remainingSeconds = Math.max(0, totalSeconds - elapsed);
    notifyTick();

    if (remainingSeconds <= 0) {
      completeSession();
    }
  }, 500);
}

/**
 * Pauses the timer. Preserves remaining time for correct resume.
 */
export function pauseTimer(): void {
  if (!isRunning) {
    // Already paused, just clear interval safety
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    return;
  }
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  // Freeze remainingSeconds at pause time so resume is accurate
  if (startTimestamp) {
    const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
    remainingSeconds = Math.max(0, totalSeconds - elapsed);
  }
}

/**
 * Stops and resets the timer to mode start.
 */
export function stopTimer(): void {
  pauseTimer();
  const mins = TIMER_MODES[currentMode].minutes;
  remainingSeconds = mins * 60;
  totalSeconds = remainingSeconds;
}

/**
 * Handles session completion — awards XP, records session, updates flow.
 */
function completeSession(): void {
  pauseTimer();
  const mode = TIMER_MODES[currentMode];
  const today = todayStr();

  // Update focus minutes
  data.focusMinutes = (data.focusMinutes || 0) + mode.minutes;
  data.totalFocusMinutes = (data.totalFocusMinutes || 0) + mode.minutes;
  data.focusDate = today;

  // Record session
  data.sessions.push({
    date: today,
    time: Date.now(),
    duration: mode.minutes,
  });

  // Update flow state
  if (data.flowState.date !== today) {
    data.flowState = { date: today, sessions: 0 };
  }
  data.flowState.sessions = (data.flowState.sessions || 0) + 1;

  // Auto-check daily check #6 (neural training)
  data.dailyChecks.dc6 = true;

  persist('focusMinutes');
  persist('totalFocusMinutes');
  persist('focusDate');
  persist('sessions');
  persist('flowState');
  persist('dailyChecks');

  // Award XP
  addXP(mode.xp, 'Deep Work XP');

  // Reset timer
  remainingSeconds = mode.minutes * 60;
  totalSeconds = remainingSeconds;

  notifyComplete(mode);
}

/**
 * Gets current timer state.
 * @returns Timer state
 */
export function getTimerState(): TimerState {
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    total: totalSeconds,
    running: isRunning,
    mode: currentMode,
    modeLabel: TIMER_MODES[currentMode].label,
  };
}

/**
 * Gets recent focus sessions (most recent first).
 * @param limit - Maximum number of sessions
 * @returns Recent sessions
 */
export function getRecentSessions(
  limit = 10,
): Array<{ date: string; time: number; duration: number }> {
  return data.sessions.slice().reverse().slice(0, limit);
}

/**
 * Checks if flow state (3+ sessions) is active.
 * @returns True if flow state is active
 */
export function isFlowActive(): boolean {
  return data.flowState.date === todayStr() && data.flowState.sessions >= 3;
}

// --- Event callbacks (set by UI layer) ---
let onTickCallback: (state: TimerState) => void = () => {};
let onCompleteCallback: (mode: TimerMode) => void = () => {};

export function onTick(fn: (state: TimerState) => void): void {
  onTickCallback = fn;
}
export function onComplete(fn: (mode: TimerMode) => void): void {
  onCompleteCallback = fn;
}

function notifyTick(): void {
  onTickCallback(getTimerState());
}
function notifyComplete(mode: TimerMode): void {
  onCompleteCallback(mode);
}
