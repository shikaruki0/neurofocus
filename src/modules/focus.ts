/**
 * Focus Timer — Pomodoro (25min), Deep Work (52min), Flow State (90min).
 * Tracks sessions, awards XP, and survives reloads/background suspension.
 */

import { data, persist } from './data.ts';
import type { Session } from './data.ts';
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

/** Label used for custom blocks created by the mission planner. */
export const MISSION_BLOCK_LABEL = 'Mission Block';

/**
 * XP a focus block of `minutes` earns by default: preset XP for preset lengths
 * (25→40, 52→60, 90→100), otherwise 1 XP per minute — the same rule the manual
 * custom-duration flow uses. This keeps mission blocks fair no matter which
 * preset chip the user last tapped.
 */
export function xpForSessionMinutes(minutes: number): number {
  const preset = TIMER_MODES.find((mode) => mode.minutes === minutes);
  return preset ? preset.xp : Math.floor(minutes);
}

export interface TimerState {
  minutes: number;
  seconds: number;
  total: number;
  running: boolean;
  mode: number;
  modeLabel: string;
  /** True when running a custom mission block instead of a preset mode. */
  isCustom: boolean;
  /** XP that will be awarded on completion of the active session. */
  xp: number;
}

interface PersistedTimerState {
  version: 1;
  mode: number;
  remainingSeconds: number;
  running: boolean;
  endTimestamp: number | null;
  /** Custom block length (mission blocks that don't match a preset mode). */
  customMinutes?: number | null;
  customXp?: number | null;
  customLabel?: string | null;
}

const TIMER_STORAGE_KEY = 'focusTimer';

let currentMode = 0;
let remainingSeconds = TIMER_MODES[0].minutes * 60;
let totalSeconds = remainingSeconds;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let endTimestamp = 0;
let isCompleting = false;

// When set, the SAME timer runs a custom-length block instead of the preset mode.
// This is not a second timer — it reuses all countdown/start/pause/complete machinery.
let customMinutes: number | null = null;
let customXp: number | null = null;
let customLabel: string | null = null;

/** The active session length in minutes (custom block if set, else the preset mode). */
function activeMinutes(): number {
  return customMinutes !== null ? customMinutes : TIMER_MODES[currentMode].minutes;
}

/** The XP awarded on completion (custom block if set, else the preset mode). */
function activeXp(): number {
  return customXp !== null ? customXp : TIMER_MODES[currentMode].xp;
}

/** The label for the active session (custom block if set, else the preset mode). */
function activeLabel(): string {
  return customLabel !== null ? customLabel : TIMER_MODES[currentMode].label;
}

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
    customMinutes,
    customXp,
    customLabel,
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

  // Restore a custom mission block if one was persisted (same timer engine).
  if (
    typeof saved.customMinutes === 'number' &&
    Number.isFinite(saved.customMinutes) &&
    saved.customMinutes > 0
  ) {
    customMinutes = Math.floor(saved.customMinutes);
    customXp =
      typeof saved.customXp === 'number' && Number.isFinite(saved.customXp)
        ? saved.customXp
        : xpForSessionMinutes(customMinutes);
    customLabel = typeof saved.customLabel === 'string' ? saved.customLabel : null;
  } else {
    customMinutes = null;
    customXp = null;
    customLabel = null;
  }

  const maximum = activeMinutes() * 60;
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

/** Sets the timer mode and resets the current timer. Clears any custom block. */
export function setMode(modeIndex: number): void {
  if (!isValidMode(modeIndex)) return;
  stopTimer();
  customMinutes = null;
  customXp = null;
  customLabel = null;
  currentMode = modeIndex;
  remainingSeconds = TIMER_MODES[modeIndex].minutes * 60;
  totalSeconds = remainingSeconds;
  saveTimerState();
}

/**
 * Configures the SAME timer to run a custom-length mission block.
 * Reuses the existing countdown/start/pause/complete engine — no second timer.
 * When minutes matches a preset mode exactly, we fall back to that preset (so XP/label
 * stay consistent with the standard focus experience).
 */
export function setCustomBlock(minutes: number, options?: { xp?: number; label?: string }): void {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  stopTimer();
  const mins = Math.floor(minutes);
  const preset = TIMER_MODES.findIndex((m) => m.minutes === mins);
  if (preset !== -1 && options?.xp === undefined && options?.label === undefined) {
    // Exact preset match — behave like a normal mode change for consistency.
    customMinutes = null;
    customXp = null;
    customLabel = null;
    currentMode = preset;
  } else {
    customMinutes = mins;
    // Default XP derives from the block length itself — never from whichever preset
    // chip happens to be selected (that made a 25-min mission block pay out 100 XP).
    customXp = typeof options?.xp === 'number' ? options.xp : xpForSessionMinutes(mins);
    customLabel = typeof options?.label === 'string' ? options.label : null;
  }
  remainingSeconds = activeMinutes() * 60;
  totalSeconds = remainingSeconds;
  saveTimerState();
}

/** True when the timer is running a custom mission block (not a preset mode). */
export function isCustomBlock(): boolean {
  return customMinutes !== null;
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
  remainingSeconds = activeMinutes() * 60;
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

  // Preserve the exact preset object for standard modes; synthesize one for custom blocks.
  const mode: TimerMode =
    customMinutes !== null
      ? { minutes: activeMinutes(), xp: activeXp(), label: activeLabel() }
      : TIMER_MODES[currentMode];
  const today = todayStr();
  data.focusMinutes = (data.focusMinutes || 0) + mode.minutes;
  data.totalFocusMinutes = (data.totalFocusMinutes || 0) + mode.minutes;
  data.focusDate = today;
  // Record XP + label per session so Focus History can show exact daily XP and
  // keep mission/custom names even after the mission is cleared.
  data.sessions.push({
    date: today,
    time: Date.now(),
    duration: mode.minutes,
    xp: mode.xp,
    label: mode.label,
  });

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
    modeLabel: activeLabel(),
    isCustom: customMinutes !== null,
    xp: activeXp(),
  };
}

export function getRecentSessions(limit = 10): Session[] {
  return data.sessions.slice().reverse().slice(0, limit);
}

export function isFlowActive(): boolean {
  return data.flowState.date === todayStr() && data.flowState.sessions >= 3;
}

let onTickCallback: (state: TimerState) => void = () => {};
let onCompleteCallback: (mode: TimerMode) => void = () => {};
let completionListenerRegistered = false;
/**
 * A session may complete while the app is closed (deadline passed during restore,
 * before any UI listener is wired). We queue that completion exactly once so the
 * UI can replay it — crediting the mission block and refreshing the dashboard —
 * instead of silently losing it.
 */
let pendingCompletion: TimerMode | null = null;

export function onTick(fn: (state: TimerState) => void): void {
  onTickCallback = fn;
}
export function onComplete(fn: (mode: TimerMode) => void): void {
  completionListenerRegistered = true;
  onCompleteCallback = fn;
}
function notifyTick(): void {
  onTickCallback(getTimerState());
}
function notifyComplete(mode: TimerMode): void {
  if (!completionListenerRegistered) {
    pendingCompletion = mode;
    return;
  }
  onCompleteCallback(mode);
}

/**
 * Returns (once) a completion that fired before the UI registered its listener,
 * or null. Call right after onComplete() during app init.
 */
export function consumePendingCompletion(): TimerMode | null {
  const mode = pendingCompletion;
  pendingCompletion = null;
  return mode;
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
