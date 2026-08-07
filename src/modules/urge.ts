/**
 * Urge Surfing Timer — 20-minute countdown for urge resistance.
 * Based on the technique that urges peak at 20-30 min then fade.
 *
 * Mirrors focus.ts patterns: deadline-based countdown (survives background
 * throttling), 500ms sync interval, and persistence across reloads.
 */

import { get, remove, set } from './storage.ts';

const DEFAULT_DURATION = 20 * 60; // 20 minutes in seconds
const URGE_STORAGE_KEY = 'urgeTimer';

let remainingSeconds = DEFAULT_DURATION;
let totalSeconds = DEFAULT_DURATION;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let endTimestamp = 0;
let isCompleting = false;

interface PersistedUrgeState {
  version: 1;
  remainingSeconds: number;
  running: boolean;
  endTimestamp: number | null;
}

export interface UrgeState {
  minutes: number;
  seconds: number;
  total: number;
  running: boolean;
  pct: number;
}

let onTickCallback: (state: UrgeState) => void = () => {};
let onCompleteCallback: () => void = () => {};
let completionListenerRegistered = false;
/**
 * A completion may fire before any UI listener is wired (e.g. expiry during
 * restore). We queue it exactly once so the UI can replay it — mirroring
 * focus.ts consumePendingCompletion.
 */
let pendingCompletion: boolean = false;

function clearUrgeInterval(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function saveUrgeState(): void {
  set(URGE_STORAGE_KEY, {
    version: 1,
    remainingSeconds,
    running: isRunning,
    endTimestamp: isRunning ? endTimestamp : null,
  } satisfies PersistedUrgeState);
}

/** Recalculates from an absolute deadline so throttled background tabs stay accurate. */
function syncRunningTimer(): void {
  if (!isRunning) return;
  remainingSeconds = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
  if (remainingSeconds === 0) completeTimer();
}

function scheduleTicks(): void {
  clearUrgeInterval();
  intervalId = setInterval(() => {
    syncRunningTimer();
    onTickCallback(getState());
  }, 500);
}

function restoreUrgeState(): void {
  const saved = get<Partial<PersistedUrgeState> | null>(URGE_STORAGE_KEY, null);
  if (!saved || saved.version !== 1) return;

  if (
    typeof saved.remainingSeconds !== 'number' ||
    !Number.isFinite(saved.remainingSeconds) ||
    saved.remainingSeconds < 0
  ) {
    remove(URGE_STORAGE_KEY);
    return;
  }

  remainingSeconds = Math.min(DEFAULT_DURATION, Math.ceil(saved.remainingSeconds));
  totalSeconds = DEFAULT_DURATION;

  if (
    saved.running &&
    typeof saved.endTimestamp === 'number' &&
    Number.isFinite(saved.endTimestamp) &&
    saved.endTimestamp > 0
  ) {
    isRunning = true;
    endTimestamp = saved.endTimestamp;
    syncRunningTimer();
    if (isRunning) scheduleTicks();
  }
}

/**
 * Starts the urge timer.
 */
export function startTimer(): void {
  if (isRunning) return;
  isRunning = true;
  endTimestamp = Date.now() + remainingSeconds * 1000;
  saveUrgeState();
  scheduleTicks();
  onTickCallback(getState());
}

/**
 * Resets the timer to 20:00.
 */
export function resetTimer(): void {
  stopUrgeTimer();
  remainingSeconds = DEFAULT_DURATION;
  totalSeconds = DEFAULT_DURATION;
  saveUrgeState();
}

function stopUrgeTimer(): void {
  isRunning = false;
  endTimestamp = 0;
  clearUrgeInterval();
}

function completeTimer(): void {
  if (isCompleting) return;
  isCompleting = true;
  stopUrgeTimer();
  remainingSeconds = DEFAULT_DURATION;
  totalSeconds = DEFAULT_DURATION;
  remove(URGE_STORAGE_KEY);
  isCompleting = false;
  if (completionListenerRegistered) {
    onCompleteCallback();
  } else {
    pendingCompletion = true;
  }
}

/**
 * Gets current timer state.
 * @returns Urge state
 */
export function getState(): UrgeState {
  syncRunningTimer();
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    total: totalSeconds,
    running: isRunning,
    pct: (remainingSeconds / totalSeconds) * 100,
  };
}

export function onTick(fn: (state: UrgeState) => void): void {
  onTickCallback = fn;
}
export function onComplete(fn: () => void): void {
  completionListenerRegistered = true;
  onCompleteCallback = fn;
}

/**
 * Returns (once) a completion that fired before the UI registered its listener.
 * If there was a pending completion, calls the registered callback before returning.
 * Call right after onComplete() during app init.
 */
export function consumePendingCompletion(): boolean {
  const pending = pendingCompletion;
  pendingCompletion = false;
  if (pending && completionListenerRegistered) {
    onCompleteCallback();
  }
  return pending;
}

// Restore persisted state on module load.
restoreUrgeState();

// Mobile browsers may throttle intervals; reconcile on visibility change.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) {
      syncRunningTimer();
      onTickCallback(getState());
    }
  });
}
