/**
 * Focus Timer — Pomodoro (25min), Deep Work (52min), Flow State (90min).
 * Tracks sessions, awards XP, and survives reloads/background suspension.
 */

import { data, persist } from './data.ts';
import { get, remove, set } from './storage.ts';
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

interface PersistedTimerState {
  version: 1;
  mode: number;
  remainingSeconds: number;
  running: boolean;
  endTimestamp: number | null;
}

const TIMER_STORAGE_KEY = 'focusTimer';

let currentMode = 0;
let remainingSeconds = TIMER_MODES[0].minutes * 60;
let totalSeconds = remainingSeconds;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let endTimestamp = 0;
let isCompleting = false;

function isValidMode(mode: number): boolean {
  return Number.isInteger(mode) && mode >= 0 && mode < TIMER_MODES.length;
}

function saveTimerState(): void {
  set(TIMER_STORAGE_KEY, {
    version: 1,
    mode: currentMode,
    remainingSeconds,
    running: isRunning,
    endTimestamp: isRunning ? endTimestamp : null,
  } satisfies PersistedTimerState);
}

function clearTimerInterval(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** Recalculates from an absolute deadline so throttled background tabs stay accurate. */
function syncRunningTimer(): void {
  if (!isRunning) return;
  remainingSeconds = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
  if (remainingSeconds === 0) completeSession();
}

function scheduleTicks(): void {
  clearTimerInterval();
  intervalId = setInterval(() => {
    syncRunningTimer();
    notifyTick();
  }, 500);
}

function restoreTimerState(): void {
  const saved = get<Partial<PersistedTimerState> | null>(TIMER_STORAGE_KEY, null);
  if (!saved || saved.version !== 1 || !isValidMode(saved.mode ?? -1)) return;

  const mode = saved.mode as number;
  const maximum = TIMER_MODES[mode].minutes * 60;
  if (!Number.isFinite(saved.remainingSeconds) || saved.remainingSeconds! < 0) {
    remove(TIMER_STORAGE_KEY);
    return;
  }

  currentMode = mode;
  totalSeconds = maximum;
  remainingSeconds = Math.min(maximum, Math.ceil(saved.remainingSeconds!));

  if (saved.running && Number.isFinite(saved.endTimestamp) && saved.endTimestamp! > 0) {
    isRunning = true;
    endTimestamp = saved.endTimestamp!;
    syncRunningTimer();
    if (isRunning) scheduleTicks();
  }
}

/** Sets the timer mode and resets the current timer. */
export function setMode(modeIndex: number): void {
  if (!isValidMode(modeIndex)) return;
  stopTimer();
  currentMode = modeIndex;
  remainingSeconds = TIMER_MODES[modeIndex].minutes * 60;
  totalSeconds = remainingSeconds;
  saveTimerState();
}

/** Starts or resumes the timer. */
export function startTimer(): void {
  if (isRunning) return;
  isRunning = true;
  endTimestamp = Date.now() + remainingSeconds * 1000;
  saveTimerState();
  scheduleTicks();
  notifyTick();
}

/** Pauses the timer and preserves the exact remaining time. */
export function pauseTimer(): void {
  if (isRunning) {
    remainingSeconds = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
  }
  isRunning = false;
  endTimestamp = 0;
  clearTimerInterval();
  saveTimerState();
}

/** Stops and resets the timer to the selected mode's start. */
export function stopTimer(): void {
  isRunning = false;
  endTimestamp = 0;
  clearTimerInterval();
  remainingSeconds = TIMER_MODES[currentMode].minutes * 60;
  totalSeconds = remainingSeconds;
  saveTimerState();
}

/** Handles session completion exactly once and clears the active deadline first. */
function completeSession(): void {
  if (isCompleting) return;
  isCompleting = true;
  isRunning = false;
  endTimestamp = 0;
  clearTimerInterval();
  remove(TIMER_STORAGE_KEY);

  const mode = TIMER_MODES[currentMode];
  const today = todayStr();
  data.focusMinutes = (data.focusMinutes || 0) + mode.minutes;
  data.totalFocusMinutes = (data.totalFocusMinutes || 0) + mode.minutes;
  data.focusDate = today;
  data.sessions.push({ date: today, time: Date.now(), duration: mode.minutes });

  if (data.flowState.date !== today) data.flowState = { date: today, sessions: 0 };
  data.flowState.sessions = (data.flowState.sessions || 0) + 1;
  data.dailyChecks.dc6 = true;

  persist('focusMinutes');
  persist('totalFocusMinutes');
  persist('focusDate');
  persist('sessions');
  persist('flowState');
  persist('dailyChecks');
  addXP(mode.xp, 'Deep Work XP');

  remainingSeconds = mode.minutes * 60;
  totalSeconds = remainingSeconds;
  saveTimerState();
  isCompleting = false;
  notifyComplete(mode);
}

export function getTimerState(): TimerState {
  syncRunningTimer();
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    total: totalSeconds,
    running: isRunning,
    mode: currentMode,
    modeLabel: TIMER_MODES[currentMode].label,
  };
}

export function getRecentSessions(
  limit = 10,
): Array<{ date: string; time: number; duration: number }> {
  return data.sessions.slice().reverse().slice(0, limit);
}

export function isFlowActive(): boolean {
  return data.flowState.date === todayStr() && data.flowState.sessions >= 3;
}

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

// Restore immediately when the module loads. This is local-only and works offline.
restoreTimerState();

// Mobile browsers may throttle intervals; reconcile as soon as the app is visible again.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) {
      syncRunningTimer();
      notifyTick();
    }
  });
}
